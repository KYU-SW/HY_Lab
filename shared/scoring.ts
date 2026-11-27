// 시작점 실천 기록 (확정안 v4) — 서버와 화면이 같은 계산식을 쓰도록 공용으로 둔다.
// 점수(100점)는 쓰지 않는다. 일어나기 횟수 / 목표 하나만 목표로 보여주고, 숨찬 운동 분은 기록으로만 남긴다.
// 근거: 「시작점_확정안_v4.pdf」 참고문헌.

// ---------- 운동 목록 (MET: 2024 Adult Compendium [15]) ----------

export type ExerciseCategory = "seated" | "walk" | "strength" | "vigorous" | "recovery";

export type Exercise = {
  id: string;
  name: string;
  category: ExerciseCategory;
  met: number; // 기본 MET
  code: string; // Compendium 코드
  match: "direct" | "proxy"; // ✅ 원문 그대로 / 🔸 비슷한 항목으로 대신
  desc: string;
};

export const EXERCISES: Exercise[] = [
  // 앉아서 — 좌식 정의상 앉아 있는 상태라 일어나기 횟수에 넣지 않음 (기록만)
  { id: "fidget", name: "발 까딱이기", category: "seated", met: 1.8, code: "07023", match: "direct", desc: "앉은 채로 발뒤꿈치를 빠르게 톡톡 들었다 내려요. 1분 하고 잠깐 쉬어도 좋아요." },
  { id: "ankle_pump", name: "발목 펌프", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "발뒤꿈치는 바닥에 두고, 발끝을 최대한 들었다가 천천히 내려요." },
  { id: "seated_calf", name: "앉아서 종아리 들기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "발끝은 바닥에 두고 발뒤꿈치를 천천히 들었다 내려요." },
  { id: "seated_leg_ext", name: "앉아서 다리 펴기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "무릎을 쭉 폈다가 천천히 내려요. 양쪽 번갈아 해요." },
  { id: "seated_march", name: "앉아서 발 구르기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "앉은 채로 제자리 걷듯 발을 번갈아 들어요." },
  // 걷기
  { id: "walk_easy", name: "가볍게 걷기", category: "walk", met: 2.8, code: "17152", match: "direct", desc: "숨이 차지 않는 편한 속도로 복도나 실내를 걸어요." },
  { id: "water", name: "물 마시러 가기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "자리에서 일어나 물을 한 잔 받아와요." },
  { id: "hallway", name: "화장실·복도 다녀오기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "가까운 화장실이나 복도 끝까지 다녀와요." },
  { id: "errand", name: "자료 가지러 다녀오기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "프린터나 다른 층에 다녀오며 자연스럽게 걸어요." },
  { id: "phone_walk", name: "통화하며 걷기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "통화나 음성 메시지는 걸으면서 해요." },
  // 제자리 근력
  { id: "half_squat", name: "하프 스쿼트", category: "strength", met: 3.0, code: "02056", match: "direct", desc: "의자 앞에서 반쯤 앉았다 일어나요. 무릎이 발끝을 넘지 않게 해요." },
  { id: "lunge", name: "런지", category: "strength", met: 3.8, code: "02022", match: "direct", desc: "한 발 앞으로 내딛고 천천히 내려갔다 올라와요. 양쪽 번갈아 해요." },
  { id: "sit_stand", name: "의자 앉았다 일어나기", category: "strength", met: 2.8, code: "02340", match: "direct", desc: "1분에 6~12번 정도 천천히 앉았다 일어나요." },
  { id: "sit_stand_fast", name: "의자 앉았다 일어나기 (빠르게)", category: "strength", met: 4.0, code: "02344", match: "direct", desc: "1분에 18~24번 정도 리듬 있게 앉았다 일어나요." },
  { id: "standing_calf", name: "서서 종아리 들기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "벽이나 책상을 잡고 발뒤꿈치를 들었다 내려요." },
  { id: "knee_raise", name: "무릎 들어올리기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "서서 무릎을 허리 높이까지 번갈아 들어올려요." },
  { id: "side_leg", name: "옆으로 다리 들기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "책상을 잡고 다리를 옆으로 천천히 들었다 내려요." },
  // 숨찬 활동
  { id: "stairs_slow", name: "계단 오르기 (천천히)", category: "vigorous", met: 4.5, code: "17133", match: "direct", desc: "편한 속도로 한두 층 올라가요." },
  { id: "stairs_fast", name: "계단 오르기 (빠르게)", category: "vigorous", met: 9.3, code: "17134", match: "direct", desc: "숨이 찰 만큼 빠르게 한두 층 올라가요." },
  { id: "brisk_walk", name: "빠르게 걷기", category: "vigorous", met: 4.8, code: "17200", match: "direct", desc: "약간 숨이 찰 정도로 빠르게 걸어요." },
  { id: "jog_place", name: "제자리 뛰기", category: "vigorous", met: 4.8, code: "12025", match: "direct", desc: "제자리에서 가볍게 뛰어요." },
  { id: "jumping_jack", name: "점핑잭", category: "vigorous", met: 7.5, code: "02020", match: "direct", desc: "팔다리를 벌렸다 모으며 제자리에서 뛰어요." },
  { id: "burpee", name: "버피", category: "vigorous", met: 7.5, code: "02020", match: "direct", desc: "앉았다 엎드렸다 일어나며 뛰어요. 무리하지 않는 만큼만." },
  { id: "jump_rope", name: "줄넘기", category: "vigorous", met: 11.0, code: "02068", match: "direct", desc: "공간이 있다면 줄넘기를 해요. 줄 없이 흉내만 내도 좋아요." },
  // 오래 하는 운동 (자리를 떠나서 하는 운동)
  { id: "jogging", name: "조깅", category: "recovery", met: 7.5, code: "12020", match: "direct", desc: "자기 속도로 달려요." },
  { id: "cycling", name: "자전거", category: "recovery", met: 4.0, code: "01010", match: "direct", desc: "여가용 속도(시속 16km 미만)로 타요." },
  { id: "dance", name: "춤", category: "recovery", met: 4.8, code: "02005", match: "proxy", desc: "음악에 맞춰 몸을 움직여요." },
];

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/** 카테고리별 권장 시간(초). 걷기·근력 3분, 숨찬 활동 1분, 앉아서 1분, 오래 하는 운동 10분 */
export const RECOMMENDED_SEC: Record<ExerciseCategory, number> = {
  seated: 60,
  walk: 180,
  strength: 180,
  vigorous: 60,
  recovery: 600,
};

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  seated: "앉아서",
  walk: "걷기",
  strength: "제자리 근력",
  vigorous: "숨찬 활동",
  recovery: "오래 하는 운동",
};

// ---------- 기록 형식 ----------

export type MoveRecord = {
  at: string; // ISO
  exerciseId: string;
  durationSec: number;
  priorSitSec: number; // 이 동작 직전 연속 좌식 시간 (추정, 기록용)
};

/** 예전 형식(회복 활동 따로 저장). 지금은 모두 moves에 저장하지만 예전 기록을 읽기 위해 남겨둔다. */
export type RecoveryRecord = { at: string; exerciseId: string; durationSec: number };

export type ActivityLevel = "low" | "mid" | "high";
export type Limitation = "neck" | "shoulder" | "wrist" | "back" | "hip" | "knee" | "ankle";
export const ACTIVITY_LABEL: Record<ActivityLevel, string> = { low: "거의 안 함", mid: "가끔 함", high: "자주 함" };
export const LIMITATION_LABEL: Record<Limitation, string> = { neck: "목", shoulder: "어깨", wrist: "손목", back: "허리", hip: "엉덩이·고관절", knee: "무릎", ankle: "발목" };
export const LIMITATIONS = Object.keys(LIMITATION_LABEL) as Limitation[];

export type BodyProfile = {
  sex?: "male" | "female";
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPct?: number;
  activityLevel?: ActivityLevel; // 평소 운동 수준 (추천 난이도용)
  limitations?: Limitation[]; // 불편한 부위 (해당 동작 자동 제외)
  excluded?: string[]; // 사용자가 추천에서 뺀 운동 id
};

// ---------- 칼로리 표시용 (점수에는 쓰지 않음) ----------

export type Accuracy = "기본" | "보통" | "높음";

export function restingKcalPerDay(p: BodyProfile | undefined, year = new Date().getFullYear()) {
  if (!p || !p.weightKg) return null;
  if (p.bodyFatPct != null && p.bodyFatPct > 2 && p.bodyFatPct < 70) {
    const ffm = p.weightKg * (1 - p.bodyFatPct / 100);
    return { kcal: 500 + 22 * ffm, method: "cunningham" as const };
  }
  if (!p.sex || !p.heightCm || !p.birthYear) return null;
  const age = Math.max(10, year - p.birthYear);
  const kcal =
    p.sex === "male"
      ? 66.473 + 5.0033 * p.heightCm + 13.7516 * p.weightKg - 6.755 * age
      : 655.0955 + 1.8496 * p.heightCm + 9.5634 * p.weightKg - 4.6756 * age;
  return { kcal, method: "harris-benedict" as const };
}

/** 칼로리 표시용 보정 배수 = 3.5 ÷ 내 안정 시 대사량(ml/kg/분). 몸 정보가 없으면 1 */
export function metCorrection(p: BodyProfile | undefined, year?: number): { factor: number; accuracy: Accuracy } {
  const r = restingKcalPerDay(p, year);
  if (!r || !p?.weightKg) return { factor: 1, accuracy: "기본" };
  const mlPerKgMin = (r.kcal / 1440 / 5 / p.weightKg) * 1000;
  const factor = Math.min(2, Math.max(0.6, 3.5 / mlPerKgMin));
  return { factor, accuracy: r.method === "cunningham" ? "높음" : "보통" };
}

export type Band = "light" | "moderate" | "vigorous";
export const BAND_LABEL: Record<Band, string> = { light: "가벼움", moderate: "중강도", vigorous: "고강도" };

/** 강도 구분은 Compendium 기본 MET 그대로 (WHO: 중강도 3~6, 고강도 6 이상) */
export function bandOf(met: number): Band {
  return met >= 6 ? "vigorous" : met >= 3 ? "moderate" : "light";
}

/** 소모 칼로리(kcal) 추정 = 보정 MET × 안정 시 대사량(kcal/분) × 분. 몸무게가 없으면 null */
export function kcalOf(exerciseId: string, durationSec: number, p: BodyProfile | undefined) {
  const ex = EXERCISE_BY_ID[exerciseId];
  const r = restingKcalPerDay(p);
  if (!ex || !r) return null;
  const { factor } = metCorrection(p);
  return Math.round(ex.met * factor * (r.kcal / 1440) * (durationSec / 60));
}

// ---------- 오늘의 실천 기록 ----------

/** (기록용) WHO 2020 주 150분 중강도 ÷ 7일 ≈ 22분. 화면 목표로는 쓰지 않음 */
export const ACTIVE_TARGET_MIN = 22;
/** 같은 30분 안에 다시 일어나면 운동 시간에는 넣되 일어나기 횟수는 한 번만 센다 (30분 간격 권고, Yin 2024) */
export const STAND_DEDUPE_MIN = 30;

export const isStanding = (exerciseId: string) => {
  const ex = EXERCISE_BY_ID[exerciseId];
  return !!ex && ex.category !== "seated";
};

/** 숨찬 운동으로 인정되는 분: 중강도(MET 3 이상)만, 고강도(MET 6 이상)는 2배 (WHO 2020, LE8) */
export function activeMinutesOf(exerciseId: string, durationSec: number) {
  const ex = EXERCISE_BY_ID[exerciseId];
  if (!ex) return 0;
  const band = bandOf(ex.met);
  if (band === "light") return 0;
  return (durationSec / 60) * (band === "vigorous" ? 2 : 1);
}

/** 목표 범위: 최소 = 예정 앉은 시간 ÷ 60분(수업 하나마다 한 번), 권장 = ÷ 30분 (Yin 2024, Diaz 2017) */
export function goalRange(plannedSitMin: number | null) {
  if (!plannedSitMin || plannedSitMin < 30) return { min: 1, rec: plannedSitMin ? 1 : null as number | null };
  return { min: Math.max(1, Math.floor(plannedSitMin / 60)), rec: Math.max(1, Math.floor(plannedSitMin / 30)) };
}

export type PlanSource = "self" | "timetable" | "none";

export type DaySummary = {
  standCount: number; // 일어나기 인정 횟수 (메인 목표)
  standRaw: number; // 일어나서 한 동작 전체 횟수 (30분 중복 포함)
  seatedCount: number; // 앉아서 한 동작 (기록만)
  totalCount: number; // 전체 실천 횟수
  goal: number; // 오늘 일어나기 목표
  goalMin: number;
  goalRec: number | null;
  plannedSitMin: number | null;
  planSource: PlanSource;
  standDone: boolean;
  activeMin: number; // 숨찬 운동 인정 분
  activeTarget: number;
  activeDone: boolean;
  vigorousMin: number; // 그중 고강도로 한 실제 분
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeDay(input: {
  moves: MoveRecord[];
  recoveries?: RecoveryRecord[];
  plannedSitMin: number | null;
  planSource: PlanSource;
  goal?: number | null; // 사용자가 정한 목표 (없으면 권장값, 권장값도 없으면 1)
}): DaySummary {
  const { moves, recoveries = [], plannedSitMin, planSource } = input;
  const range = goalRange(plannedSitMin);
  const goal = Math.max(range.min, Math.min(48, Math.round(input.goal ?? range.rec ?? 1)));

  let standCount = 0;
  let standRaw = 0;
  let seatedCount = 0;
  let activeMin = 0;
  let vigorousMin = 0;
  let lastCounted = -Infinity;
  const sorted = [...moves].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const m of sorted) {
    const ex = EXERCISE_BY_ID[m.exerciseId];
    if (!ex) continue;
    activeMin += activeMinutesOf(m.exerciseId, m.durationSec);
    if (bandOf(ex.met) === "vigorous") vigorousMin += m.durationSec / 60;
    if (ex.category === "seated") { seatedCount += 1; continue; }
    standRaw += 1;
    const t = m.at ? new Date(m.at).getTime() : NaN;
    if (Number.isNaN(t)) { standCount += 1; continue; } // 시각 없는 예전 기록은 각각 1회
    if (t - lastCounted >= STAND_DEDUPE_MIN * 60_000) { standCount += 1; lastCounted = t; }
  }
  for (const r of recoveries) {
    const ex = EXERCISE_BY_ID[r.exerciseId];
    if (!ex) continue;
    activeMin += activeMinutesOf(r.exerciseId, r.durationSec);
    if (bandOf(ex.met) === "vigorous") vigorousMin += r.durationSec / 60;
  }

  return {
    standCount,
    standRaw,
    seatedCount,
    totalCount: standRaw + seatedCount + recoveries.length,
    goal,
    goalMin: range.min,
    goalRec: range.rec,
    plannedSitMin,
    planSource,
    standDone: standCount >= goal,
    activeMin: round1(activeMin),
    activeTarget: ACTIVE_TARGET_MIN,
    activeDone: activeMin >= ACTIVE_TARGET_MIN,
    vigorousMin: round1(vigorousMin),
  };
}

/** 일주일 연속(기록 있는 날 5일 이상) 목표를 달성했으면 목표 올리기 제안 (Zhou 2018, Epton 2017) */
export function goalSuggestion(past: { standDone: boolean; goal: number }[], today: DaySummary) {
  if (past.length < 5 || !past.every((d) => d.standDone)) return null;
  const next = today.goal + 1;
  if (today.goalRec != null && today.goal >= today.goalRec) return null; // 이미 권장 이상
  return next;
}

// ---------- 맞춤 추천 E(u,t) ----------

export type Place = "class" | "home" | "outdoor";
export const PLACE_LABEL: Record<Place, string> = { class: "강의실·도서관", home: "집·기숙사", outdoor: "복도·야외" };

/** 장소별로 할 수 없는 동작 (조용해야 함 / 공간·계단·야외 필요) */
const NOT_IN_PLACE: Record<Place, string[]> = {
  class: ["lunge", "jog_place", "jumping_jack", "burpee", "jump_rope", "jogging", "cycling", "dance", "sit_stand_fast"],
  home: ["jogging", "cycling", "errand"],
  outdoor: ["fidget", "ankle_pump", "seated_calf", "seated_leg_ext", "seated_march", "sit_stand", "sit_stand_fast", "side_leg"],
};

/** 불편한 부위에 부담이 큰 동작 */
const STRESS: Record<Limitation, string[]> = {
  neck: ["burpee", "jumping_jack", "jump_rope"],
  shoulder: ["burpee", "jumping_jack", "jump_rope"],
  wrist: ["burpee", "jump_rope"],
  hip: ["lunge", "side_leg", "half_squat", "sit_stand_fast", "knee_raise", "jogging", "stairs_fast", "burpee"],
  knee: ["half_squat", "lunge", "sit_stand_fast", "jog_place", "jumping_jack", "burpee", "jump_rope", "stairs_fast", "jogging"],
  back: ["burpee", "lunge", "jump_rope"],
  ankle: ["jog_place", "jumping_jack", "burpee", "jump_rope", "stairs_fast", "jogging"],
};

/** 1분이면 끝나는 짧은 이동 */
const QUICK = ["water", "hallway"];

/** 점프·달리기처럼 관절 충격이 큰 동작 */
const HIGH_IMPACT = ["jog_place", "jumping_jack", "burpee", "jump_rope", "jogging", "stairs_fast"];

export function bmiOf(p?: BodyProfile) {
  if (!p?.heightCm || !p?.weightKg) return null;
  return p.weightKg / (p.heightCm / 100) ** 2;
}

export type Recommendation = { id: string; reason: string; fit: number };

/**
 * 추천 가능한 운동 E(u,t) = { e | 시간 안에 끝남, 지금 자세·장소에서 가능, 불편한 부위에 부담 없음, 사용자가 빼지 않음 }
 * 그 안에서 순서는 ① 사람(운동 수준·체격) ② 내 기록(자주 완료한 동작) 순으로 정한다.
 */
export function recommend(input: {
  categories: ExerciseCategory[];
  place: Place;
  availableMin: number;
  profile?: BodyProfile;
  history?: Record<string, number>; // 최근 14일 완료 횟수
}): { list: Recommendation[]; hidden: { id: string; reason: string }[] } {
  const { categories, place, availableMin, profile = {}, history = {} } = input;
  const level = profile.activityLevel ?? "mid";
  const bmi = bmiOf(profile);
  const heavy = bmi != null && bmi >= 30;
  const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : null;
  const list: Recommendation[] = [];
  const hidden: { id: string; reason: string }[] = [];

  for (const e of EXERCISES) {
    if (!categories.includes(e.category)) continue;
    if (profile.excluded?.includes(e.id)) { hidden.push({ id: e.id, reason: "내가 뺀 운동" }); continue; }
    const lim = (profile.limitations ?? []).find((l) => STRESS[l].includes(e.id));
    if (lim) { hidden.push({ id: e.id, reason: `${LIMITATION_LABEL[lim]} 부담` }); continue; }
    if (NOT_IN_PLACE[place].includes(e.id)) { hidden.push({ id: e.id, reason: `${PLACE_LABEL[place]}에서 어려움` }); continue; }
    const needMin = QUICK.includes(e.id) ? 1 : Math.min(RECOMMENDED_SEC[e.category], 180) / 60;
    if (needMin > availableMin) { hidden.push({ id: e.id, reason: "시간 부족" }); continue; }

    // 사람에 맞는 강도: 거의 안 함 → 가벼움·중강도 먼저 / 자주 함 → 고강도 먼저
    const band = bandOf(e.met);
    const prefer: Record<ActivityLevel, Record<Band, number>> = {
      low: { light: 3, moderate: 2, vigorous: 0 },
      mid: { light: 1, moderate: 3, vigorous: 2 },
      high: { light: 0, moderate: 2, vigorous: 3 },
    };
    let fit = prefer[level][band];
    const reasons: string[] = [];
    if (fit >= 3) reasons.push(`평소 운동 ${ACTIVITY_LABEL[level]} → ${BAND_LABEL[band]} 동작`);
    // 체격·나이: 관절 충격이 큰 동작은 뒤로 (ACSM: 저충격부터)
    if (HIGH_IMPACT.includes(e.id) && (heavy || (age != null && age >= 60)) && level !== "high") {
      fit -= 2;
    } else if (!HIGH_IMPACT.includes(e.id) && heavy && band !== "light") {
      fit += 1;
      reasons.push("관절 부담 적은 동작");
    }
    // 내 기록: 자주 완료한 동작 먼저
    const done = history[e.id] ?? 0;
    if (done >= 2) { fit += Math.min(2, done / 3); reasons.push(`최근 ${done}번 완료`); }
    if (place === "class" && e.category !== "seated" && reasons.length === 0) reasons.push("조용히 할 수 있어요");
    list.push({ id: e.id, reason: reasons.join(" · "), fit });
  }
  list.sort((a, b) => b.fit - a.fit);
  return { list, hidden };
}
