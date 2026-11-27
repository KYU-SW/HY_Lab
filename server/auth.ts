import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getSecret, getUser, publicUser, type User } from "./db";

// 로그인 토큰: "사용자ID.만료시각.서명". 서명은 서버 비밀키(HMAC-SHA256)로 만든다.
// 로그인할 때 발급하고, 이후 모든 /api 요청은 Authorization: Bearer <토큰> 으로 본인 확인을 한다.
const TTL_MS = 60 * 24 * 3600 * 1000; // 60일

const sign = (body: string) => crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");

export function issueToken(userId: string) {
  const body = `${userId}.${Date.now() + TTL_MS}`;
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!(Number(exp) > Date.now())) return null;
  return getUser(id) ? id : null;
}

/** 로그인 응답: 사용자 정보 + 토큰 */
export const authed = (user: User) => ({ user: { ...publicUser(user), token: issueToken(user.id) } });

/** 공개 경로(설정, 로그인·가입·소셜 로그인)를 빼고는 토큰 필수 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/config" || req.path.startsWith("/auth/")) return next();
  const h = req.headers.authorization ?? "";
  const userId = h.startsWith("Bearer ") ? verifyToken(h.slice(7)) : null;
  if (!userId) return res.status(401).json({ error: "다시 로그인해주세요." });
  (req as Request & { authUserId?: string }).authUserId = userId;
  next();
}
