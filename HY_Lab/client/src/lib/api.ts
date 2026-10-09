export type SessionUser = {
  id: string;
  nickname: string;
  email: string;
  breakIntervalMin: number;
  scheduleQuietEnabled: boolean;
  trackingEnabled?: boolean;
  createdAt: string;
};

export type RiskZone = { level: "safe" | "notice" | "risk"; label: string };

export type Dashboard = {
  continuousSeconds: number;
  todaySeconds: number;
  todayMovementCount: number;
  breakIntervalMin: number;
  risk: RiskZone;
  quiet: boolean;
  trackingEnabled: boolean;
  lastMovedAt: string;
};

export type CalendarDay = {
  date: string;
  totalSeconds: number;
  movementCount: number;
  maxContinuousSeconds: number;
  edema: EdemaLevel | null;
};

export type EdemaLevel = "없음" | "약함" | "보통" | "심함";

export type ReminderTime = {
  id: string;
  day: number | null;
  time: string;
  label: string;
  enabled: boolean;
};

export type PeriodStat = { label: string; minutes: number; movements: number };

export type ScheduleBlock = {
  id: string;
  day: number | null;
  start: string;
  end: string;
  title: string;
  notify: boolean;
  date?: string;
  source?: "manual" | "ics";
};

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : undefined;
  if (!res.ok) {
    throw new ApiError((body && (body as any).error) || "요청 처리 중 오류가 발생했어요.");
  }
  return body as T;
}

export const api = {
  signup: (nickname: string, email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ nickname, email, password }) }),

  login: (email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  getUser: (id: string) => request<{ user: SessionUser }>(`/api/users/${id}`),

  updateUser: (id: string, patch: Partial<Pick<SessionUser, "nickname" | "breakIntervalMin" | "scheduleQuietEnabled" | "trackingEnabled">>) =>
    request<{ user: SessionUser }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  getDashboard: (id: string) => request<Dashboard>(`/api/dashboard/${id}`),

  heartbeat: (userId: string, seconds: number) =>
    request<{ todaySeconds: number; todayMovementCount: number }>("/api/heartbeat", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, seconds }),
    }),

  logMovement: (userId: string) =>
    request<{ todayMovementCount: number; continuousSeconds: number }>("/api/movements", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),

  getCalendar: (id: string, month: string) =>
    request<{ month: string; days: CalendarDay[] }>(`/api/calendar/${id}?month=${month}`),

  getConfig: () => request<{ googleClientId: string | null; vapidPublicKey: string | null; providers?: { kakao: boolean; naver: boolean; apple: boolean } }>("/api/config"),

  exchangeTicket: (ticket: string) =>
    request<{ user: SessionUser }>("/api/auth/exchange", { method: "POST", body: JSON.stringify({ ticket }) }),

  loginGoogle: (credential: string) =>
    request<{ user: SessionUser }>("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),

  getStats: (id: string, period: "weekly" | "monthly") =>
    request<{ period: string; items: PeriodStat[] }>(`/api/stats/${id}?period=${period}`),

  setSignal: (id: string, date: string, level: EdemaLevel | null) =>
    request<{ date: string; level: EdemaLevel | null }>(`/api/users/${id}/signal`, { method: "PUT", body: JSON.stringify({ date, level }) }),

  listReminders: (id: string) => request<{ reminders: ReminderTime[] }>(`/api/users/${id}/reminders`),

  addReminder: (id: string, r: Omit<ReminderTime, "id" | "enabled">) =>
    request<{ reminder: ReminderTime }>(`/api/users/${id}/reminders`, { method: "POST", body: JSON.stringify(r) }),

  updateReminder: (id: string, rid: string, patch: Partial<Omit<ReminderTime, "id">>) =>
    request<{ reminder: ReminderTime }>(`/api/users/${id}/reminders/${rid}`, { method: "PATCH", body: JSON.stringify(patch) }),

  removeReminder: (id: string, rid: string) => fetch(`/api/users/${id}/reminders/${rid}`, { method: "DELETE" }),

  subscribePush: (id: string, subscription: PushSubscriptionJSON) =>
    request<{ ok: boolean }>(`/api/users/${id}/push`, { method: "POST", body: JSON.stringify({ subscription }) }),

  unsubscribePush: (id: string, endpoint: string) =>
    fetch(`/api/users/${id}/push`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) }),

  importIcs: (id: string, source: { ics?: string; url?: string }) =>
    request<{ added: number; skipped: { allDay: number; past: number; unsupported: number }; blocks: ScheduleBlock[] }>(
      `/api/users/${id}/schedule/import`, { method: "POST", body: JSON.stringify(source) }),

  getWeekly: (id: string) => request<{ days: { date: string; minutes: number }[] }>(`/api/weekly/${id}`),

  listSchedule: (userId: string) => request<{ blocks: ScheduleBlock[] }>(`/api/users/${userId}/schedule`),

  addScheduleBlock: (userId: string, block: Omit<ScheduleBlock, "id">) =>
    request<{ block: ScheduleBlock }>(`/api/users/${userId}/schedule`, { method: "POST", body: JSON.stringify(block) }),

  updateScheduleBlock: (userId: string, blockId: string, patch: Partial<Omit<ScheduleBlock, "id">>) =>
    request<{ block: ScheduleBlock }>(`/api/users/${userId}/schedule/${blockId}`, { method: "PATCH", body: JSON.stringify(patch) }),

  removeScheduleBlock: (userId: string, blockId: string) =>
    fetch(`/api/users/${userId}/schedule/${blockId}`, { method: "DELETE" }),
};

export { ApiError };
