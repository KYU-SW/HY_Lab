import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// process.cwd() 기준으로 고정 (esbuild로 번들된 뒤에는 import.meta.dirname이
// dist/ 를 가리켜서, 빌드할 때마다 데이터가 날아갈 수 있기 때문)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "server", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

export type ScheduleBlock = {
  id: string;
  day: number | null; // 0=일 ... 6=토, null=매일
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  notify: boolean; // true=이 시간대에도 알림, false=무음
  date?: string; // 있으면 그 날짜 하루만 적용 (ICS 일회성 일정), 없으면 요일 반복
  source?: "manual" | "ics"; // ics: 캘린더 가져오기로 생성 (재가져오기 시 교체 대상)
};

export type ReminderTime = {
  id: string;
  day: number | null; // null = 매일
  time: string; // "HH:MM"
  label: string;
  enabled: boolean;
};

export type EdemaLevel = "없음" | "약함" | "보통" | "심함";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export type User = {
  id: string;
  nickname: string;
  email: string;
  salt: string;
  passwordHash: string;
  breakIntervalMin: number; // 권장 휴식 주기 (분)
  scheduleQuietEnabled: boolean;
  trackingEnabled?: boolean; // 좌식 타이머 온/오프 (없으면 켜짐)
  createdAt: string;
};

export type DayLog = {
  totalSeconds: number;
  movementCount: number;
  maxContinuousSeconds?: number; // 그날 가장 오래 연속으로 앉아있던 시간
  edema?: EdemaLevel; // 그날 기록한 부종 정도
};

type DB = {
  users: Record<string, User>;
  sitting: Record<string, Record<string, DayLog>>; // userId -> date(YYYY-MM-DD) -> log
  state: Record<string, { lastMovedAt: string }>; // userId -> continuous timer anchor
  schedule: Record<string, ScheduleBlock[]>; // userId -> blocks
  reminders: Record<string, ReminderTime[]>; // userId -> 지정 시각 알림
  pushSubs: Record<string, PushSub[]>; // userId -> 웹 푸시 구독
  vapid?: { publicKey: string; privateKey: string };
};

function emptyDb(): DB {
  return { users: {}, sitting: {}, state: {}, schedule: {}, reminders: {}, pushSubs: {} };
}

function load(): DB {
  try {
    if (!fs.existsSync(DB_PATH)) return emptyDb();
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch {
    return emptyDb();
  }
}

function save(db: DB) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// 모든 작업은 단순하게 매번 load/save 하는 구조 (동시성 요구가 낮은 소규모 프로토타입용)
let db = load();

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

export function todayIso(tz = "Asia/Seoul") {
  const now = new Date();
  // en-CA locale gives YYYY-MM-DD
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}

export function nowInSeoul() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: weekdayMap[weekdayStr] ?? 0, minutes: Number(hour) * 60 + Number(minute) };
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ---------- Users ----------

export function createUser(nickname: string, email: string, password: string): User | null {
  const exists = Object.values(db.users).find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return null;
  const { salt, hash } = hashPassword(password);
  const user: User = {
    id: crypto.randomUUID(),
    nickname,
    email,
    salt,
    passwordHash: hash,
    breakIntervalMin: 30,
    scheduleQuietEnabled: true,
    createdAt: new Date().toISOString(),
  };
  db.users[user.id] = user;
  db.state[user.id] = { lastMovedAt: new Date().toISOString() };
  db.schedule[user.id] = [];
  save(db);
  return user;
}

export function findUserByEmail(email: string): User | undefined {
  return Object.values(db.users).find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUser(id: string): User | undefined {
  return db.users[id];
}

export function updateUser(id: string, patch: Partial<Pick<User, "nickname" | "breakIntervalMin" | "scheduleQuietEnabled" | "trackingEnabled">>) {
  const user = db.users[id];
  if (!user) return undefined;
  const wasOn = user.trackingEnabled !== false;
  if (wasOn && patch.trackingEnabled === false) {
    // 끄는 순간까지의 연속 좌식시간을 그날 최대값에 반영
    const userLog = (db.sitting[id] ??= {});
    const dayLog = (userLog[todayIso()] ??= { totalSeconds: 0, movementCount: 0 });
    bumpMaxContinuous(id, dayLog);
  }
  Object.assign(user, patch);
  // 꺼져 있다가 다시 켜면 연속 좌식시간을 0부터 새로 시작
  if (!wasOn && user.trackingEnabled !== false) {
    db.state[id] = { lastMovedAt: new Date().toISOString() };
  }
  save(db);
  return user;
}

// ---------- Sitting / 연속 좌식 ----------

export function getLastMovedAt(userId: string): string {
  if (!db.state[userId]) db.state[userId] = { lastMovedAt: new Date().toISOString() };
  return db.state[userId].lastMovedAt;
}

function bumpMaxContinuous(userId: string, dayLog: DayLog) {
  if (db.users[userId]?.trackingEnabled === false) return; // 꺼져 있는 동안은 연속 좌식으로 보지 않음
  const last = db.state[userId]?.lastMovedAt;
  if (!last) return;
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 1000));
  if (elapsed > (dayLog.maxContinuousSeconds ?? 0)) dayLog.maxContinuousSeconds = elapsed;
}

