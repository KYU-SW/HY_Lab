// GPS + 가속도계로 "정지 / 걷기 / 탈것 이동"을 구분하는 순수 계산 모듈 (UI 의존 없음)

export type Fix = { lat: number; lng: number; acc: number; t: number; speed: number | null };
export type MotionState = "still" | "walking" | "vehicle" | "unknown";

export const MOTION = {
  MAX_ACC_M: 40, // 이보다 부정확한 위치는 버림
  WINDOW_MS: 20000, // 속도를 계산하는 최근 구간
  MIN_SPAN_MS: 8000, // 이 시간 이상 모여야 판단
  MAX_JUMP_SPEED: 70, // 초속 70m(시속 252km) 넘는 순간이동은 GPS 튐으로 보고 버림
  STILL_SPEED: 0.35, // 이 미만이면 정지
  WALK_MAX_SPEED: 2.8, // 시속 약 10km 이하는 걷기 범위
  VEHICLE_MIN_SPEED: 4.2, // 시속 약 15km 이상은 탈것
  RUN_MAX_SPEED: 6.5, // 걸음 박자가 있으면 이 속도까지는 달리기로 인정
  WALK_HOLD_MS: 10000, // 걷는 중 판정이 이만큼 이어져야 타이머를 멈춤
};

export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** 걸음 박자 감지: 가속도 크기를 보고 "규칙적인 걸음 리듬"인지 판단 */
/** 걸음으로 볼 최소 출렁임(m/s²). 주머니 속 걷기는 보통 1 이상, 손에 들고 보며 걸으면 0.4~1 */
const STEP_MIN_PEAK = 0.35;

export class StepDetector {
  private samples: { t: number; m: number }[] = [];
  push(ax: number, ay: number, az: number, t: number) {
    this.samples.push({ t, m: Math.sqrt(ax * ax + ay * ay + az * az) });
    while (this.samples.length && t - this.samples[0].t > 6000) this.samples.shift();
  }
  /** true=걸음 박자 있음, false=없음(흔들기/차량 진동/정지), null=데이터 부족 */
  analyze(): boolean | null {
    const s = this.samples;
    if (s.length < 20 || s[s.length - 1].t - s[0].t < 4000) return null;
    // 5점 이동평균으로 잡음 제거 후, 평균을 빼서 출렁임만 남김
    const sm = s.map((_, i) => {
      let sum = 0, n = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(s.length - 1, i + 2); k++) { sum += s[k].m; n++; }
      return sum / n;
    });
    const mean = sm.reduce((a, b) => a + b, 0) / sm.length;
    const x = sm.map((v) => v - mean);
    const peaks: { t: number; h: number }[] = [];
    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] > STEP_MIN_PEAK && x[i] >= x[i - 1] && x[i] > x[i + 1]) {
        const last = peaks[peaks.length - 1];
        if (!last || s[i].t - last.t >= 250) peaks.push({ t: s[i].t, h: x[i] });
        else if (x[i] > last.h) { last.t = s[i].t; last.h = x[i]; }
      }
    }
    if (peaks.length < 6) return false;
    // 걸음은 같은 모양이 규칙적으로 반복됨 → 자기상관이 높아야 함 (불규칙한 흔들기는 낮음)
    const dtMean = (s[s.length - 1].t - s[0].t) / (s.length - 1);
    const varX = x.reduce((a, b) => a + b * b, 0);
    let best = 0;
    for (let lag = Math.round(300 / dtMean); lag <= Math.round(800 / dtMean) && lag < x.length / 2; lag++) {
      let c = 0;
      for (let i = 0; i + lag < x.length; i++) c += x[i] * x[i + lag];
      best = Math.max(best, c / varX);
    }
    const medH0 = median(peaks.map((p) => p.h));
    // 폰을 손에 들고 화면을 보며 걸으면 출렁임이 작음 → 작을수록 규칙성(자기상관)을 더 엄격하게 봄
    if (best < (medH0 < 0.8 ? 0.55 : 0.4)) return false;
    const intervals = peaks.slice(1).map((p, i) => p.t - peaks[i].t);
    const mi = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mi) ** 2, 0) / intervals.length);
    const freq = 1000 / mi;
    const medH = median(peaks.map((p) => p.h));
    // 걷기/달리기 박자 1.3~3.2Hz, 일정한 간격, 너무 세지 않은 진폭(세게 흔들면 탈락)
    return freq >= 1.3 && freq <= 3.2 && sd / mi < 0.3 && medH >= STEP_MIN_PEAK && medH <= 10;
  }
}

