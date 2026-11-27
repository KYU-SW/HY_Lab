import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { summarizeDay, goalSuggestion, EXERCISE_BY_ID, type BodyProfile, type DaySummary, type MoveRecord, type PlanSource, type RecoveryRecord } from "../shared/scoring";

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
  professor?: string; // 시간표: 교수명
  place?: string; // 시간표: 강의 장소
  color?: string; // 시간표: 블록 색 (#rrggbb)
  groupId?: string; // 같은 수업의 여러 시간 블록을 묶는 ID
};

export type ReminderTime = {
  id: string;
  day: number | null; // null = 매일
  time: string; // "HH:MM"
  label: string;
  enabled: boolean;
};

/** 좌식 구간. estimate=타이머·움직임 기록으로 추정 / self=사용자가 앉았다고 확인 / unknown=타이머 꺼짐(미확인) */
export type SitSource = "estimate" | "self" | "unknown" | "schedule";
export type SitSegment = { start: string; end: string; source: SitSource; unseenMin?: number };
/** 보낸 휴식 알림. responded = 15분 안에 일어나서 움직임 */
export type AlertLog = { at: string; responded?: boolean };
type UserState = {
  lastMovedAt: string;
  sitSource?: "estimate" | "self"; // 지금 이어지는 좌식 구간이 어떻게 시작됐나
  offAt?: string; // 타이머를 끈 시각 (미확인 구간 시작)
  held?: { at: string; lastMovedAt: string }; // 수업 중이라 보류한 알림
  lastSeenAt?: string; // 앱이 마지막으로 열려 있던 시각 (하트비트)
  unseenSec?: number; // 지금 좌식 구간 중 앱이 닫혀 있던 시간
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
  profile?: BodyProfile; // 몸 정보 (선택 입력, 추천 순서·칼로리용)
  healthConsentAt?: string; // 건강 관련 민감정보 수집·이용 동의 시각
  createdAt: string;
};

export type DayLog = {
  totalSeconds: number;
  movementCount: number;
  maxContinuousSeconds?: number; // 그날 가장 오래 연속으로 앉아있던 시간
  edema?: EdemaLevel; // 그날 기록한 부종 정도
  bonusPoints?: number; // (예전 점수식) 더 이상 쓰지 않음
  moves?: MoveRecord[]; // 움직임 기록: 어떤 운동을, 몇 초, 직전에 몇 분 앉아 있다가
  recoveries?: RecoveryRecord[]; // (예전 형식) 회복 활동 기록 — 지금은 moves에 함께 저장
  segments?: SitSegment[]; // 좌식 구간 (끝난 것만)
  alerts?: AlertLog[]; // 보낸 휴식 알림과 반응 여부
  goal?: number; // 사용자가 정한 오늘 일어나기 목표
  plannedSitMin?: number; // "오늘 몇 시간 앉을 것 같아요?" 답 (분)
};

// 예전 형식(moves 없이 횟수만)으로 저장된 날은 "30~60분 뒤 1분 가볍게 걷기"로 보수적으로 환산
function movesOf(log: DayLog): MoveRecord[] {
  if (log.moves) return log.moves;
  return Array.from({ length: log.movementCount }, () => ({ at: "", exerciseId: "walk_easy", durationSec: 60, priorSitSec: 45 * 60 }));
}