export function markMoved(userId: string) {
  const date = todayIso();
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[date] ??= { totalSeconds: 0, movementCount: 0 });
  bumpMaxContinuous(userId, dayLog); // 리셋 직전의 연속 좌식시간을 최대값에 반영
  db.state[userId] = { lastMovedAt: new Date().toISOString() };
  dayLog.movementCount += 1;
  save(db);
}

export function addHeartbeatSeconds(userId: string, seconds: number) {
  const safeSeconds = Math.max(0, Math.min(seconds, 120)); // 한 번에 과도하게 누적되는 것 방지
  const date = todayIso();
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[date] ??= { totalSeconds: 0, movementCount: 0 });
  dayLog.totalSeconds += safeSeconds;
  bumpMaxContinuous(userId, dayLog);
  save(db);
  return dayLog;
}

export function getMonthLog(userId: string, month: string) {
  // month: "YYYY-MM"
  const logs = db.sitting[userId] ?? {};
  return Object.entries(logs)
    .filter(([date]) => date.startsWith(month))
    .map(([date, log]) => ({
      date,
      totalSeconds: log.totalSeconds,
      movementCount: log.movementCount,
      maxContinuousSeconds: log.maxContinuousSeconds ?? 0,
      edema: log.edema ?? null,
    }));
}

export function getTodayLog(userId: string): DayLog {
  const date = todayIso();
  return db.sitting[userId]?.[date] ?? { totalSeconds: 0, movementCount: 0 };
}

export function getWeeklyLog(userId: string, days = 7): { date: string; minutes: number }[] {
  const result: { date: string; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const seconds = db.sitting[userId]?.[iso]?.totalSeconds ?? 0;
    result.push({ date: iso, minutes: Math.round(seconds / 60) });
  }
  return result;
}

// ---------- Schedule (수동 시간표 -> 알림 on/off) ----------

export function listSchedule(userId: string): ScheduleBlock[] {
  return db.schedule[userId] ?? [];
}

export function addScheduleBlock(userId: string, block: Omit<ScheduleBlock, "id">): ScheduleBlock {
  const entry: ScheduleBlock = { ...block, id: crypto.randomUUID() };
  const list = (db.schedule[userId] ??= []);
  list.push(entry);
  save(db);
  return entry;
}

export function updateScheduleBlock(userId: string, blockId: string, patch: Partial<Omit<ScheduleBlock, "id">>) {
  const list = db.schedule[userId] ?? [];
  const block = list.find((b) => b.id === blockId);
  if (!block) return undefined;
  Object.assign(block, patch);
  save(db);
  return block;
}

export function removeScheduleBlock(userId: string, blockId: string) {
  const list = db.schedule[userId] ?? [];
  const next = list.filter((b) => b.id !== blockId);
  db.schedule[userId] = next;
  save(db);
}

export function isQuietNow(userId: string): boolean {
  const user = db.users[userId];
  if (!user || !user.scheduleQuietEnabled) return false;
  const { day, minutes } = nowInSeoul();
  const list = db.schedule[userId] ?? [];
  return list.some((b) => {
    if (b.notify) return false; // notify=true면 알림 유지 대상이라 무음 아님
    if (b.date) {
      if (b.date !== todayIso()) return false;
    } else if (b.day !== null && b.day !== day) return false;
    const start = toMinutes(b.start);
    const end = toMinutes(b.end);
    return minutes >= start && minutes < end;
  });
}

export function publicUser(user: User) {
  const { passwordHash, salt, ...rest } = user;
  return rest;
}


// ---------- 구글 로그인 ----------

export function findOrCreateGoogleUser(email: string, name: string): User {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  // 비밀번호 없이 구글로만 로그인하는 계정: 무작위 비밀번호로 채워둠
  const user = createUser(name || email.split("@")[0], email, crypto.randomBytes(24).toString("hex"));
  return user!;
}

