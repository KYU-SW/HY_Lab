import { enabledProviders, registerOAuthRoutes } from "./oauth";
import type { Express, Request, Response } from "express";
import {
  addHeartbeatSeconds,
  addPushSub,
  addReminder,
  addScheduleBlock,
  findOrCreateGoogleUser,
  getPeriodStats,
  listReminders,
  removePushSub,
  removeReminder,
  replaceIcsBlocks,
  setEdema,
  todayIso,
  updateReminder,
  createUser,
  findUserByEmail,
  getLastMovedAt,
  getMonthLog,
  getTodayLog,
  getUser,
  getWeeklyLog,
  hashPassword,
  isQuietNow,
  listSchedule,
  markMoved,
  publicUser,
  removeScheduleBlock,
  updateScheduleBlock,
  updateUser,
  verifyPassword,
} from "./db";
import { fetchIcsFromUrl, parseIcs } from "./ics";
import { getPublicKey } from "./push";

function riskZone(elapsedSeconds: number, breakIntervalMin: number) {
  const intervalSec = breakIntervalMin * 60;
  if (elapsedSeconds < intervalSec * 0.6) return { level: "safe", label: "편안함" };
  if (elapsedSeconds < intervalSec) return { level: "notice", label: "잠깐 전환" };
  return { level: "risk", label: "오래 앉음" };
}

function requireUser(req: Request, res: Response): string | null {
  const id = (req.params.id || req.params.userId || req.body?.user_id) as string | undefined;
  if (!id || !getUser(id)) {
    res.status(404).json({ error: "존재하지 않는 사용자입니다." });
    return null;
  }
  return id;
}