/** 그날 일정표에 잡힌 시간(분). 겹치는 일정은 한 번만 센다. */
export function plannedFromSchedule(userId: string, date: string): number {
  const day = new Date(date + "T12:00:00+09:00").getUTCDay();
  const ranges = (db.schedule[userId] ?? [])
    .filter((b) => (b.date ? b.date === date : b.day === null || b.day === day))
    .map((b) => [toMinutes(b.start), toMinutes(b.end)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curS = -1, curE = -1;
  for (const [a, b] of ranges) {
    if (a > curE) { if (curE > curS) total += curE - curS; curS = a; curE = b; }
    else curE = Math.max(curE, b);
  }
  if (curE > curS) total += curE - curS;
  return total;
}

/** 일정표로 추정한 좌식 구간: 그날 일정 중 이미 시작한 것 (지금까지로 자름). title 포함 */
export function scheduleSegments(userId: string, date: string): (SitSegment & { title: string })[] {
  const day = new Date(date + "T12:00:00+09:00").getUTCDay();
  const now = Date.now();
  const at = (hm: string) => new Date(`${date}T${hm.padStart(5, "0")}:00+09:00`).getTime();
  return (db.schedule[userId] ?? [])
    .filter((b) => (b.date ? b.date === date : b.day === null || b.day === day))
    .map((b) => ({ s: at(b.start), e: Math.min(at(b.end), now), title: b.title }))
    .filter((r) => r.e - r.s >= 60_000)
    .sort((a, b) => a.s - b.s)
    .map((r) => ({ start: new Date(r.s).toISOString(), end: new Date(r.e).toISOString(), source: "schedule" as const, title: r.title }));
}

/** 오늘 앉을 시간: ① 사용자 답 → ② 일정표 → ③ 없음 */
function planOf(userId: string, date: string, log?: DayLog): { plannedSitMin: number | null; planSource: PlanSource } {
  if (log?.plannedSitMin) return { plannedSitMin: log.plannedSitMin, planSource: "self" };
  const fromSchedule = plannedFromSchedule(userId, date);
  if (fromSchedule > 0) return { plannedSitMin: fromSchedule, planSource: "timetable" };
  return { plannedSitMin: null, planSource: "none" };
}

export function summaryOf(userId: string, date: string, log?: DayLog): DaySummary {
  return summarizeDay({
    moves: log?.moves ?? (log ? movesOf(log) : []),
    recoveries: log?.recoveries ?? [],
    goal: log?.goal ?? null,
    ...planOf(userId, date, log),
  });
}

type DB = {
  users: Record<string, User>;
  sitting: Record<string, Record<string, DayLog>>; // userId -> date(YYYY-MM-DD) -> log
  state: Record<string, UserState>; // userId -> continuous timer anchor
  schedule: Record<string, ScheduleBlock[]>; // userId -> blocks
  reminders: Record<string, ReminderTime[]>; // userId -> 지정 시각 알림
  pushSubs: Record<string, PushSub[]>; // userId -> 웹 푸시 구독
  vapid?: { publicKey: string; privateKey: string };
  secret?: string; // 로그인 토큰 서명 키
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

// ---------- 영구 저장소 ----------
// DATABASE_URL(Postgres, 예: Neon)이 있으면 DB 전체를 app_state 테이블 한 줄(jsonb)에 저장한다.
// 없으면 예전처럼 db.json 파일에 저장한다(로컬 개발용).
// Render 무료 플랜은 재시작 때 디스크가 초기화되므로, 배포 환경에서는 반드시 DATABASE_URL을 설정해야 한다.
let pool: pg.Pool | null = null;
let pgWrite: Promise<void> = Promise.resolve();
let pgTimer: NodeJS.Timeout | null = null;
let pgDirty = false;

function writeToPg() {
  if (!pool || !pgDirty) return pgWrite;
  pgDirty = false;
  const snapshot = JSON.stringify(db);
  const p = pool;
  // 쓰기를 순서대로 이어 붙여서, 늦게 시작한 저장이 먼저 끝나 덮어쓰는 일을 막는다.
  pgWrite = pgWrite
    .then(() =>
      p.query(
        `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [snapshot],
      ),
    )
    .then(() => undefined)
    .catch((err) => {
      pgDirty = true; // 실패하면 다음 저장 때 다시 시도
      console.error("[db] Postgres 저장 실패:", err?.message ?? err);
    });
  return pgWrite;
}

function save(_db: DB) {
  if (pool) {
    pgDirty = true;
    // 짧은 시간에 여러 번 바뀌면 한 번만 저장 (요청마다 DB 왕복하지 않도록)
    if (!pgTimer) {
      pgTimer = setTimeout(() => {
        pgTimer = null;
        void writeToPg();
      }, 300);
    }
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), "utf-8");
}

/** 대기 중인 저장을 즉시 끝낸다 (서버 종료 직전, 테스트용). */
export async function flushDb() {
  if (pgTimer) {
    clearTimeout(pgTimer);
    pgTimer = null;
  }
  await writeToPg();
  await pgWrite;
}

/** 서버 시작 시 한 번 호출. DATABASE_URL이 있으면 Postgres에서 데이터를 불러온다. */
export async function initDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`[db] DATABASE_URL 없음 → 파일 저장 사용 (${DB_PATH})`);
    return;
  }
  const local = /localhost|127\.0\.0\.1/.test(url);
  pool = new pg.Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false }, max: 3 });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  );
  const res = await pool.query(`SELECT data FROM app_state WHERE id = 1`);
  if (res.rows.length > 0) {
    db = { ...emptyDb(), ...(res.rows[0].data as Partial<DB>) };
    console.log(`[db] Postgres에서 불러옴 (사용자 ${Object.keys(db.users).length}명)`);
  } else {
    // 처음 연결: 파일에 있던 데이터가 있으면 그대로 옮긴다.
    db = load();
    pgDirty = true;
    await writeToPg();
    console.log(`[db] Postgres 첫 연결 — 기존 데이터 이전 (사용자 ${Object.keys(db.users).length}명)`);
  }
  const shutdown = async () => {
    try {
      await flushDb();
      await pool?.end();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

// 모든 작업은 메모리의 db를 바꾸고 save()로 영구 저장소에 반영하는 구조 (소규모 프로토타입용)
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

export function updateUser(id: string, patch: Partial<Pick<User, "nickname" | "breakIntervalMin" | "scheduleQuietEnabled" | "trackingEnabled" | "profile" | "healthConsentAt">>) {
  const user = db.users[id];
  if (!user) return undefined;
  const wasOn = user.trackingEnabled !== false;
  if (wasOn && patch.trackingEnabled === false) {
    // 끄는 순간까지의 연속 좌식시간을 그날 최대값·좌식 구간에 반영하고, 이후는 미확인
    const userLog = (db.sitting[id] ??= {});
    const dayLog = (userLog[todayIso()] ??= { totalSeconds: 0, movementCount: 0 });
    bumpMaxContinuous(id, dayLog);
    closeSegment(id, dayLog, Date.now());
    db.state[id] = { ...(db.state[id] ?? { lastMovedAt: new Date().toISOString() }), offAt: new Date().toISOString(), held: undefined };
  }
  Object.assign(user, patch);
  // 꺼져 있다가 다시 켜면(= 사용자가 앉았다고 확인) 연속 좌식시간을 0부터 새로 시작
  if (!wasOn && user.trackingEnabled !== false) {
    const prev = db.state[id];
    if (prev?.offAt) {
      const dayLog = ((db.sitting[id] ??= {})[todayIso()] ??= { totalSeconds: 0, movementCount: 0 });
      pushSegment(dayLog, { start: prev.offAt, end: new Date().toISOString(), source: "unknown" });
    }
    db.state[id] = { ...prev, lastMovedAt: new Date().toISOString(), sitSource: "self", offAt: undefined, unseenSec: 0 };
  }
  save(db);
  return user;
}

// ---------- Sitting / 연속 좌식 ----------

function pushSegment(dayLog: DayLog, seg: SitSegment) {
  if (new Date(seg.end).getTime() - new Date(seg.start).getTime() < 60_000) return; // 1분 미만은 버림
  (dayLog.segments ??= []).push(seg);
}

/** 지금 이어지던 좌식 구간을 endMs에 끝내고 기록 (타이머가 켜져 있을 때만) */
function closeSegment(userId: string, dayLog: DayLog, endMs: number) {
  if (db.users[userId]?.trackingEnabled === false) return;
  const st = db.state[userId];
  if (!st?.lastMovedAt) return;
  const startMs = new Date(st.lastMovedAt).getTime();
  // 날짜가 바뀌었으면 오늘 0시부터로 자름
  const dayStart = new Date(todayIso() + "T00:00:00+09:00").getTime();
  const unseenMin = Math.round((st.unseenSec ?? 0) / 60);
  pushSegment(dayLog, { start: new Date(Math.max(startMs, dayStart)).toISOString(), end: new Date(endMs).toISOString(), source: st.sitSource ?? "estimate", ...(unseenMin > 0 ? { unseenMin } : {}) });
  st.unseenSec = 0;
}

/** 앱이 열려 있다는 신호. 5분 넘게 신호가 없었으면 그 시간은 "앱 닫힘"으로 지금 좌식 구간에 기록 */
export function touchSeen(userId: string) {
  const st = db.state[userId];
  if (!st) return;
  const now = Date.now();
  if (st.lastSeenAt && db.users[userId]?.trackingEnabled !== false) {
    const from = Math.max(new Date(st.lastSeenAt).getTime(), new Date(st.lastMovedAt).getTime());
    const gap = (now - from) / 1000;
    if (gap > 300) st.unseenSec = (st.unseenSec ?? 0) + gap;
  }
  st.lastSeenAt = new Date(now).toISOString();
}

// ---------- 알림 반응 (시간대별) ----------

const ALERT_RESPONSE_MIN = 15;

export function logAlert(userId: string) {
  const dayLog = ((db.sitting[userId] ??= {})[todayIso()] ??= { totalSeconds: 0, movementCount: 0 });
  (dayLog.alerts ??= []).push({ at: new Date().toISOString() });
  save(db);
}

function markAlertResponded(dayLog: DayLog) {
  const last = dayLog.alerts?.[dayLog.alerts.length - 1];
  if (last && !last.responded && Date.now() - new Date(last.at).getTime() <= ALERT_RESPONSE_MIN * 60_000) last.responded = true;
}

/** 최근 14일, 알림 3번 이상 받았는데 15분 안에 움직인 비율이 30% 미만인 시간대(시) */
export function lowResponseHours(userId: string): { hour: number; sent: number; rate: number }[] {
  const logs = db.sitting[userId] ?? {};
  const byHour = new Map<number, { sent: number; ok: number }>();
  for (const d of [todayIso(), ...pastDates(todayIso(), 13)]) {
    for (const a of logs[d]?.alerts ?? []) {
      const h = Number(new Date(a.at).toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false })) % 24;
      const v = byHour.get(h) ?? { sent: 0, ok: 0 };
      v.sent += 1; if (a.responded) v.ok += 1;
      byHour.set(h, v);
    }
  }
  return Array.from(byHour.entries())
    .filter(([, v]) => v.sent >= 3 && v.ok / v.sent < 0.3)
    .map(([hour, v]) => ({ hour, sent: v.sent, rate: Math.round((v.ok / v.sent) * 100) / 100 }))
    .sort((a, b) => a.hour - b.hour);
}

// ---------- 계정 삭제 / 내보내기 ----------

export function deleteUser(userId: string) {
  delete db.users[userId];
  delete db.sitting[userId];
  delete db.state[userId];
  delete db.schedule[userId];
  delete db.reminders[userId];
  delete db.pushSubs[userId];
  save(db);
}

/** 파일럿 분석용: 날짜별 요약 CSV (개인 식별 정보 없음) */
export function exportCsv(userId: string) {
  const logs = db.sitting[userId] ?? {};
  const rows = [["date", "plan_sit_min", "plan_source", "goal", "stand_count", "stand_verified", "seated_count", "total_count", "active_min", "segments", "sit_min_estimate", "sit_min_self", "unknown_min", "longest_sit_min", "alerts", "alerts_responded"].join(",")];
  for (const [date, log] of Object.entries(logs).sort(([a], [b]) => a.localeCompare(b))) {
    const sm = summaryOf(userId, date, log);
    const segs = log.segments ?? [];
    const mins = (src: SitSource) => segs.filter((g) => g.source === src).reduce((a, g) => a + (new Date(g.end).getTime() - new Date(g.start).getTime()) / 60000, 0);
    const valid = segs.filter((g) => g.source !== "unknown").map((g) => (new Date(g.end).getTime() - new Date(g.start).getTime()) / 60000);
    const verified = (log.moves ?? []).filter((m) => m.check === "verified").length;
    rows.push([date, sm.plannedSitMin ?? "", sm.planSource, sm.goal, sm.standCount, verified, sm.seatedCount, sm.totalCount, sm.activeMin, segs.length,
      Math.round(mins("estimate")), Math.round(mins("self")), Math.round(mins("unknown")), valid.length ? Math.round(Math.max(...valid)) : "",
      log.alerts?.length ?? 0, log.alerts?.filter((a) => a.responded).length ?? 0].join(","));
  }
  return rows.join("\n") + "\n";
}

export function getCurrentSegment(userId: string): { start: string; source: SitSource } | null {
  if (db.users[userId]?.trackingEnabled === false) {
    const off = db.state[userId]?.offAt;
    return off ? { start: off, source: "unknown" } : null;
  }
  const st = db.state[userId];
  return st ? { start: st.lastMovedAt, source: st.sitSource ?? "estimate" } : null;
}

// ---------- 수업 중 보류 알림 ----------

export function getHeld(userId: string) { return db.state[userId]?.held; }
export function setHeld(userId: string, held: UserState["held"]) {
  const st = db.state[userId];
  if (!st) return;
  st.held = held;
  save(db);
}

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

/**
 * 움직임 기록. 일어나서 한 동작만 연속 좌식을 끝낸다 (앉아서 한 동작은 좌식이 이어짐).
 * 직전 연속 좌식 시간(추정) = (지금 − 마지막 기립) − 운동 시간.
 */
export function markMoved(userId: string, exerciseId: string, durationSec: number, check?: MoveRecord["check"]) {
  const ex = EXERCISE_BY_ID[exerciseId];
  if (!ex) return null;
  const date = todayIso();
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[date] ??= { totalSeconds: 0, movementCount: 0 });
  const dur = Math.max(0, Math.min(Math.round(durationSec) || 0, 4 * 3600));
  const trackingOn = db.users[userId]?.trackingEnabled !== false;
  const last = db.state[userId]?.lastMovedAt;
  const sinceLast = last ? Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 1000)) : 0;
  const standing = ex.category !== "seated";
  const priorSitSec = trackingOn ? Math.max(0, sinceLast - (standing ? dur : 0)) : 0;
  if (standing) {
    if (trackingOn && priorSitSec > (dayLog.maxContinuousSeconds ?? 0)) dayLog.maxContinuousSeconds = priorSitSec;
    if (trackingOn) closeSegment(userId, dayLog, Date.now() - dur * 1000);
    markAlertResponded(dayLog);
    // 움직인 뒤 다시 앉는 건 자동으로 추정 (보류 알림도 취소)
    db.state[userId] = { ...db.state[userId], lastMovedAt: new Date().toISOString(), sitSource: "estimate", held: undefined, unseenSec: 0 };
  }
  if (!dayLog.moves) dayLog.moves = movesOf(dayLog).slice(); // 예전 기록이 있으면 형식 변환
  dayLog.moves.push({ at: new Date().toISOString(), exerciseId, durationSec: dur, priorSitSec, ...(check ? { check } : {}) });
  dayLog.movementCount += 1;
  save(db);
  return dayLog;
}

/** 오늘 목표·예정 앉은 시간 설정. null이면 지움 */
export function setTodayPlan(userId: string, patch: { goal?: number | null; plannedSitMin?: number | null }) {
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[todayIso()] ??= { totalSeconds: 0, movementCount: 0 });
  if (patch.goal !== undefined) { if (patch.goal === null) delete dayLog.goal; else dayLog.goal = patch.goal; }
  if (patch.plannedSitMin !== undefined) { if (patch.plannedSitMin === null) delete dayLog.plannedSitMin; else dayLog.plannedSitMin = patch.plannedSitMin; }
  save(db);
  return dayLog;
}

/** 최근 14일 동안 운동별 완료 횟수 (추천 순서용) */
export function moveHistory(userId: string): Record<string, number> {
  const logs = db.sitting[userId] ?? {};
  const out: Record<string, number> = {};
  for (const d of [todayIso(), ...pastDates(todayIso(), 13)]) {
    for (const m of logs[d]?.moves ?? []) out[m.exerciseId] = (out[m.exerciseId] ?? 0) + 1;
  }
  return out;
}

export function addHeartbeatSeconds(userId: string, seconds: number) {
  const safeSeconds = Math.max(0, Math.min(seconds, 120)); // 한 번에 과도하게 누적되는 것 방지
  const date = todayIso();
  const userLog = (db.sitting[userId] ??= {});
  const dayLog = (userLog[date] ??= { totalSeconds: 0, movementCount: 0 });
  dayLog.totalSeconds += safeSeconds;
  touchSeen(userId);
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
      summary: summaryOf(userId, date, log),
      segments: [...(log.segments ?? []), ...scheduleSegments(userId, date)],
    }));
}

function pastDates(date: string, days: number) {
  const base = new Date(date + "T00:00:00+09:00");
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - (i + 1));
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  });
}

const hasRecord = (l?: DayLog) => !!l && (l.movementCount > 0 || l.totalSeconds > 0 || (l.recoveries?.length ?? 0) > 0);

/** 오늘 요약 + 목표 올리기 제안 (최근 7일 중 기록 있는 날이 5일 이상이고 모두 달성했을 때) */
export function getToday(userId: string) {
  const logs = db.sitting[userId] ?? {};
  const today = summaryOf(userId, todayIso(), logs[todayIso()]);
  const past = pastDates(todayIso(), 7).filter((d) => hasRecord(logs[d])).map((d) => summaryOf(userId, d, logs[d]));
  return { summary: today, suggestGoal: goalSuggestion(past, today), streak: streakOf(userId) };
}

/** 일어나기 목표를 연속으로 달성한 날 수 (오늘 달성 전이면 어제까지). 하루 빠진 날은 건너뛰고 끊지 않음 (Lally 2010) */
function streakOf(userId: string) {
  const logs = db.sitting[userId] ?? {};
  let streak = 0;
  let misses = 0;
  const todayDone = summaryOf(userId, todayIso(), logs[todayIso()]).standDone;
  if (todayDone) streak += 1;
  for (const d of pastDates(todayIso(), 60)) {
    if (!hasRecord(logs[d])) break;
    if (summaryOf(userId, d, logs[d]).standDone) streak += 1;
    else if (++misses > 1) break; // 한 번 빠진 건 봐줌
  }
  return streak;
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
export function getSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!db.secret) { db.secret = crypto.randomBytes(32).toString("hex"); save(db); }
  return db.secret;
}
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