// 카카오/네이버/애플: 이메일을 주면 같은 이메일 계정에 연결, 안 주면 제공자 ID 기반 가상 이메일 사용
export function findOrCreateSocialUser(provider: string, providerId: string, email: string | null, name: string): User {
  const key = email && email.includes("@") ? email : `${provider}_${providerId}@social.sijakjeom.local`;
  const existing = findUserByEmail(key);
  if (existing) return existing;
  return createUser((name || key.split("@")[0]).slice(0, 20), key, crypto.randomBytes(24).toString("hex"))!;
}

// ---------- 통계 (주간/월간) ----------

export function getPeriodStats(userId: string, kind: "weekly" | "monthly", count = 7) {
  const logs = db.sitting[userId] ?? {};
  const out: { label: string; minutes: number; movements: number }[] = [];
  const now = new Date(todayIso() + "T00:00:00+09:00");
  if (kind === "weekly") {
    // 이번 주(일요일 시작)부터 거꾸로 count주
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    for (let i = count - 1; i >= 0; i--) {
      const ws = new Date(start);
      ws.setDate(ws.getDate() - i * 7);
      let sec = 0, mv = 0;
      for (let d = 0; d < 7; d++) {
        const day = new Date(ws);
        day.setDate(day.getDate() + d);
        const iso = day.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
        sec += logs[iso]?.totalSeconds ?? 0;
        mv += logs[iso]?.movementCount ?? 0;
      }
      out.push({ label: i === 0 ? "이번주" : `${i}주전`, minutes: Math.round(sec / 60), movements: mv });
    }
  } else {
    const y = now.getFullYear(), m = now.getMonth();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let sec = 0, mv = 0;
      for (const [date, log] of Object.entries(logs)) {
        if (date.startsWith(key)) { sec += log.totalSeconds; mv += log.movementCount; }
      }
      out.push({ label: i === 0 ? "이번달" : `${d.getMonth() + 1}월`, minutes: Math.round(sec / 60), movements: mv });
    }
  }
  return out;
}

// ---------- 부종 기록 ----------

export function setEdema(userId: string, date: string, level: EdemaLevel | null) {
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[date] ??= { totalSeconds: 0, movementCount: 0 });
  if (level) dayLog.edema = level; else delete dayLog.edema;
  save(db);
}

// ---------- 지정 시각 알림 ----------

export function listReminders(userId: string): ReminderTime[] {
  return db.reminders[userId] ?? [];
}

export function addReminder(userId: string, r: Omit<ReminderTime, "id">): ReminderTime {
  const entry: ReminderTime = { ...r, id: crypto.randomUUID() };
  (db.reminders[userId] ??= []).push(entry);
  save(db);
  return entry;
}

export function updateReminder(userId: string, id: string, patch: Partial<Omit<ReminderTime, "id">>) {
  const r = (db.reminders[userId] ?? []).find((x) => x.id === id);
  if (!r) return undefined;
  Object.assign(r, patch);
  save(db);
  return r;
}

export function removeReminder(userId: string, id: string) {
  db.reminders[userId] = (db.reminders[userId] ?? []).filter((x) => x.id !== id);
  save(db);
}

// ---------- ICS 가져오기 ----------

export function replaceIcsBlocks(userId: string, blocks: Omit<ScheduleBlock, "id">[]) {
  const kept = (db.schedule[userId] ?? []).filter((b) => b.source !== "ics");
  const added = blocks.map((b) => ({ ...b, id: crypto.randomUUID(), source: "ics" as const }));
  db.schedule[userId] = [...kept, ...added];
  save(db);
  return added;
}

// ---------- 웹 푸시 ----------

export function getVapid() { return db.vapid; }
export function setVapid(v: { publicKey: string; privateKey: string }) { db.vapid = v; save(db); }

export function addPushSub(userId: string, sub: PushSub) {
  const list = (db.pushSubs[userId] ??= []);
  if (!list.some((s) => s.endpoint === sub.endpoint)) list.push(sub);
  save(db);
}

export function removePushSub(userId: string, endpoint: string) {
  db.pushSubs[userId] = (db.pushSubs[userId] ?? []).filter((s) => s.endpoint !== endpoint);
  save(db);
}

export function getPushSubs(userId: string): PushSub[] { return db.pushSubs[userId] ?? []; }
export function allUserIds(): string[] { return Object.keys(db.users); }
