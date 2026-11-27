// 시작점 건강 점수 (최종안 v2) — 서버와 화면이 같은 계산식을 쓰도록 공용으로 둔다.
// 근거 번호는 「시작점_점수제_맞춤형_최종안_v2.pdf」 참고문헌과 같다.

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
  // 앉아서 — A1만 (Morishima 2016 [12])
  { id: "fidget", name: "발 까딱이기", category: "seated", met: 1.8, code: "07023", match: "direct", desc: "앉은 채로 발뒤꿈치를 빠르게 톡톡 들었다 내려요. 1분 하고 잠깐 쉬어도 좋아요." },
  { id: "ankle_pump", name: "발목 펌프", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "발뒤꿈치는 바닥에 두고, 발끝을 최대한 들었다가 천천히 내려요." },
  { id: "seated_calf", name: "앉아서 종아리 들기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "발끝은 바닥에 두고 발뒤꿈치를 천천히 들었다 내려요." },
  { id: "seated_leg_ext", name: "앉아서 다리 펴기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "무릎을 쭉 폈다가 천천히 내려요. 양쪽 번갈아 해요." },
  { id: "seated_march", name: "앉아서 발 구르기", category: "seated", met: 1.8, code: "07023", match: "proxy", desc: "앉은 채로 제자리 걷듯 발을 번갈아 들어요." },
  // 걷기 — A1·A2·B
  { id: "walk_easy", name: "가볍게 걷기", category: "walk", met: 2.8, code: "17152", match: "direct", desc: "숨이 차지 않는 편한 속도로 복도나 실내를 걸어요." },
  { id: "water", name: "물 마시러 가기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "자리에서 일어나 물을 한 잔 받아와요." },
  { id: "hallway", name: "화장실·복도 다녀오기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "가까운 화장실이나 복도 끝까지 다녀와요." },
  { id: "errand", name: "자료 가지러 다녀오기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "프린터나 다른 층에 다녀오며 자연스럽게 걸어요." },
  { id: "phone_walk", name: "통화하며 걷기", category: "walk", met: 2.3, code: "17150", match: "proxy", desc: "통화나 음성 메시지는 걸으면서 해요." },
  // 제자리 근력 — A1·A2·B (Dempsey 2016 [10], Paterson 2020 [7])
  { id: "half_squat", name: "하프 스쿼트", category: "strength", met: 3.0, code: "02056", match: "direct", desc: "의자 앞에서 반쯤 앉았다 일어나요. 무릎이 발끝을 넘지 않게 해요." },
  { id: "lunge", name: "런지", category: "strength", met: 3.8, code: "02022", match: "direct", desc: "한 발 앞으로 내딛고 천천히 내려갔다 올라와요. 양쪽 번갈아 해요." },
  { id: "sit_stand", name: "의자 앉았다 일어나기", category: "strength", met: 2.8, code: "02340", match: "direct", desc: "1분에 6~12번 정도 천천히 앉았다 일어나요." },
  { id: "sit_stand_fast", name: "의자 앉았다 일어나기 (빠르게)", category: "strength", met: 4.0, code: "02344", match: "direct", desc: "1분에 18~24번 정도 리듬 있게 앉았다 일어나요." },
  { id: "standing_calf", name: "서서 종아리 들기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "벽이나 책상을 잡고 발뒤꿈치를 들었다 내려요." },
  { id: "knee_raise", name: "무릎 들어올리기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "서서 무릎을 허리 높이까지 번갈아 들어올려요." },
  { id: "side_leg", name: "옆으로 다리 들기", category: "strength", met: 3.0, code: "02056", match: "proxy", desc: "책상을 잡고 다리를 옆으로 천천히 들었다 내려요." },
  // 숨찬 활동 — A1·A2·B (+격한 강도면 보너스)
  { id: "stairs_slow", name: "계단 오르기 (천천히)", category: "vigorous", met: 4.5, code: "17133", match: "direct", desc: "편한 속도로 한두 층 올라가요." },
  { id: "stairs_fast", name: "계단 오르기 (빠르게)", category: "vigorous", met: 9.3, code: "17134", match: "direct", desc: "숨이 찰 만큼 빠르게 한두 층 올라가요." },
  { id: "brisk_walk", name: "빠르게 걷기", category: "vigorous", met: 4.8, code: "17200", match: "direct", desc: "약간 숨이 찰 정도로 빠르게 걸어요." },
  { id: "jog_place", name: "제자리 뛰기", category: "vigorous", met: 4.8, code: "12025", match: "direct", desc: "제자리에서 가볍게 뛰어요." },
  { id: "jumping_jack", name: "점핑잭", category: "vigorous", met: 7.5, code: "02020", match: "direct", desc: "팔다리를 벌렸다 모으며 제자리에서 뛰어요." },
  { id: "burpee", name: "버피", category: "vigorous", met: 7.5, code: "02020", match: "direct", desc: "앉았다 엎드렸다 일어나며 뛰어요. 무리하지 않는 만큼만." },
  { id: "jump_rope", name: "줄넘기", category: "vigorous", met: 11.0, code: "02068", match: "direct", desc: "공간이 있다면 줄넘기를 해요. 줄 없이 흉내만 내도 좋아요." },
  // 회복 활동 — D만 (Ekelund 2016 [3])
  { id: "jogging", name: "조깅", category: "recovery", met: 7.5, code: "12020", match: "direct", desc: "자기 속도로 달려요." },
  { id: "cycling", name: "자전거", category: "recovery", met: 4.0, code: "01010", match: "direct", desc: "여가용 속도(시속 16km 미만)로 타요." },
  { id: "dance", name: "춤", category: "recovery", met: 4.8, code: "02005", match: "proxy", desc: "음악에 맞춰 몸을 움직여요." },
];

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/** 카테고리별 권장 시간(초). 걷기·근력 3분(Dempsey [10]), 숨찬 활동 1분(VILPA [19]), 앉아서 1분 */
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
  recovery: "회복 활동",
};

// ---------- 기록 형식 ----------

export type MoveRecord = {
  at: string; // ISO
  exerciseId: string;
  durationSec: number;
  priorSitSec: number; // 이 동작 직전 연속 좌식 시간
};

export type RecoveryRecord = { at: string; exerciseId: string; durationSec: number };

export type BodyProfile = {
  sex?: "male" | "female";
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  bodyFatPct?: number;
};

// ---------- 몸 정보로 MET 보정 (Compendium 보정 MET [16], Cunningham [17]) ----------

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

/** 보정 배수 = 3.5 ÷ 내 안정 시 대사량(ml/kg/분). 몸 정보가 없으면 1 */
export function metCorrection(p: BodyProfile | undefined, year?: number): { factor: number; accuracy: Accuracy } {
  const r = restingKcalPerDay(p, year);
  if (!r || !p?.weightKg) return { factor: 1, accuracy: "기본" };
  const mlPerKgMin = (r.kcal / 1440 / 5 / p.weightKg) * 1000;
  const factor = Math.min(2, Math.max(0.6, 3.5 / mlPerKgMin));
  return { factor, accuracy: r.method === "cunningham" ? "높음" : "보통" };
}

export type Band = "light" | "moderate" | "vigorous";
export const BAND_LABEL: Record<Band, string> = { light: "가벼움", moderate: "중간", vigorous: "격함" };
const BAND_REP: Record<Band, number> = { light: 2.5, moderate: 4.5, vigorous: 7.5 };

export function bandOf(met: number): Band {
  return met >= 6 ? "vigorous" : met >= 3 ? "moderate" : "light";
}

/** 소모 칼로리(kcal) = 보정 MET × 안정 시 대사량(kcal/분) × 분. 몸무게가 없으면 null */
export function kcalOf(exerciseId: string, durationSec: number, p: BodyProfile | undefined) {
  const ex = EXERCISE_BY_ID[exerciseId];
  const r = restingKcalPerDay(p);
  if (!ex || !r) return null;
  const { factor } = metCorrection(p);
  return Math.round(ex.met * factor * (r.kcal / 1440) * (durationSec / 60));
}

// ---------- 점수 계산 ----------

export const MAX_COUNTED_SEC = 300; // 한 번에 최대 5분 인정 (Duran 2023 [9])
export const RECOVERY_TARGET_MIN = 60; // 회복 활동 60분이면 회복 가능 점수 전부 (Ekelund 2016 [3])

/** 직전 연속 좌식 시간에 따른 인정 횟수. A1 혈관 / A2 혈당 (Yin 2024, Duran 2023, Diaz 2017) */
export function breakWeights(priorSitSec: number) {
  const m = priorSitSec / 60;
  if (m <= 30) return { a1: 1, a2: 1 };
  if (m <= 60) return { a1: 0.6, a2: 0.3 };
  return { a1: 0.25, a2: 0 };
}

/** C: 하루 총 앉은 시간 (7h Chau [1] · 8h 캐나다 지침 [4] · 9.5h Ekelund 2019 [2]) */
export function sittingPoints(sitSeconds: number) {
  const h = sitSeconds / 3600;
  if (h <= 7) return 20;
  if (h <= 8) return 15;
  if (h <= 9.5) return 10;
  if (h <= 11) return 5;
  return 0;
}

export type Grade = "아주 좋음" | "좋음" | "주의" | "위험";
export function gradeOf(total: number): Grade {
  if (total >= 90) return "아주 좋음";
  if (total >= 70) return "좋음";
  if (total >= 35) return "주의";
  return "위험";
}

export type ScoreBreakdown = {
  total: number;
  grade: Grade;
  a1: number;
  a2: number;
  b: number;
  c: number;
  d: number;
  bonus: number;
  targetBreaks: number; // 오늘 목표 끊기 횟수 (앉은 시간 ÷ 30분)
  credited1: number; // A1 인정 횟수 합
  credited2: number; // A2 인정 횟수 합
  activeMin: number; // B에 인정된 일어나서 움직인 분
  recoveryMin: number; // D에 인정된 회복 활동 분
  vigorousCount: number; // 보너스 인정 횟수
  accuracy: Accuracy;
  enoughData: boolean; // 앉은 시간이 1시간 미만이면 "측정 부족"
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreDay(input: {
  sitSeconds: number;
  moves: MoveRecord[];
  recoveries?: RecoveryRecord[];
  profile?: BodyProfile;
}): ScoreBreakdown {
  const { sitSeconds, moves, recoveries = [], profile } = input;
  const { factor, accuracy } = metCorrection(profile);
  const targetBreaks = Math.max(1, Math.floor(sitSeconds / 60 / 30)); // 30분을 다 채울 때마다 1번씩 늘어남

  let credited1 = 0;
  let credited2 = 0;
  let bRaw = 0;
  let activeMin = 0;
  let vigorousCount = 0;

  for (const m of moves) {
    const ex = EXERCISE_BY_ID[m.exerciseId];
    if (!ex || ex.category === "recovery") continue;
    const w = breakWeights(m.priorSitSec);
    credited1 += w.a1; // 앉아서 하는 동작도 다리 혈관(A1)은 인정
    if (ex.category === "seated") continue; // 혈당(A2)·움직인 양(B)은 일어나서 한 동작만
    credited2 += w.a2;
    const min = Math.min(m.durationSec, MAX_COUNTED_SEC) / 60;
    const met = ex.met * factor;
    bRaw += BAND_REP[bandOf(met)] * min;
    activeMin += min;
    if (met >= 6 && m.durationSec >= 60) vigorousCount += 1;
  }

  let recoveryMin = 0;
  for (const r of recoveries) {
    const ex = EXERCISE_BY_ID[r.exerciseId];
    if (!ex) continue;
    const met = ex.met * factor;
    if (met < 3) continue; // 중간 강도 이상만 회복으로 인정
    recoveryMin += r.durationSec / 60;
    if (met >= 6 && r.durationSec >= 60) vigorousCount += 1;
  }

  const a1 = 25 * Math.min(1, credited1 / targetBreaks);
  const a2 = 25 * Math.min(1, credited2 / targetBreaks);
  const b = Math.min(30, bRaw / 5);
  const c = sittingPoints(sitSeconds);
  const recoverable = 20 - c + 0.5 * (50 - a1 - a2); // C 감점 전부 + A 감점 절반
  const d = recoverable * Math.min(1, recoveryMin / RECOVERY_TARGET_MIN);
  const bonus = 2 * Math.min(3, vigorousCount);
  const total = round1(Math.min(100, a1 + a2 + b + c + d + bonus));

  return {
    total,
    grade: gradeOf(total),
    a1: round1(a1),
    a2: round1(a2),
    b: round1(b),
    c,
    d: round1(d),
    bonus,
    targetBreaks,
    credited1: round1(credited1),
    credited2: round1(credited2),
    activeMin: round1(activeMin),
    recoveryMin: round1(recoveryMin),
    vigorousCount: Math.min(3, vigorousCount),
    accuracy,
    enoughData: sitSeconds >= 3600,
  };
}

// ---------- 나의 목표 (기록 기준선에서 조금씩, Zhou 2018 [14]) ----------

/**
 * 최근 7일 중 기록이 있는 날의 "30분 안에 끊은 횟수(A1 인정 합)" 평균을 기준선으로,
 * 15% 올린 값을 오늘 목표로 한다. 3일 미만이면 기준선 측정 중.
 */
export function dailyGoal(pastCredited: number[], todayTarget: number) {
  if (pastCredited.length < 3) return { measuring: true as const, daysCollected: pastCredited.length, goal: null };
  const base = pastCredited.reduce((a, b) => a + b, 0) / pastCredited.length;
  const goal = Math.min(Math.max(3, todayTarget), Math.max(3, Math.ceil(base * 1.15)));
  return { measuring: false as const, daysCollected: pastCredited.length, baseline: Math.round(base * 10) / 10, goal };
}
