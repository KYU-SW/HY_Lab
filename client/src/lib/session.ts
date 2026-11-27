import type { SessionUser } from "./api";

const KEY = "sijakjeom_session_user";

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(user: SessionUser) {
  try {
    // 프로필 수정 응답에는 토큰이 없으므로 기존 토큰을 유지
    const token = user.token ?? loadSession()?.token;
    localStorage.setItem(KEY, JSON.stringify({ ...user, token }));
  } catch {
    /* 저장 실패는 조용히 무시 (프라이빗 모드 등) */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