async function verifyGoogleCredential(credential: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("구글 로그인이 아직 설정되지 않았어요.");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("구글 인증에 실패했어요.");
  const info = (await res.json()) as { aud?: string; email?: string; email_verified?: string | boolean; name?: string };
  if (info.aud !== clientId || !info.email) throw new Error("구글 인증 정보가 올바르지 않아요.");
  if (info.email_verified !== true && info.email_verified !== "true") throw new Error("이메일이 확인되지 않은 구글 계정이에요.");
  return { email: info.email, name: info.name ?? "" };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function registerApiRoutes(app: Express) {
  // ---------- 공개 설정 (구글 클라이언트 ID, 푸시 공개키) ----------

  app.get("/api/config", (_req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, vapidPublicKey: getPublicKey(), providers: enabledProviders() });
  });

  registerOAuthRoutes(app);

  app.post("/api/auth/google", async (req, res) => {
    try {
      const { email, name } = await verifyGoogleCredential(String(req.body?.credential ?? ""));
      res.json({ user: publicUser(findOrCreateGoogleUser(email, name)) });
    } catch (e) {
      res.status(401).json({ error: e instanceof Error ? e.message : "구글 로그인에 실패했어요." });
    }
  });

  // ---------- 인증 ----------

  app.post("/api/auth/signup", (req, res) => {
    const { nickname, email, password } = req.body ?? {};
    if (!nickname || !email || !password) {
      return res.status(400).json({ error: "닉네임, 이메일, 비밀번호를 모두 입력해주세요." });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "비밀번호는 4자 이상이어야 해요." });
    }
    const user = createUser(String(nickname).trim(), String(email).trim(), String(password));
    if (!user) return res.status(409).json({ error: "이미 가입된 이메일입니다." });
    res.status(201).json({ user: publicUser(user) });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body ?? {};
    const user = findUserByEmail(String(email ?? ""));
    if (!user || !verifyPassword(String(password ?? ""), user.salt, user.passwordHash)) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }
    res.json({ user: publicUser(user) });
  });

  // ---------- 사용자 ----------

  app.get("/api/users/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    res.json({ user: publicUser(getUser(id)!) });
  });

  app.patch("/api/users/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const { nickname, breakIntervalMin, scheduleQuietEnabled, trackingEnabled } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof nickname === "string") {
      const trimmed = nickname.trim();
      if (!trimmed || trimmed.length > 20) return res.status(400).json({ error: "닉네임은 1~20자로 입력해주세요." });
      patch.nickname = trimmed;
    }
    if (typeof breakIntervalMin === "number") patch.breakIntervalMin = breakIntervalMin;
    if (typeof scheduleQuietEnabled === "boolean") patch.scheduleQuietEnabled = scheduleQuietEnabled;
    if (typeof trackingEnabled === "boolean") patch.trackingEnabled = trackingEnabled;
    const user = updateUser(id, patch);
    res.json({ user: publicUser(user!) });
  });

  // ---------- 앉은 시간 / 대시보드 ----------

  app.get("/api/dashboard/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const user = getUser(id)!;
    const lastMovedAt = getLastMovedAt(id);
    const trackingEnabled = user.trackingEnabled !== false;
    const elapsedSeconds = trackingEnabled ? Math.max(0, Math.round((Date.now() - new Date(lastMovedAt).getTime()) / 1000)) : 0;
    const today = getTodayLog(id);
    const zone = riskZone(elapsedSeconds, user.breakIntervalMin);
    res.json({
      continuousSeconds: elapsedSeconds,
      todaySeconds: today.totalSeconds,
      todayMovementCount: today.movementCount,
      breakIntervalMin: user.breakIntervalMin,
      risk: zone,
      quiet: isQuietNow(id),
      trackingEnabled,
      lastMovedAt,
    });
  });

  app.post("/api/heartbeat", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    // 타이머가 꺼져 있으면 좌식시간을 누적하지 않음
    const seconds = getUser(id)!.trackingEnabled === false ? 0 : Number(req.body?.seconds ?? 0);
    const dayLog = addHeartbeatSeconds(id, seconds);
    res.json({ todaySeconds: dayLog.totalSeconds, todayMovementCount: dayLog.movementCount });
  });

  app.post("/api/movements", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    markMoved(id);
    const today = getTodayLog(id);
    res.json({ todayMovementCount: today.movementCount, continuousSeconds: 0 });
  });

  app.get("/api/weekly/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    res.json({ days: getWeeklyLog(id, 7) });
  });

  app.get("/api/calendar/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const month = String(req.query.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month=YYYY-MM 형식이 필요해요." });
    res.json({ month, days: getMonthLog(id, month) });
  });

  app.get("/api/stats/:id", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const kind = req.query.period === "monthly" ? "monthly" : "weekly";
    res.json({ period: kind, items: getPeriodStats(id, kind, 7) });
  });

  app.put("/api/users/:id/signal", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const { date, level } = req.body ?? {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || String(date) > todayIso()) {
      return res.status(400).json({ error: "올바른 날짜가 아니에요." });
    }
    if (level !== null && !["없음", "약함", "보통", "심함"].includes(level)) {
      return res.status(400).json({ error: "올바른 부종 정도가 아니에요." });
    }
    setEdema(id, String(date), level);
    res.json({ date, level });
  });

  // ---------- 지정 시각 알림 ----------

  app.get("/api/users/:id/reminders", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    res.json({ reminders: listReminders(id) });
  });

  app.post("/api/users/:id/reminders", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const { day, time, label } = req.body ?? {};
    if (!HHMM.test(String(time))) return res.status(400).json({ error: "시간은 HH:MM 형식이어야 해요." });
    const reminder = addReminder(id, {
      day: day === null || day === undefined || day === "" ? null : Number(day),
      time: String(time),
      label: String(label ?? "").slice(0, 40),
      enabled: true,
    });
    res.status(201).json({ reminder });
  });

  app.patch("/api/users/:id/reminders/:rid", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const patch: Record<string, unknown> = {};
    if ("day" in (req.body ?? {})) patch.day = req.body.day === null ? null : Number(req.body.day);
    if (typeof req.body?.time === "string" && HHMM.test(req.body.time)) patch.time = req.body.time;
    if (typeof req.body?.label === "string") patch.label = req.body.label.slice(0, 40);
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    const reminder = updateReminder(id, req.params.rid, patch);
    if (!reminder) return res.status(404).json({ error: "알림을 찾을 수 없어요." });
    res.json({ reminder });
  });

  app.delete("/api/users/:id/reminders/:rid", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    removeReminder(id, req.params.rid);
    res.status(204).end();
  });

  // ---------- 웹 푸시 구독 ----------

  app.post("/api/users/:id/push", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ error: "구독 정보가 올바르지 않아요." });
    addPushSub(id, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    res.status(201).json({ ok: true });
  });

  app.delete("/api/users/:id/push", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    if (req.body?.endpoint) removePushSub(id, String(req.body.endpoint));
    res.status(204).end();
  });

  // ---------- 캘린더(.ics) 가져오기 ----------

  app.post("/api/users/:id/schedule/import", async (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    try {
      const text = req.body?.ics ? String(req.body.ics) : await fetchIcsFromUrl(String(req.body?.url ?? ""));
      if (!text.includes("BEGIN:VCALENDAR")) return res.status(400).json({ error: "캘린더(.ics) 형식이 아니에요." });
      const { blocks, skipped } = parseIcs(text);
      const added = replaceIcsBlocks(id, blocks);
      res.json({ added: added.length, skipped, blocks: listSchedule(id) });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "캘린더를 가져오지 못했어요." });
    }
  });

  // ---------- 수동 시간표 (알림 on/off 스케줄) ----------

  app.get("/api/users/:id/schedule", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    res.json({ blocks: listSchedule(id) });
  });

  app.post("/api/users/:id/schedule", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const { day, start, end, title, notify } = req.body ?? {};
    if (!start || !end) return res.status(400).json({ error: "시작/종료 시간을 입력해주세요." });
    const block = addScheduleBlock(id, {
      day: day === null || day === undefined || day === "" ? null : Number(day),
      start: String(start),
      end: String(end),
      title: String(title ?? "일정"),
      notify: Boolean(notify),
    });
    res.status(201).json({ block });
  });

  app.patch("/api/users/:id/schedule/:blockId", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if ("day" in b) patch.day = b.day === null || b.day === "" ? null : Number(b.day);
    if (typeof b.start === "string" && HHMM.test(b.start)) patch.start = b.start;
    if (typeof b.end === "string" && HHMM.test(b.end)) patch.end = b.end;
    if (typeof b.title === "string") patch.title = b.title.slice(0, 40);
    if (typeof b.notify === "boolean") patch.notify = b.notify;
    const block = updateScheduleBlock(id, req.params.blockId, patch);
    if (!block) return res.status(404).json({ error: "일정을 찾을 수 없습니다." });
    res.json({ block });
  });

  app.delete("/api/users/:id/schedule/:blockId", (req, res) => {
    const id = requireUser(req, res);
    if (!id) return;
    removeScheduleBlock(id, req.params.blockId);
    res.status(204).end();
  });
}