/** GPS 위치들로 속도를 구하고, 걸음 박자(선택)와 합쳐 상태를 분류 */
export class GpsClassifier {
  private fixes: Fix[] = [];
  private rejected = 0;
  push(f: Fix) {
    if (f.acc > MOTION.MAX_ACC_M) return;
    const last = this.fixes[this.fixes.length - 1];
    if (last) {
      const dt = (f.t - last.t) / 1000;
      if (dt <= 0) return;
      const jump = distM(last, f);
      // 속도상 불가능하고, 위치 오차 범위로도 설명이 안 되는 점프만 튐으로 본다
      if (jump / dt > MOTION.MAX_JUMP_SPEED && jump > 3 * (last.acc + f.acc)) {
        // 첫 점이 튄 값이었을 수도 있으니, 연속으로 3번 튀면 새 기준으로 다시 시작
        if (++this.rejected >= 3) { this.fixes = [f]; this.rejected = 0; }
        return;
      }
    }
    this.rejected = 0;
    this.fixes.push(f);
    while (this.fixes.length && f.t - this.fixes[0].t > MOTION.WINDOW_MS) this.fixes.shift();
  }
  reset() { this.fixes = []; this.rejected = 0; }

  speed(): number | null {
    const fx = this.fixes;
    if (fx.length < 3) return null;
    const first = fx[0], last = fx[fx.length - 1];
    const span = (last.t - first.t) / 1000;
    if (span * 1000 < MOTION.MIN_SPAN_MS) return null;
    // 모든 점에 직선을 맞춰(최소제곱) 속도를 구하면 제자리 흔들림이 서로 상쇄됨.
    // 거기서 추정 오차(1σ)만큼 빼서, 가만히 있을 때 속도가 튀어 보이지 않게 함.
    const o = fx[0];
    const kx = 111320 * Math.cos((o.lat * Math.PI) / 180), ky = 111320;
    const ts = fx.map((f) => (f.t - o.t) / 1000);
    const xs = fx.map((f) => (f.lng - o.lng) * kx), ys = fx.map((f) => (f.lat - o.lat) * ky);
    const n = fx.length, tm = ts.reduce((p, c) => p + c, 0) / n;
    const sxx = ts.reduce((p, c) => p + (c - tm) ** 2, 0);
    const fit = (vs: number[]) => {
      const vm = vs.reduce((p, c) => p + c, 0) / n;
      const slope = ts.reduce((p, c, i) => p + (c - tm) * (vs[i] - vm), 0) / sxx;
      const res = vs.reduce((p, c, i) => p + (c - (vm + slope * (ts[i] - tm))) ** 2, 0) / Math.max(1, n - 2);
      return { slope, se: Math.sqrt(res / sxx) };
    };
    const fx_ = fit(xs), fy_ = fit(ys);
    const vNet = Math.max(0, Math.hypot(fx_.slope, fy_.slope) - Math.hypot(fx_.se, fy_.se));
    const sp = fx.map((f) => f.speed).filter((v): v is number => v != null && v >= 0);
    if (sp.length >= 3) return (median(sp) + vNet) / 2; // 도플러 속도와 이동거리 속도를 평균
    return vNet;
  }

  classify(cadence: boolean | null): { state: MotionState; speed: number | null } {
    const v = this.speed();
    if (v === null) return { state: "unknown", speed: null };
    if (v < MOTION.STILL_SPEED) return { state: "still", speed: v };
    if (v >= MOTION.VEHICLE_MIN_SPEED) {
      return { state: cadence === true && v < MOTION.RUN_MAX_SPEED ? "walking" : "vehicle", speed: v };
    }
    if (v > MOTION.WALK_MAX_SPEED) return { state: cadence === true ? "walking" : "unknown", speed: v };
    return { state: cadence === false ? "unknown" : "walking", speed: v };
  }
}
