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
    localStorage.setItem(KEY, JSON.stringify(user));
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
