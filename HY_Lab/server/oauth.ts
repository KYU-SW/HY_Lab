import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { findOrCreateSocialUser, publicUser } from "./db";

type Provider = "kakao" | "naver" | "apple";
type Profile = { id: string; email: string | null; name: string };

const env = (k: string) => process.env[k]?.trim() || "";

export function enabledProviders() {
  return {
    kakao: !!env("KAKAO_REST_API_KEY"),
    naver: !!(env("NAVER_CLIENT_ID") && env("NAVER_CLIENT_SECRET")),
    apple: !!(env("APPLE_CLIENT_ID") && env("APPLE_TEAM_ID") && env("APPLE_KEY_ID") && env("APPLE_PRIVATE_KEY")),
  };
}

function baseUrl(req: Request) {
  if (env("PUBLIC_BASE_URL")) return env("PUBLIC_BASE_URL").replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${req.get("host")}`;
}
const redirectUri = (req: Request, p: Provider) => `${baseUrl(req)}/api/auth/${p}/callback`;

// state(로그인 시도 확인) / 일회용 로그인 코드: 메모리 보관, 5분 만료
const states = new Map<string, number>();
const tickets = new Map<string, { user: ReturnType<typeof publicUser>; exp: number }>();
function sweep() {
  const now = Date.now();
  for (const [k, v] of Array.from(states)) if (v < now) states.delete(k);
  for (const [k, v] of Array.from(tickets)) if (v.exp < now) tickets.delete(k);
}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error_description || json.error || "토큰 발급에 실패했어요.");
  return json;
}
async function getJson(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("프로필을 불러오지 못했어요.");
  return json;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "ES256", kid: env("APPLE_KEY_ID") }));
  const body = b64u(JSON.stringify({ iss: env("APPLE_TEAM_ID"), iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: env("APPLE_CLIENT_ID") }));
  const key = env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

async function fetchProfile(p: Provider, code: string, req: Request, extra?: { appleName?: string }): Promise<Profile> {
  const ru = redirectUri(req, p);
  if (p === "kakao") {
    const tok = await postForm("https://kauth.kakao.com/oauth/token", {
      grant_type: "authorization_code", client_id: env("KAKAO_REST_API_KEY"), redirect_uri: ru, code,
      ...(env("KAKAO_CLIENT_SECRET") ? { client_secret: env("KAKAO_CLIENT_SECRET") } : {}),
    });
    const me = await getJson("https://kapi.kakao.com/v2/user/me", tok.access_token);
    return { id: String(me.id), email: me.kakao_account?.email ?? null, name: me.kakao_account?.profile?.nickname ?? me.properties?.nickname ?? "카카오 사용자" };
  }
  if (p === "naver") {
    const tok = await postForm("https://nid.naver.com/oauth2.0/token", {
      grant_type: "authorization_code", client_id: env("NAVER_CLIENT_ID"), client_secret: env("NAVER_CLIENT_SECRET"), code, state: "x",
    });
    const me = await getJson("https://openapi.naver.com/v1/nid/me", tok.access_token);
    const r = me.response ?? {};
    return { id: String(r.id), email: r.email ?? null, name: r.nickname || r.name || "네이버 사용자" };
  }
  const tok = await postForm("https://appleid.apple.com/auth/token", {
    grant_type: "authorization_code", client_id: env("APPLE_CLIENT_ID"), client_secret: appleClientSecret(), redirect_uri: ru, code,
  });
  // 애플 서버에서 직접 받은 id_token이라 서명 검증 없이 payload를 읽어도 안전함
  const payload = JSON.parse(Buffer.from(String(tok.id_token).split(".")[1], "base64url").toString());
  return { id: String(payload.sub), email: payload.email ?? null, name: extra?.appleName || "Apple 사용자" };
}

export function registerOAuthRoutes(app: Express) {
  const providers: Provider[] = ["kakao", "naver", "apple"];

  app.get("/api/auth/:provider/start", (req: Request, res: Response) => {
    const p = req.params.provider as Provider;
    if (!providers.includes(p) || !enabledProviders()[p]) return res.redirect("/?login_error=" + encodeURIComponent("이 로그인은 아직 설정되지 않았어요."));
    sweep();
    const state = crypto.randomBytes(16).toString("hex");
    states.set(state, Date.now() + 5 * 60_000);
    const ru = redirectUri(req, p);
    let url: string;
    if (p === "kakao") url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${env("KAKAO_REST_API_KEY")}&redirect_uri=${encodeURIComponent(ru)}&state=${state}`;
    else if (p === "naver") url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${env("NAVER_CLIENT_ID")}&redirect_uri=${encodeURIComponent(ru)}&state=${state}`;
    else url = `https://appleid.apple.com/auth/authorize?response_type=code&response_mode=form_post&scope=${encodeURIComponent("name email")}&client_id=${env("APPLE_CLIENT_ID")}&redirect_uri=${encodeURIComponent(ru)}&state=${state}`;
    res.redirect(url);
  });

  const callback = async (req: Request, res: Response) => {
    const p = req.params.provider as Provider;
    const q: Record<string, any> = { ...req.query, ...(req.body ?? {}) };
    const fail = (msg: string) => res.redirect("/?login_error=" + encodeURIComponent(msg));
    try {
      if (!providers.includes(p) || !enabledProviders()[p]) return fail("이 로그인은 아직 설정되지 않았어요.");
      if (q.error) return fail("로그인이 취소됐어요.");
      const state = String(q.state ?? "");
      const exp = states.get(state);
      states.delete(state);
      if (!exp || exp < Date.now()) return fail("로그인 시간이 만료됐어요. 다시 시도해주세요.");
      let appleName: string | undefined;
      if (p === "apple" && q.user) {
        try { const u = JSON.parse(String(q.user)); appleName = [u.name?.lastName, u.name?.firstName].filter(Boolean).join(""); } catch { /* 무시 */ }
      }
      const profile = await fetchProfile(p, String(q.code ?? ""), req, { appleName });
      const user = findOrCreateSocialUser(p, profile.id, profile.email, profile.name);
      const ticket = crypto.randomBytes(24).toString("hex");
      tickets.set(ticket, { user: publicUser(user), exp: Date.now() + 2 * 60_000 });
      res.redirect(`/?login_ticket=${ticket}`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "로그인에 실패했어요.");
    }
  };
  app.get("/api/auth/:provider/callback", callback);
  app.post("/api/auth/:provider/callback", callback);

  // 주소창에 사용자 정보를 남기지 않도록, 일회용 티켓을 사용자 정보로 교환
  app.post("/api/auth/exchange", (req: Request, res: Response) => {
    sweep();
    const t = tickets.get(String(req.body?.ticket ?? ""));
    tickets.delete(String(req.body?.ticket ?? ""));
    if (!t || t.exp < Date.now()) return res.status(401).json({ error: "로그인 정보가 만료됐어요. 다시 시도해주세요." });
    res.json({ user: t.user });
  });
}
