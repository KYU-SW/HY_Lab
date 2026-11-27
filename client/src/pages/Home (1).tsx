import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  EXERCISES,
  EXERCISE_BY_ID,
  RECOMMENDED_SEC,
  CATEGORY_LABEL,
  BAND_LABEL,
  MAX_COUNTED_SEC,
  bandOf,
  kcalOf,
  metCorrection,
  scoreDay,
  type BodyProfile,
  type ExerciseCategory,
  type MoveRecord,
  type RecoveryRecord,
  type ScoreBreakdown,
} from "@shared/scoring";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Droplets,
  Footprints,
  HeartPulse,
  Home as HomeIcon,
  Info,
  Leaf,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  MoveUpRight,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { api, ApiError, type CalendarDay, type DailyGoal, type Dashboard, type EdemaLevel, type PeriodStat, type ReminderTime, type ScheduleBlock, type SessionUser } from "@/lib/api";
import { clearSession, loadSession, saveSession } from "@/lib/session";
import { TimetableScreen, type ClassDraft } from "@/pages/Timetable";
import { GpsClassifier, MOTION, StepDetector, type MotionState } from "@/lib/motion";

type Screen =
  | "splash"
  | "onboarding"
  | "auth"
  | "home"
  | "calendar"
  | "stats"
  | "settings"
  | "timetable"
  | "bodyinfo"
  | "timer";
type AuthMode = "login" | "signup";
type MoveMode = "seated" | "standing" | "recovery";
type RiskLevel = "safe" | "notice" | "risk";

type NavItem = {
  id: Exclude<Screen, "splash" | "onboarding" | "auth" | "timer">;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "calendar", label: "캘린더", icon: CalendarDays },
  { id: "timetable", label: "일정", icon: LayoutGrid },
  { id: "stats", label: "통계", icon: BarChart3 },
  { id: "settings", label: "설정", icon: Settings },
];

const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
const BREAK_INTERVAL_OPTIONS = [20, 30, 45, 60];

// ---- 점수 규칙은 shared/scoring.ts (최종안 v2) ----
const ZONE_NOTICE_MIN = 30; // 안전 ~30분 / 주의 30~60분 / 위험 60분 이상
const ZONE_RISK_MIN = 60;
const EMPTY_SCORE: ScoreBreakdown = scoreDay({ sitSeconds: 0, moves: [] });
const GRADE_CLASS: Record<string, string> = { "아주 좋음": "g1", 좋음: "g2", 주의: "g3", 위험: "g4" };

// ---- GPS 자동 감지 규칙 (판별 기준은 lib/motion.ts) ----
const GPS_STILL_HOLD_SEC = 120; // 걷기가 이 시간 동안 없으면 "앉아 계신가요?" 질문
const GPS_REASK_SEC = 300; // "아니요" 후 다시 묻기까지 간격

const onboardingSlides = [
  {
    eyebrow: "AWARENESS",
    title: "앉아있는 시간을\n있는 그대로 보여드려요",
    description: "지금 얼마나 오래 앉아있는지,\n매일의 흐름을 한눈에 확인해보세요.",
    visual: "gauge",
  },
  {
    eyebrow: "RHYTHM",
    title: "당신의 일정에 맞춰\n가장 좋은 순간에 알려드려요",
    description: "수업이나 회의 중에는 조용히.\n움직일 수 있는 시간에만 제안할게요.",
    visual: "schedule",
  },
  {
    eyebrow: "ACTION",
    title: "1~5분이면 충분해요",
    description: "자리에서 할 수 있는 작은 움직임으로\n오늘의 리듬을 가볍게 바꿔보세요.",
    visual: "movement",
  },
];

const movementCards: Record<MoveMode, { title: string; copy: string; categories: ExerciseCategory[]; icon: LucideIcon; accent: string }> = {
  seated: {
    title: "앉아서 가볍게",
    copy: "자리에서 바로 할 수 있는\n다리 혈액순환 동작이에요.",
    categories: ["seated"],
    icon: Footprints,
    accent: "mint",
  },
  standing: {
    title: "잠깐 일어나기",
    copy: "걷기·제자리 근력·계단 중에서\n지금 할 수 있는 걸 골라요.",
    categories: ["walk", "strength", "vigorous"],
    icon: MoveUpRight,
    accent: "lime",
  },
  recovery: {
    title: "회복 활동",
    copy: "숨이 조금 차는 활동을 길게 하면\n오늘 깎인 점수를 되찾아요.",
    categories: ["recovery", "vigorous"],
    icon: HeartPulse,
    accent: "lime",
  },
};

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function splitHoursMinutes(totalSeconds: number) {
  const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

function computeZone(elapsedSeconds: number, intervalMin: number): { level: RiskLevel; label: string } {
  void intervalMin; // 구간은 고정(30/60분), 휴식 주기는 알림 시점에만 사용
  if (elapsedSeconds < ZONE_NOTICE_MIN * 60) return { level: "safe", label: "편안함" };
  if (elapsedSeconds < ZONE_RISK_MIN * 60) return { level: "notice", label: "잠깐 전환" };
  return { level: "risk", label: "오래 앉음" };
}

function notifyBrowser(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    /* 알림 미지원 환경은 조용히 무시 */
  }
}

function LogoMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo-mark ${inverse ? "logo-mark--inverse" : ""}`} aria-hidden="true">
      <img src="/logo.png" alt="" />
    </span>
  );
}

function AppLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`app-logo ${inverse ? "app-logo--inverse" : ""}`}>
      <LogoMark inverse={inverse} />
      <span>시작점</span>
    </div>
  );
}

function StatusBar({ light = false }: { light?: boolean }) {
  return (
    <div className={`status-bar ${light ? "status-bar--light" : ""}`}>
      <span>9:41</span>
      <div className="status-right">
        <span className="signal-bars"><i /><i /><i /></span>
        <span className="wifi-dot">◔</span>
        <span className="battery"><i /></span>
      </div>
    </div>
  );
}

function PrototypeRail({ screen, onNavigate }: { screen: Screen; onNavigate: (next: Screen) => void }) {
  return (
    <aside className="prototype-rail">
      <div className="rail-label">UI / UX PREVIEW</div>
      <div className="rail-heading">
        <div>
          <span className="rail-kicker">STARTING POINT</span>
          <h1>시작점</h1>
        </div>
        <div className="rail-live"><span /> LIVE</div>
      </div>
      <p className="rail-description">좌식 습관을 가볍게 바꾸는<br />생활 리듬 앱 프로토타입</p>

      <div className="rail-section-label">FLOW MAP</div>
      <div className="flow-list">
        <button className={`flow-item ${screen === "splash" ? "is-active" : ""}`} onClick={() => onNavigate("splash")}>
          <span className="flow-index">01</span><span>첫 시작</span><ArrowRight size={14} />
        </button>
        <button className={`flow-item ${screen === "onboarding" ? "is-active" : ""}`} onClick={() => onNavigate("onboarding")}>
          <span className="flow-index">02</span><span>온보딩</span><ArrowRight size={14} />
        </button>
        <button className={`flow-item ${screen === "auth" || screen === "bodyinfo" ? "is-active" : ""}`} onClick={() => onNavigate("auth")}>
          <span className="flow-index">03</span><span>로그인 / 가입</span><ArrowRight size={14} />
        </button>
        <button className={`flow-item ${["home", "calendar", "stats", "settings", "timetable"].includes(screen) ? "is-active" : ""}`} onClick={() => onNavigate("home")}>
          <span className="flow-index">04</span><span>메인 앱</span><ArrowRight size={14} />
        </button>
      </div>

      <div className="rail-section-label rail-section-label--screens">SCREENS</div>
      <div className="rail-screen-grid">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`rail-screen ${screen === item.id ? "is-active" : ""}`} onClick={() => onNavigate(item.id)}>
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button className={`rail-screen ${screen === "timer" ? "is-active" : ""}`} onClick={() => onNavigate("timer")}>
          <TimerReset size={16} /><span>타이머</span>
        </button>
      </div>

      <div className="rail-note">
        <div className="rail-note-icon"><Sparkles size={16} /></div>
        <div>
          <strong>미리보기 모드</strong>
          <p>버튼을 눌러 화면을 이동해보세요.</p>
        </div>
      </div>
      <div className="rail-footer">DESIGNED FOR A LIGHTER DAY · 2026</div>
    </aside>
  );
}

function PhoneShell({ children, screen }: { children: React.ReactNode; screen: Screen }) {
  return (
    <section className="phone-stage">
      <div className="stage-toolbar">
        <div className="toolbar-breadcrumb"><span>프로토타입</span><ChevronRight size={13} /><strong>{screenLabel(screen)}</strong></div>
        <div className="toolbar-tools"><span className="toolbar-dot" /> <span>375 × 812</span> <MoreHorizontal size={16} /></div>
      </div>
      <div className="phone-shadow">
        <div className="phone-frame">
          <div className="phone-speaker" />
          <div className="phone-screen">{children}</div>
          <div className="phone-home-indicator" />
        </div>
      </div>
    </section>
  );
}

function screenLabel(screen: Screen) {
  const labels: Record<Screen, string> = {
    splash: "첫 시작",
    onboarding: "온보딩",
    auth: "로그인 / 가입",
    home: "홈",
    calendar: "캘린더",
    stats: "통계",
    settings: "설정",
    timetable: "일정",
    timer: "움직임 타이머",
    bodyinfo: "내 몸 정보",
  };
  return labels[screen];
}

function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen splash-screen">
      <StatusBar light />
      <div className="splash-content">
        <div className="splash-orbit splash-orbit--one" />
        <div className="splash-orbit splash-orbit--two" />
        <div className="splash-emblem"><LogoMark inverse /></div>
        <AppLogo inverse />
        <p>앉아있는 리듬에<br />작은 전환을 시작해요.</p>
      </div>
      <button className="splash-start" onClick={onStart}>미리보기 시작 <ArrowRight size={16} /></button>
      <span className="splash-footnote">YOUR DAILY RHYTHM, A LITTLE LIGHTER</span>
    </div>
  );
}

function OnboardingScreen({ step, onStepChange, onSkip, onComplete }: { step: number; onStepChange: (value: number) => void; onSkip: () => void; onComplete: () => void }) {
  const slide = onboardingSlides[step];
  return (
    <div className="screen onboarding-screen">
      <StatusBar />
      <div className="onboarding-top"><AppLogo /><button onClick={onSkip}>건너뛰기</button></div>
      <div className="onboarding-art-wrap">
        <OnboardingArt type={slide.visual} step={step} />
      </div>
      <div className="onboarding-copy">
        <span className="eyebrow">{slide.eyebrow}</span>
        <h2>{slide.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h2>
        <p>{slide.description.split("\n").map((line) => <span key={line}>{line}</span>)}</p>
      </div>
      <div className="onboarding-bottom">
        <div className="dot-indicator">{onboardingSlides.map((_, index) => <button key={index} aria-label={`${index + 1}번째 온보딩`} className={index === step ? "is-active" : ""} onClick={() => onStepChange(index)} />)}</div>
        <button className="primary-button onboarding-next" onClick={() => step === 2 ? onComplete() : onStepChange(step + 1)}>{step === 2 ? "시작해볼게요" : "다음"}<ArrowRight size={17} /></button>
      </div>
    </div>
  );
}

function OnboardingArt({ type, step }: { type: string; step: number }) {
  if (type === "gauge") {
    return <div className="onboarding-art art-gauge"><div className="art-spark spark-a" /><div className="art-spark spark-b" /><div className="mini-gauge"><div className="mini-gauge-arc" /><div className="mini-gauge-content"><span>연속 좌식</span><strong>01:32</strong><small>오늘 기록 중</small></div></div><div className="floating-pill pill-green"><Check size={12} /> 안전한 흐름</div><div className="floating-pill pill-gray"><Clock3 size={12} /> 실시간</div></div>;
  }
  if (type === "schedule") {
    return <div className="onboarding-art art-schedule"><div className="schedule-sun"><Bell size={22} /></div><div className="schedule-card"><div className="schedule-line"><span className="schedule-time">10:00</span><span className="schedule-title">오전 회의</span><span className="schedule-status">진행 중</span></div><div className="schedule-line schedule-line--active"><span className="schedule-time">12:30</span><span className="schedule-title">점심시간</span><span className="schedule-alert"><Bell size={13} /> 제안</span></div><div className="schedule-line"><span className="schedule-time">14:00</span><span className="schedule-title">스터디</span></div></div><div className="schedule-wave"><span /><span /><span /><span /><span /><span /><span /></div></div>;
  }
  return <div className="onboarding-art art-movement"><div className="move-ring move-ring--one" /><div className="move-ring move-ring--two" /><div className="move-person"><div className="person-head" /><div className="person-body" /><div className="person-leg person-leg--one" /><div className="person-leg person-leg--two" /><div className="person-arm person-arm--one" /><div className="person-arm person-arm--two" /></div><div className="movement-badge"><Zap size={15} fill="currentColor" /><span>1–5분<br /><strong>충분해요</strong></span></div><div className="movement-leaf leaf-one"><Leaf size={17} /></div><div className="movement-leaf leaf-two"><Leaf size={13} /></div></div>;
}

function AuthScreen({
  mode,
  onModeChange,
  onBack,
  onSubmit,
  onGoogle,
  googleClientId,
  providers,
  submitting,
  error,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onBack: () => void;
  onSubmit: (payload: { nickname: string; email: string; password: string }) => void;
  onGoogle: (credential: string) => void;
  googleClientId: string | null;
  providers: { kakao: boolean; naver: boolean; apple: boolean };
  submitting: boolean;
  error: string;
}) {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const onGoogleRef = useRef(onGoogle);
  onGoogleRef.current = onGoogle;

  const canSubmit = mode === "login" ? email.trim() && password : nickname.trim() && email.trim() && password.length >= 4;

  // 구글 로그인 버튼 (클라이언트 ID가 서버에 설정돼 있을 때만)
  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;
    const init = () => {
      const g = (window as any).google?.accounts?.id;
      if (!g || cancelled || !googleBtnRef.current) return;
      g.initialize({ client_id: googleClientId, callback: (r: { credential: string }) => onGoogleRef.current(r.credential) });
      g.renderButton(googleBtnRef.current, { theme: "outline", size: "large", width: 300, text: "continue_with", locale: "ko" });
    };
    if ((window as any).google?.accounts?.id) {
      init();
    } else {
      const sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client";
      sc.async = true;
      sc.onload = init;
      document.head.appendChild(sc);
    }
    return () => { cancelled = true; };
  }, [googleClientId]);

  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="auth-header"><button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button><AppLogo /><span className="auth-header-spacer" /></div>
      <div className="auth-intro"><span className="eyebrow">WELCOME TO SIJAKJEOM</span><h2>{mode === "login" ? "오늘의 리듬을\n이어가볼까요?" : "가볍게 시작하고\n꾸준히 이어가요."}</h2><p>{mode === "login" ? "나에게 맞는 작은 움직임을 다시 만나보세요." : "일정에 맞는 움직임 알림을 준비해드릴게요."}</p></div>
      <div className="auth-tabs"><button className={mode === "login" ? "is-active" : ""} onClick={() => onModeChange("login")}>로그인</button><button className={mode === "signup" ? "is-active" : ""} onClick={() => onModeChange("signup")}>회원가입</button></div>
      <div className="auth-form">
        {mode === "signup" && (
          <label>
            <span>닉네임</span>
            <div className="input-wrap"><UserRound size={17} /><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="어떻게 불러드릴까요?" /></div>
          </label>
        )}
        <label>
          <span>이메일</span>
          <div className="input-wrap"><span className="input-at">@</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@example.com" /></div>
        </label>
        <label>
          <span>비밀번호</span>
          <div className="input-wrap">
            <LockKeyhole size={17} />
            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4자 이상 입력해주세요" />
            <button type="button" className="eye-toggle" onClick={() => setShowPassword((v) => !v)}><EyeIcon /></button>
          </div>
        </label>
        {error && <p className="auth-error-text">{error}</p>}
        <button
          className="primary-button auth-submit"
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit({ nickname, email, password })}
        >
          {submitting ? "처리 중..." : mode === "login" ? "로그인" : "시작하기"}<ArrowRight size={17} />
        </button>
      </div>
      <div className="social-divider"><span>또는 간편하게</span></div>
      <div className="social-single">
        {googleClientId
          ? <div ref={googleBtnRef} />
          : <button className="social-disabled" disabled><span className="social-symbol google">G</span>구글로 계속하기 · 서버 설정 필요</button>}
      </div>
      <div className="social-list">
        {([
          ["kakao", "카카오로 계속하기", "social-kakao", "K"],
          ["naver", "네이버로 계속하기", "social-naver", "N"],
        ] as const).map(([key, label, cls, sym]) => providers[key]
          ? <a key={key} className={`social-link ${cls}`} href={`/api/auth/${key}/start`}><span className="social-symbol">{sym}</span>{label}</a>
          : <button key={key} className={`social-link social-disabled ${cls}`} disabled><span className="social-symbol">{sym}</span>{label} · 서버 설정 필요</button>)}
      </div>
      <p className="terms-copy">계속하면 <u>이용약관</u> 및 <u>개인정보 처리방침</u>에<br />동의하는 것으로 간주됩니다.</p>
    </div>
  );
}

function EyeIcon() { return <span className="eye-icon">◉</span>; }

const SCORE_PARTS: { key: "a1" | "a2" | "b" | "c"; label: string; max: number; hint: string }[] = [
  { key: "a1", label: "다리 혈관", max: 25, hint: "30분 안에 끊기" },
  { key: "a2", label: "혈당", max: 25, hint: "일어나서 끊기" },
  { key: "b", label: "움직인 양", max: 30, hint: "일어나서 움직인 시간" },
  { key: "c", label: "앉은 시간", max: 20, hint: "7시간 이하면 만점" },
];

function ScoreCard({ score, goal, compact = false }: { score: ScoreBreakdown; goal?: DailyGoal | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`score-card ${compact ? "score-card--compact" : ""}`} onClick={() => setOpen((v) => !v)}>
      <div className="score-card-top">
        <div><span className="section-kicker">TODAY SCORE</span><div className="score-total"><strong>{score.total}</strong><span>/ 100</span></div></div>
        {score.enoughData ? <span className={`grade-chip grade-chip--${GRADE_CLASS[score.grade]}`}>{score.grade}</span> : <span className="grade-chip grade-chip--wait">측정 중</span>}
      </div>
      <div className="score-parts">
        {SCORE_PARTS.map((p) => (
          <div key={p.key} className="score-part"><div className="score-part-head"><span>{p.label}</span><b>{score[p.key]}<small>/{p.max}</small></b></div><div className="score-bar"><i style={{ width: `${(score[p.key] / p.max) * 100}%` }} /></div></div>
        ))}
      </div>
      {(score.d > 0 || score.bonus > 0) && <div className="score-extra">{score.d > 0 && <span>회복 +{score.d}</span>}{score.bonus > 0 && <span>계단·숨찬 활동 보너스 +{score.bonus}</span>}</div>}
      {goal && <div className="score-goal">{goal.measuring ? <span>나의 목표: 기준선 측정 중 ({goal.daysCollected}/3일)</span> : <span>나의 목표: 30분 안에 끊기 <b>{Math.floor(goal.todayCredited)}</b> / {goal.goal}번 <small>(지난 기록 평균 {goal.baseline}번 + 15%)</small></span>}</div>}
      {!score.enoughData && <p className="score-note"><Info size={12} /> 앉은 기록이 1시간 미만이라 등급은 아직 측정 중이에요.</p>}
      {open && <div className="score-detail">
        <p>오늘 목표 끊기 {score.targetBreaks}번 (앉은 시간을 30분으로 나눈 값) · 혈관 인정 {score.credited1}번 · 혈당 인정 {score.credited2}번</p>
        <p>일어나서 움직인 시간 {score.activeMin}분 · 회복 활동 {score.recoveryMin}분 · 강도 계산 정확도 {score.accuracy}</p>
        <p className="score-detail-src">30분 안에 끊으면 1회, 30~60분 0.6회(혈당 0.3회), 60분 넘으면 0.25회(혈당 0회)로 인정해요. 앉아서 하는 동작은 다리 혈관 점수만 받아요.</p>
      </div>}
    </section>
  );
}

function HomeScreen({
  user,
  continuousSeconds,
  todaySeconds,
  movementCount,
  score,
  goal,
  zone,
  trackingOn,
  autoPaused,
  onToggleTracking,
  onMove,
  onNavigate,
}: {
  user: SessionUser;
  continuousSeconds: number;
  todaySeconds: number;
  movementCount: number;
  score: ScoreBreakdown;
  goal: DailyGoal | null;
  zone: { level: RiskLevel; label: string };
  trackingOn: boolean;
  autoPaused: boolean;
  onToggleTracking: () => void;
  onMove: () => void;
  onNavigate: (next: NavItem["id"]) => void;
}) {
  const today = splitHoursMinutes(todaySeconds);
  const needleRotate = Math.min(1, continuousSeconds / (60 * 60)) * 180 - 90;
  return (
    <div className="screen app-screen home-screen">
      <StatusBar />
      <div className="app-header"><div><span className="date-label">{new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</span><h2>좋은 하루예요, {user.nickname}님 <span>✦</span></h2></div><button className="avatar-button">{user.nickname.slice(0, 1)}</button></div>
      <ScoreCard score={score} goal={goal} />
      <section className={`gauge-card ${trackingOn ? "" : "is-paused"}`}>
        <div className="gauge-card-top"><span className="section-kicker">CURRENT RHYTHM</span></div>
        <div className="gauge-area">
          <div className="gauge-arc"><div className="gauge-arc-inner" /><div className="gauge-needle" style={{ transform: `rotate(${needleRotate}deg)` }} /></div>
          <div className="gauge-center"><span>연속 좌식 시간</span><strong>{formatClock(continuousSeconds)}</strong><small><i className={`zone-dot zone-dot--${trackingOn ? zone.level : "off"}`} /> {trackingOn ? zone.label : "기록 꺼짐"}</small></div>
        </div>
        <div className="gauge-legend"><span className={trackingOn && zone.level === "safe" ? "is-active" : ""}><i className="legend-dot legend-dot--safe" /> 편안함</span><span className={trackingOn && zone.level === "notice" ? "is-active" : ""}><i className="legend-dot legend-dot--notice" /> 잠깐 전환</span><span className={trackingOn && zone.level === "risk" ? "is-active" : ""}><i className="legend-dot legend-dot--risk" /> 오래 앉음</span></div>
        <div className="tracking-row"><div><strong>좌식 타이머</strong><small>{trackingOn ? "앉은 시간을 기록하고 알려드려요" : autoPaused ? "움직임이 감지돼 잠시 멈췄어요 · 멈추면 물어볼게요" : "꺼져 있어요 · 기록·알림이 멈춰요"}</small></div><button className={`toggle ${trackingOn ? "is-on" : ""}`} onClick={onToggleTracking} aria-label="좌식 타이머 켜기/끄기"><span /></button></div>
      </section>
      <section className="stat-grid">
        <div className="stat-card"><div className="stat-card-top"><span>오늘 총 좌식시간</span><Clock3 size={16} /></div><strong>{String(today.h).padStart(2, "0")}<span>h</span> {String(today.m).padStart(2, "0")}<span>m</span></strong><small>{user.breakIntervalMin}분마다 한 번씩 움직이면 좋아요</small></div>
        <div className="stat-card"><div className="stat-card-top"><span>움직임 실현 횟수</span><Footprints size={16} /></div><strong>{String(movementCount).padStart(2, "0")}<span>회</span></strong><small>오늘 기록된 횟수예요</small></div>
      </section>
      <button className="primary-button move-cta" onClick={onMove}><span className="cta-icon"><Zap size={17} fill="currentColor" /></span>지금 바로 움직이기<ArrowRight size={17} /></button>
      <BottomNav current="home" onNavigate={onNavigate} />
    </div>
  );
}

function BottomNav({ current, onNavigate }: { current: NavItem["id"]; onNavigate?: (next: NavItem["id"]) => void }) {
  return <nav className="bottom-nav">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={current === item.id ? "is-active" : ""} onClick={() => onNavigate?.(item.id)}><Icon size={19} strokeWidth={current === item.id ? 2.4 : 1.8} /><span>{item.label}</span></button>; })}</nav>;
}

function MoveSheet({ onClose, onSelect }: { onClose: () => void; onSelect: (mode: MoveMode) => void }) {
  return <div className="sheet-backdrop" onClick={onClose}><div className="move-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><span className="section-kicker">ONE SMALL SHIFT</span><h2>지금, 어떤 게 가능해요?</h2><p>지금의 상황에 맞는 움직임을 골라주세요.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="move-options"><button onClick={() => onSelect("seated")}><span className="move-option-icon move-option-icon--mint"><Footprints size={22} /></span><span><strong>지금 못 일어나요</strong><small>앉은 채로 1분, 다리 깨우기 (다리 혈관 점수)</small></span><ChevronRight size={18} /></button><button onClick={() => onSelect("standing")}><span className="move-option-icon move-option-icon--lime"><MoveUpRight size={22} /></span><span><strong>일어날 수 있어요</strong><small>걷기 · 제자리 근력 · 계단 (혈관+혈당 점수)</small></span><ChevronRight size={18} /></button><button onClick={() => onSelect("recovery")}><span className="move-option-icon move-option-icon--lime"><HeartPulse size={22} /></span><span><strong>운동·회복 활동</strong><small>조깅·자전거·빠르게 걷기를 길게 (깎인 점수 회복)</small></span><ChevronRight size={18} /></button></div><p className="sheet-footnote"><ShieldCheck size={14} /> 무리하지 않고 지금 가능한 만큼만 해요.</p></div></div>;
}

function TimerScreen({
  mode,
  todaySeconds,
  continuousSeconds,
  moves,
  recoveries,
  profile,
  onComplete,
  onBack,
}: {
  mode: MoveMode;
  todaySeconds: number;
  continuousSeconds: number;
  moves: MoveRecord[];
  recoveries: RecoveryRecord[];
  profile: BodyProfile;
  onComplete: (exerciseId: string, durationSec: number, asRecovery: boolean) => void;
  onBack: () => void;
}) {
  const movement = movementCards[mode];
  const options = useMemo(() => EXERCISES.filter((e) => movement.categories.includes(e.category)), [movement]);
  const [exerciseId, setExerciseId] = useState(options[0]?.id ?? "walk_easy");
  const ex = EXERCISE_BY_ID[exerciseId];
  const isRecovery = mode === "recovery";
  const required = isRecovery ? RECOMMENDED_SEC.recovery : RECOMMENDED_SEC[ex.category];
  const [elapsed, setElapsed] = useState(0);
  const [priorSit] = useState(continuousSeconds); // 이 동작 직전 연속 좌식 시간
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const done = elapsed >= required;
  const progress = Math.min(1, elapsed / required);
  const shown = done ? elapsed - required : required - elapsed;
  const mm = Math.floor(shown / 60);
  const fmt = `${String(mm).padStart(2, "0")}:${String(shown % 60).padStart(2, "0")}`;
  const Icon = movement.icon;
  const { factor, accuracy } = metCorrection(profile);
  const met = Math.round(ex.met * factor * 10) / 10;
  const band = bandOf(met);
  const kcal = kcalOf(exerciseId, elapsed, profile);

  const before = useMemo(() => scoreDay({ sitSeconds: todaySeconds, moves, recoveries, profile }), [todaySeconds, moves, recoveries, profile]);
  const after = scoreDay({
    sitSeconds: todaySeconds,
    moves: isRecovery ? moves : [...moves, { at: "", exerciseId, durationSec: elapsed, priorSitSec: priorSit }],
    recoveries: isRecovery ? [...recoveries, { at: "", exerciseId, durationSec: elapsed }] : recoveries,
    profile,
  });
  const gain = Math.round((after.total - before.total) * 10) / 10;
  const capped = !isRecovery && elapsed >= MAX_COUNTED_SEC;
  const groups = movement.categories.map((c) => ({ c, items: options.filter((o) => o.category === c) })).filter((g) => g.items.length);
  const priorMin = Math.round(priorSit / 60);
  const recoverable = 20 - before.c + 0.5 * (50 - before.a1 - before.a2);
  const breakNote = isRecovery
    ? recoverable < 0.5 ? "지금은 깎인 점수가 없어서 회복할 게 없어요. 많이 앉은 날 해두면 점수를 되찾아요."
      : met < 3 ? "이 강도로는 회복으로 인정되지 않아요 (중간 강도 이상)."
      : `회복 가능한 점수 ${Math.round(recoverable * 10) / 10}점 중 60분이면 전부 되찾아요.`
    : priorMin <= 30 ? `${priorMin}분 앉은 뒤 끊었어요 · 30분 이내라 1회로 인정`
    : priorMin <= 60 ? `${priorMin}분 앉은 뒤 끊었어요 · 혈관 0.6회, 혈당 0.3회로 인정`
    : `${priorMin}분 앉은 뒤 끊었어요 · 혈관 0.25회만 인정 (다음엔 30분 안에!)`;

  return <div className="screen app-screen timer-screen"><StatusBar />
    <div className="timer-header"><button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button><span>{isRecovery ? "회복 활동 타이머" : "움직임 타이머"}</span><button className="icon-button"><CircleHelp size={18} /></button></div>
    <div className="timer-intro"><span className="section-kicker">RIGHT NOW</span><h2>{movement.title}</h2><p>{movement.copy.split("\n").map((line) => <span key={line}>{line}</span>)}</p></div>
    <div className={`timer-circle timer-circle--${movement.accent}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}><div className="timer-circle-inner"><span>{done ? (isRecovery ? "권장 시간 달성 · 계속하면 더 회복" : "권장 시간 달성 · 추가 운동 +") : "권장 시간까지"}</span><strong>{fmt}</strong><small><i /> {capped ? "한 번에 5분까지 인정돼요" : done ? "계속하면 점수가 더 올라가요" : "천천히 따라 해보세요"}</small></div></div>
    <div className="gain-card"><div className="gain-head"><span>오늘 점수</span><strong>{before.total} → {after.total} <em>{gain > 0 ? `+${gain}` : ""}</em></strong></div><div className="gain-bar"><i style={{ width: `${Math.min(100, after.total)}%` }} /></div><small>{breakNote}</small></div>
    <div className="movement-detail-card"><div className={`movement-detail-icon movement-detail-icon--${movement.accent}`}><Icon size={23} /></div><div><span>{CATEGORY_LABEL[ex.category]} · 권장 {Math.round(required / 60)}분 · {ex.category === "seated" ? "다리 혈관 점수" : `${BAND_LABEL[band]} 강도 ${met} MET`}{kcal != null && elapsed > 0 ? ` · 약 ${kcal}kcal` : ""}</span><strong>{ex.name}</strong><p>{ex.desc}</p></div></div>
    <div className="exercise-picker">{groups.map((g) => <div key={g.c} className="exercise-group"><span className="exercise-group-label">{CATEGORY_LABEL[g.c]}</span><div className="action-chips action-chips--wrap">{g.items.map((o) => <button key={o.id} className={o.id === exerciseId ? "is-on" : ""} onClick={() => setExerciseId(o.id)}>{o.name}</button>)}</div></div>)}</div>
    <div className="timer-actions"><button className="secondary-button" onClick={onBack}><RotateCcw size={16} /> 다시 고르기</button><button className="primary-button" disabled={elapsed < 10} onClick={() => onComplete(exerciseId, elapsed, isRecovery)}><Check size={17} /> 완료했어요</button></div>
    <p className="medical-note"><Info size={13} /> 운동 강도는 2024 신체활동 강도 목록(Compendium) 값{accuracy === "기본" ? "" : `을 내 몸 정보로 보정한 추정값(정확도 ${accuracy})`}이에요. 통증이 있다면 멈추고 전문가와 상담하세요.</p>
  </div>;
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

function CalendarScreen({ userId, onNavigate }: { userId: string; onNavigate: (next: NavItem["id"]) => void }) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7))); // 1-12
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [records, setRecords] = useState<Record<string, CalendarDay>>({});
  const [loading, setLoading] = useState(false);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const isCurrentMonth = monthKey === todayIso.slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCalendar(userId, monthKey)
      .then((res) => {
        if (cancelled) return;
        setRecords(Object.fromEntries(res.days.map((d) => [d.date, d])));
      })
      .catch(() => { if (!cancelled) setRecords({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, monthKey]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dateOf = (day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;

  const recordedDays = Object.values(records).filter((r) => r.totalSeconds > 0 || r.movementCount > 0).length;
  const totalMovements = Object.values(records).reduce((sum, r) => sum + r.movementCount, 0);

  const moveMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const selected = records[selectedDate];
  const chooseEdema = async (level: EdemaLevel) => {
    const next = selected?.edema === level ? null : level;
    setRecords((prev) => ({
      ...prev,
      [selectedDate]: { ...({ date: selectedDate, totalSeconds: 0, movementCount: 0, maxContinuousSeconds: 0 } as CalendarDay), ...prev[selectedDate], edema: next },
    }));
    try { await api.setSignal(userId, selectedDate, next); } catch { /* 실패 시 다음 로드에서 복구 */ }
  };
  const selectedDay = Number(selectedDate.slice(8, 10));
  const selectedMonthLabel = Number(selectedDate.slice(5, 7));
  const activity = selected?.score ?? 0;
  const bd = selected?.breakdown;
  const delta = selected && selected.prev7Avg != null ? Math.round((activity - selected.prev7Avg) * 10) / 10 : null;

  return <div className="screen app-screen calendar-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">YOUR RECORD</span><h2>캘린더</h2></div><button className="icon-button" onClick={() => { setYear(Number(todayIso.slice(0, 4))); setMonth(Number(todayIso.slice(5, 7))); setSelectedDate(todayIso); }}><MoreHorizontal size={19} /></button></div><div className="calendar-summary"><div className="calendar-summary-icon"><CalendarDays size={17} /></div><div><strong>이번 달의 리듬</strong><span>{loading ? "불러오는 중..." : `${recordedDays}일 동안 기록했어요`}</span></div><div className="calendar-summary-score">{totalMovements}<span>회</span></div></div><div className="month-switcher"><button onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><strong>{year}년 {month}월</strong><button onClick={() => moveMonth(1)} disabled={isCurrentMonth} style={isCurrentMonth ? { opacity: 0.3 } : undefined}><ChevronRight size={18} /></button></div><div className="calendar-weekdays">{WEEKDAY_LABEL.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}{days.map((day) => { const date = dateOf(day); const rec = records[date]; const ring = rec ? (rec.score ?? 0) : 0; const hasRecord = !!rec && (rec.totalSeconds > 0 || rec.movementCount > 0); return <button key={day} onClick={() => setSelectedDate(date)} disabled={date > todayIso} style={date > todayIso ? { opacity: 0.35 } : undefined} className={`${date === todayIso ? "today" : ""} ${selectedDate === date ? "is-selected" : ""} ${hasRecord ? "has-ring" : ""}`}><span>{day}</span>{hasRecord && <i style={{ "--ring": `${Math.max(ring, 8)}%` } as React.CSSProperties} />}</button>; })}</div><div className="calendar-legend"><span><i className="legend-ring" /> 건강 점수 (100점)</span><span className="calendar-selected-label">{selectedMonthLabel}월 {selectedDay}일 선택됨</span></div><div className="record-sheet"><div className="record-sheet-heading"><div><span className="section-kicker">{selectedDate}</span><h3>{selectedMonthLabel}월 {selectedDay}일의 기록</h3></div><span className="record-day-score">{activity}점{bd ? ` · ${bd.grade}` : ""}</span></div>{selected ? <><div className="record-row"><span className="record-row-icon"><Clock3 size={17} /></span><div><strong>총 좌식시간</strong><span>{formatDuration(selected.totalSeconds)}</span></div></div><div className="record-row"><span className="record-row-icon"><Footprints size={17} /></span><div><strong>움직임 실현 횟수</strong><span>{selected.movementCount}회</span></div></div><div className="record-row"><span className="record-row-icon record-row-icon--peach"><HeartPulse size={17} /></span><div><strong>연속 좌식 최대 시간</strong><span>{selected.maxContinuousSeconds > 0 ? formatDuration(selected.maxContinuousSeconds) : "기록 없음"}</span></div></div><div className="record-row"><span className="record-row-icon"><Sparkles size={17} /></span><div><strong>최근 7일 평균 대비</strong><span>{delta === null ? "비교할 기록이 아직 없어요" : `${delta > 0 ? "+" : ""}${delta}점 (평균 ${selected.prev7Avg}점)`}</span></div></div>{bd && <div className="record-row"><span className="record-row-icon"><BarChart3 size={17} /></span><div><strong>점수 구성</strong><span>혈관 {bd.a1} · 혈당 {bd.a2} · 움직인 양 {bd.b} · 앉은 시간 {bd.c}{bd.d ? ` · 회복 +${bd.d}` : ""}{bd.bonus ? ` · 보너스 +${bd.bonus}` : ""}</span></div></div>}</> : <div className="record-row"><span className="record-row-icon"><Info size={17} /></span><div><strong>기록이 없어요</strong><span>{selectedDate === todayIso ? "오늘 사용을 시작하면 여기에 쌓여요" : "이 날은 앱을 사용하지 않았어요"}</span></div></div>}<div className="record-row record-row--signal"><span className="record-row-icon record-row-icon--peach"><Droplets size={17} /></span><div><strong>부종 기록</strong><span>{selected?.edema ? `${selected.edema}` : "그날 다리 붓기를 남겨보세요"}</span></div></div><div className="signal-picker"><div>{(["없음", "약함", "보통", "심함"] as EdemaLevel[]).map((lv) => <button key={lv} className={selected?.edema === lv ? "is-active" : ""} onClick={() => chooseEdema(lv)}>{lv}</button>)}</div></div></div><BottomNav current="calendar" onNavigate={onNavigate} /></div>;
}

function formatMinutes(min: number) {
  const m = Math.max(0, Math.round(min));
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

function StatsScreen({ userId, onNavigate, weeklyMinutes, breakIntervalMin }: { userId: string; onNavigate: (next: NavItem["id"]) => void; weeklyMinutes: { date: string; minutes: number }[]; breakIntervalMin: number }) {
  const [period, setPeriod] = useState("일간");
  const [remote, setRemote] = useState<PeriodStat[] | null>(null);

  useEffect(() => {
    if (period === "일간") { setRemote(null); return; }
    let cancelled = false;
    api.getStats(userId, period === "주간" ? "weekly" : "monthly")
      .then((res) => { if (!cancelled) setRemote(res.items); })
      .catch(() => { if (!cancelled) setRemote([]); });
    return () => { cancelled = true; };
  }, [userId, period]);

  const items: { label: string; minutes: number; movements?: number }[] = useMemo(() => {
    if (period === "일간") {
      return weeklyMinutes.map((d) => ({ label: WEEKDAY_LABEL[new Date(`${d.date}T00:00:00+09:00`).getDay()], minutes: d.minutes }));
    }
    return remote ?? [];
  }, [period, weeklyMinutes, remote]);

  const max = Math.max(1, ...items.map((i) => i.minutes));
  const total = items.reduce((sum, i) => sum + i.minutes, 0);
  const activeItems = items.filter((i) => i.minutes > 0);
  const avg = activeItems.length ? Math.round(total / activeItems.length) : 0;
  const last = items[items.length - 1];
  const prev = items[items.length - 2];
  const diff = last && prev ? last.minutes - prev.minutes : 0;
  const unit = period === "일간" ? "어제" : period === "주간" ? "지난주" : "지난달";
  const recordedDays = weeklyMinutes.filter((d) => d.minutes > 0).length;
  const totalMovements = items.reduce((sum, i) => sum + (i.movements ?? 0), 0);

  let insight = "며칠 더 사용하면 나만의 활동 패턴을 분석해드릴게요.";
  if (activeItems.length >= 2 && prev && prev.minutes > 0) {
    insight = diff === 0
      ? `${unit}와 좌식 시간이 같아요.`
      : diff < 0
        ? `${unit}보다 좌식 시간이 ${formatMinutes(-diff)} 줄었어요.`
        : `${unit}보다 좌식 시간이 ${formatMinutes(diff)} 늘었어요. 중간중간 움직여볼까요?`;
  }

  return <div className="screen app-screen stats-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">YOUR TREND</span><h2>통계</h2></div></div><div className="stats-hero"><div><span className="section-kicker">THIS WEEK</span><strong>{recordedDays}<span>일</span></strong><small>최근 7일 중 기록이 있는 날</small></div></div><div className="segmented">{["일간", "주간", "월간"].map((item) => <button key={item} className={period === item ? "is-active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div><div className="trend-card"><div className="trend-card-heading"><div><span className="section-kicker">SITTING TIME</span><h3>좌식 시간 추이</h3></div><span className="trend-change">평균 {formatMinutes(avg)}</span></div><div className="chart-wrap"><div className="chart-y"><span>{formatMinutes(max)}</span><span>{formatMinutes(max / 2)}</span><span>0</span></div><div className="bar-chart">{items.map((item, index) => <div className="bar-column" key={index}><div className={`bar ${index === items.length - 1 ? "is-highlight" : ""}`} style={{ height: `${Math.max(item.minutes > 0 ? 4 : 0, (item.minutes / max) * 100)}%` }} /><small>{item.label}</small></div>)}</div></div><p className="chart-caption"><span /> {activeItems.length ? `기록이 있는 ${period === "일간" ? "날" : period === "주간" ? "주" : "달"} 평균 ${formatMinutes(avg)}` : "기록이 쌓이면 여기에 보여드릴게요"}</p></div><div className="stats-metric-row"><div><span>{period === "일간" ? "오늘 좌식시간" : "이번 기간 좌식"}</span><strong>{formatMinutes(last?.minutes ?? 0)}</strong><small>실시간 기록</small></div><div><span>{period === "일간" ? "권장 전환 주기" : "움직임 횟수"}</span><strong>{period === "일간" ? breakIntervalMin : totalMovements}<span>{period === "일간" ? "분" : "회"}</span></strong><small>{period === "일간" ? "설정에서 바꿀 수 있어요" : "표시된 기간 합계"}</small></div></div><div className="insight-card"><div className="insight-icon"><Sparkles size={18} /></div><div><strong>{activeItems.length >= 2 ? "지난 기간과 비교했어요" : "꾸준히 기록할수록 더 정확해져요"}</strong><p>{insight}</p></div></div><BottomNav current="stats" onNavigate={onNavigate} /></div>;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(Array.from(raw, (c) => c.charCodeAt(0)));
}

const EMPTY_BODY = { sex: "", birthYear: "", heightCm: "", weightKg: "", bodyFatPct: "" };

function BodyForm({ initial, onSave, saveLabel, showDelete = false, onSaved }: { initial: BodyProfile; onSave: (p: BodyProfile | null) => Promise<string | null>; saveLabel: string; showDelete?: boolean; onSaved?: () => void }) {
  const [body, setBody] = useState<Record<string, string>>(() => ({
    sex: initial.sex ?? "",
    birthYear: initial.birthYear ? String(initial.birthYear) : "",
    heightCm: initial.heightCm ? String(initial.heightCm) : "",
    weightKg: initial.weightKg ? String(initial.weightKg) : "",
    bodyFatPct: initial.bodyFatPct ? String(initial.bodyFatPct) : "",
  }));
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const draft: BodyProfile = {
    sex: body.sex === "male" || body.sex === "female" ? body.sex : undefined,
    birthYear: body.birthYear ? Number(body.birthYear) : undefined,
    heightCm: body.heightCm ? Number(body.heightCm) : undefined,
    weightKg: body.weightKg ? Number(body.weightKg) : undefined,
    bodyFatPct: body.bodyFatPct ? Number(body.bodyFatPct) : undefined,
  };
  const corr = metCorrection(draft);
  const set = (k: string, v: string) => { setBody((b) => ({ ...b, [k]: v })); setMsg(""); };
  return <>
    <p className="body-purpose">운동 강도와 소모 칼로리를 내 몸에 맞게 계산하는 데만 써요. 모두 선택이고, 설정에서 언제든 고치거나 지울 수 있어요. 점수 기준(30분마다 끊기·하루 7시간 등)은 모두에게 같아요.</p>
    <div className="body-grid">
      <label>성별<select value={body.sex} onChange={(e) => set("sex", e.target.value)}><option value="">선택 안 함</option><option value="male">남</option><option value="female">여</option></select></label>
      <label>출생연도<input inputMode="numeric" placeholder="예: 2005" value={body.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} /></label>
      <label>키 (cm)<input inputMode="decimal" placeholder="예: 175" value={body.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/[^0-9.]/g, ""))} /></label>
      <label>몸무게 (kg)<input inputMode="decimal" placeholder="예: 70" value={body.weightKg} onChange={(e) => set("weightKg", e.target.value.replace(/[^0-9.]/g, ""))} /></label>
      <label className="body-grid-wide">체지방률 (%) · 인바디 결과가 있으면<input inputMode="decimal" placeholder="모르면 비워두세요" value={body.bodyFatPct} onChange={(e) => set("bodyFatPct", e.target.value.replace(/[^0-9.]/g, ""))} /></label>
    </div>
    <p className="body-preview">이 정보로 계산하면 정확도 <b>{corr.accuracy}</b>{corr.accuracy !== "기본" ? ` · 빠르게 걷기(기본 4.8 MET) → ${Math.round(4.8 * corr.factor * 10) / 10} MET` : " · 성별·출생연도·키·몸무게를 모두 넣으면 보정돼요"}</p>
    {msg && <p className="panel-msg">{msg}</p>}
    <div className="body-actions">
      <button className="panel-save" disabled={saving} onClick={async () => { setSaving(true); const err = await onSave(draft); setSaving(false); setMsg(err ?? "저장했어요"); if (!err) onSaved?.(); }}>{saveLabel}</button>
      {showDelete && <button className="panel-delete" onClick={async () => { const err = await onSave(null); if (!err) setBody(EMPTY_BODY); setMsg(err ?? "몸 정보를 지웠어요"); }}>모두 지우기</button>}
    </div>
  </>;
}

function BodyInfoScreen({ nickname, onSave, onDone }: { nickname: string; onSave: (p: BodyProfile | null) => Promise<string | null>; onDone: () => void }) {
  return <div className="screen app-screen bodyinfo-screen"><StatusBar />
    <div className="bodyinfo-top"><AppLogo /><button className="bodyinfo-skip" onClick={onDone}>나중에 할게요</button></div>
    <div className="bodyinfo-intro"><span className="section-kicker">ALMOST THERE · 선택</span><h2>{nickname}님 몸에 맞게<br />계산해 드릴게요</h2><p>같은 계단을 올라도 사람마다 힘든 정도가 달라요. 몸 정보를 알려주시면 운동 강도와 칼로리를 내 몸 기준으로 계산해요.</p></div>
    <div className="bodyinfo-card"><BodyForm initial={{}} onSave={onSave} saveLabel="저장하고 시작하기" onSaved={onDone} /></div>
    <div className="bodyinfo-levels"><div><b>기본</b><span>입력 없음 · 표준 강도로 계산</span></div><div><b>보통</b><span>성별·출생연도·키·몸무게</span></div><div><b>높음</b><span>+ 체지방률 (근육·지방 구분)</span></div></div>
    <p className="medical-note"><ShieldCheck size={13} /> 입력하지 않아도 점수는 똑같이 계산돼요. 강도 보정만 빠져요.</p>
  </div>;
}

function SettingsScreen({
  user,
  onNavigate,
  onUpdateBreakInterval,
  onUpdateQuietEnabled,
  onSaveNickname,
  notifyOn,
  onToggleNotify,
  pushSupported,
  pushOn,
  onTogglePush,
  autoDetect,
  gpsMsg,
  onToggleAutoDetect,
  reminders,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  schedule,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onImportIcs,
  onOpenTimetable,
  onLogout,
  profile,
  onSaveProfile,
}: {
  profile: BodyProfile;
  onSaveProfile: (p: BodyProfile | null) => Promise<string | null>;
  user: SessionUser;
  onNavigate: (next: NavItem["id"]) => void;
  onUpdateBreakInterval: (minutes: number) => void;
  onUpdateQuietEnabled: (enabled: boolean) => void;
  onSaveNickname: (nickname: string) => Promise<string | null>;
  notifyOn: boolean;
  onToggleNotify: () => void;
  pushSupported: boolean;
  pushOn: boolean;
  onTogglePush: () => void;
  autoDetect: boolean;
  gpsMsg: string;
  onToggleAutoDetect: () => void;
  reminders: ReminderTime[];
  onAddReminder: () => void;
  onUpdateReminder: (id: string, patch: Partial<Omit<ReminderTime, "id">>) => void;
  onRemoveReminder: (id: string) => void;
  schedule: ScheduleBlock[];
  onAddBlock: () => void;
  onUpdateBlock: (id: string, patch: Partial<Omit<ScheduleBlock, "id">>) => void;
  onRemoveBlock: (id: string) => void;
  onImportIcs: (source: { ics?: string; url?: string }) => Promise<string>;
  onOpenTimetable: () => void;
  onLogout: () => void;
}) {
  const [openRow, setOpenRow] = useState("");
  const [nick, setNick] = useState(user.nickname);
  const [nickMsg, setNickMsg] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedAcc = metCorrection(profile).accuracy;
  const toggleRow = (row: string) => setOpenRow((current) => current === row ? "" : row);

  const runImport = async (source: { ics?: string; url?: string }) => {
    setImporting(true);
    setImportMsg("");
    setImportMsg(await onImportIcs(source));
    setImporting(false);
  };
  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) { setImportMsg("파일이 너무 커요 (2MB 이하)."); return; }
    await runImport({ ics: await file.text() });
    if (fileRef.current) fileRef.current.value = "";
  };

  return <div className="screen app-screen settings-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">MAKE IT YOURS</span><h2>설정</h2></div><button className="icon-button" onClick={() => setOpenRow("")}><MoreHorizontal size={19} /></button></div>
    <div className="profile-card profile-card--editable" onClick={() => toggleRow("profile")}><div className="profile-avatar">{user.nickname.slice(0, 1)}</div><div><strong>{user.nickname}</strong><span>{user.email}</span></div><span className="profile-edit">프로필 수정</span><ChevronRight size={17} /></div>
    {openRow === "profile" && <div className="inline-panel profile-panel">
      <label>닉네임<input value={nick} maxLength={20} onChange={(e) => { setNick(e.target.value); setNickMsg(""); }} /></label>
      {nickMsg && <p className="panel-msg">{nickMsg}</p>}
      <button className="panel-save" onClick={async () => { const err = await onSaveNickname(nick.trim()); setNickMsg(err ?? "저장했어요"); }}>저장</button>
    </div>}
    <div className="settings-group">
      <span className="settings-group-label">맞춤 점수</span>
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("body")}><span className="setting-icon setting-icon--orange"><HeartPulse size={17} /></span><div><strong>내 몸 정보 (선택)</strong><small>운동 강도 계산 정확도: {savedAcc}{savedAcc === "기본" ? " · 입력하면 내 몸에 맞게 보정돼요" : ""}</small></div><ChevronRight size={17} /></div>
      {openRow === "body" && <div className="inline-panel body-panel"><BodyForm initial={profile} onSave={onSaveProfile} saveLabel="저장" showDelete /></div>}
    </div>
    <div className="settings-group">
      <span className="settings-group-label">알림 & 일정</span>
      <div className="setting-row"><span className="setting-icon setting-icon--green"><Bell size={17} /></span><div><strong>앱 안 알림</strong><small>{notifyOn ? "앱이 열려 있을 때 알려드려요" : "알림이 꺼져 있어요"}</small></div><button className={`toggle ${notifyOn ? "is-on" : ""}`} onClick={onToggleNotify}><span /></button></div>
      <div className="setting-row"><span className="setting-icon setting-icon--blue"><Zap size={17} /></span><div><strong>백그라운드 푸시</strong><small>{pushSupported ? (pushOn ? "앱을 닫아도 알림이 와요" : "앱을 닫아도 알림 받기") : "https 접속에서만 쓸 수 있어요"}</small></div><button className={`toggle ${pushOn ? "is-on" : ""}`} disabled={!pushSupported} onClick={onTogglePush}><span /></button></div>
      <div className="setting-row"><span className="setting-icon setting-icon--green"><MoveUpRight size={17} /></span><div><strong>자동 움직임 감지 (GPS)</strong><small>{gpsMsg}</small></div><button className={`toggle ${autoDetect ? "is-on" : ""}`} onClick={onToggleAutoDetect}><span /></button></div>
      <div className="setting-row"><span className="setting-icon setting-icon--orange"><TimerReset size={17} /></span><div><strong>권장 휴식 주기</strong><small>이 시간이 지나면 '오래 앉음'으로 표시돼요</small></div><select className="interval-select" value={user.breakIntervalMin} onChange={(e) => onUpdateBreakInterval(Number(e.target.value))}>{BREAK_INTERVAL_OPTIONS.map((m) => <option key={m} value={m}>{m}분</option>)}</select></div>
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("reminders")}><span className="setting-icon setting-icon--green"><Clock3 size={17} /></span><div><strong>정해진 시간 알림</strong><small>{reminders.filter((r) => r.enabled).length}개 켜져 있어요</small></div><ChevronRight size={17} /></div>
      {openRow === "reminders" && (
        <div className="inline-panel schedule-panel">
          <div className="schedule-block-list">
            {reminders.length === 0 && <p className="schedule-empty">정한 시각에 "움직일 시간"을 알려드려요. 추가해보세요.</p>}
            {reminders.map((r) => (
              <div className="schedule-block-row" key={r.id}>
                <input className="schedule-block-title" value={r.label} onChange={(e) => onUpdateReminder(r.id, { label: e.target.value })} placeholder="예: 점심 후 산책" />
                <select className="schedule-block-day" value={r.day === null ? "all" : r.day} onChange={(e) => onUpdateReminder(r.id, { day: e.target.value === "all" ? null : Number(e.target.value) })}>
                  <option value="all">매일</option>
                  {WEEKDAY_LABEL.map((label, idx) => <option key={idx} value={idx}>{label}요일</option>)}
                </select>
                <div className="schedule-block-time"><input type="time" value={r.time} onChange={(e) => e.target.value && onUpdateReminder(r.id, { time: e.target.value })} /></div>
                <label className="schedule-block-notify"><input type="checkbox" checked={r.enabled} onChange={(e) => onUpdateReminder(r.id, { enabled: e.target.checked })} /><span>켜기</span></label>
                <button className="schedule-block-remove" onClick={() => onRemoveReminder(r.id)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="schedule-add-button" onClick={onAddReminder}><Plus size={15} /> 알림 시각 추가</button>
        </div>
      )}
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("schedule")}><span className="setting-icon setting-icon--blue"><CalendarDays size={17} /></span><div><strong>일정 관리 · 캘린더 연동</strong><small>일정 시간엔 알림을 조절해요</small></div><ChevronRight size={17} /></div>
      {openRow === "schedule" && (
        <div className="inline-panel schedule-panel">
          <div className="import-box">
            <strong>캘린더 가져오기 (.ics)</strong>
            <small>구글 캘린더 '비공개 iCal 주소' 또는 내보낸 .ics 파일, 에브리타임 시간표를 .ics로 내보낸 파일을 쓸 수 있어요.</small>
            <div className="import-url-row">
              <input value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://calendar.google.com/…/basic.ics" />
              <button disabled={importing || !icsUrl.trim()} onClick={() => runImport({ url: icsUrl.trim() })}>가져오기</button>
            </div>
            <input ref={fileRef} type="file" accept=".ics,text/calendar" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <button className="schedule-add-button" disabled={importing} onClick={() => fileRef.current?.click()}><Plus size={15} /> .ics 파일 선택</button>
            {importing && <p className="panel-msg">불러오는 중...</p>}
            {importMsg && <p className="panel-msg">{importMsg}</p>}
          </div>
          <div className="quiet-row">
            <div><strong>일정 시간엔 조용히</strong><small>아래 등록한 시간대엔 알림을 자동으로 줄여요</small></div>
            <button className={`toggle ${user.scheduleQuietEnabled ? "is-on" : ""}`} onClick={() => onUpdateQuietEnabled(!user.scheduleQuietEnabled)}><span /></button>
          </div>
          <button className="schedule-add-button" onClick={onOpenTimetable}><CalendarDays size={15} /> 주간 일정 보기·편집 ({new Set(schedule.filter((b) => !b.date).map((b) => b.groupId ?? b.id)).size}개 일정)</button>
        </div>
      )}
    </div>
    <div className="settings-group">
      <span className="settings-group-label">앱 정보 & 도움말</span>
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("guide")}><span className="setting-icon setting-icon--purple"><CircleHelp size={17} /></span><div><strong>시작점 사용 가이드</strong><small>앱을 더 잘 활용하는 방법</small></div><ChevronRight size={17} /></div>{openRow === "guide" && <div className="inline-panel guide-panel"><div className="guide-step"><span>01</span><div><strong>앉아있는 시간을 확인해요</strong><small>홈 게이지에서 현재 흐름을 확인하세요.</small></div></div><div className="guide-step"><span>02</span><div><strong>가능한 움직임을 골라요</strong><small>일어날 수 없는 순간에도 할 수 있어요.</small></div></div></div>}
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("privacy")}><span className="setting-icon setting-icon--gray"><ShieldCheck size={17} /></span><div><strong>개인정보 보호</strong><small>내 기록은 안전하게 보호돼요</small></div><ChevronRight size={17} /></div>{openRow === "privacy" && <div className="inline-panel privacy-panel"><ShieldCheck size={16} /><span>기록은 나의 흐름을 이해하기 위한 용도로만 사용돼요.</span></div>}
    </div>
    <button className="logout-row" onClick={onLogout}><LogOut size={17} /> 로그아웃</button>
    <div className="settings-footer-card"><div className="settings-footer-icon"><Leaf size={16} /></div><div><strong>오늘도 충분히 잘하고 있어요</strong><span>작은 행동 하나가 다음 흐름을 바꿔요.</span></div></div>
    <p className="settings-version">시작점 v0.3 · 로그인/휴식타이머/캘린더 연동</p>
    <BottomNav current="settings" onNavigate={onNavigate} />
  </div>;
}

export default function Home() {
  const [session, setSession] = useState<SessionUser | null>(() => loadSession());
  const [screen, setScreen] = useState<Screen>(session ? "home" : "splash");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<MoveMode>("seated");
  const [toast, setToast] = useState("");

  const [continuousSeconds, setContinuousSeconds] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [weeklyMinutes, setWeeklyMinutes] = useState<{ date: string; minutes: number }[]>([]);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [reminders, setReminders] = useState<ReminderTime[]>([]);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [providers, setProviders] = useState({ kakao: false, naver: false, apple: false });
  const [pushOn, setPushOn] = useState(false);
  const [notifyOn, setNotifyOn] = useState(() => {
    try { return localStorage.getItem("sijakjeom_notif") !== "off"; } catch { return true; }
  });
  const [todayMoves, setTodayMoves] = useState<MoveRecord[]>([]);
  const [todayRecoveries, setTodayRecoveries] = useState<RecoveryRecord[]>([]);
  const [score, setScore] = useState<ScoreBreakdown>(EMPTY_SCORE);
  const [goal, setGoal] = useState<DailyGoal | null>(null);
  const [profile, setProfile] = useState<BodyProfile>({});
  const [autoDetect, setAutoDetect] = useState(() => {
    try { return localStorage.getItem("sijakjeom_autodetect") === "on"; } catch { return false; }
  });
  const [autoPaused, setAutoPaused] = useState(false);
  const [askSitting, setAskSitting] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const [motionInfo, setMotionInfo] = useState("");
  const gpsSupported = typeof navigator !== "undefined" && "geolocation" in navigator && typeof window !== "undefined" && window.isSecureContext;
  const trackingRef = useRef(true);
  const autoPausedRef = useRef(false);
  const askOpenRef = useRef(false);
  const notifiedRef = useRef(false);
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const pushSupported = !!vapidKey && typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window;

  const trackingOn = session?.trackingEnabled !== false;
  trackingRef.current = trackingOn;
  autoPausedRef.current = autoPaused;
  askOpenRef.current = askSitting;
  const zone = useMemo(() => computeZone(trackingOn ? continuousSeconds : 0, session?.breakIntervalMin ?? 30), [continuousSeconds, session?.breakIntervalMin, trackingOn]);

  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };

  const syncFromDashboard = (dash: Dashboard) => {
    setContinuousSeconds(dash.continuousSeconds);
    setTodaySeconds(dash.todaySeconds);
    setMovementCount(dash.todayMovementCount);
    setTodayMoves(dash.todayMoves ?? []);
    setTodayRecoveries(dash.todayRecoveries ?? []);
    if (dash.score) setScore(dash.score);
    setGoal(dash.goal ?? null);
    setProfile(dash.profile ?? {});
    setQuiet(dash.quiet);
  };

  useEffect(() => {
    api.getConfig().then((c) => { setGoogleClientId(c.googleClientId); setVapidKey(c.vapidPublicKey); if (c.providers) setProviders(c.providers); }).catch(() => {});
  }, []);

  // 카카오/네이버/애플 로그인 후 돌아왔을 때
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("login_ticket");
    const err = params.get("login_error");
    if (!ticket && !err) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (err) { setAuthError(err); setScreen("auth"); return; }
    api.exchangeTicket(ticket!)
      .then((r) => enterApp(r.user))
      .catch((e) => { setAuthError(e instanceof ApiError ? e.message : "로그인에 실패했어요."); setScreen("auth"); });
  }, []);

  useEffect(() => {
    if (!session || !pushSupported) { setPushOn(false); return; }
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushOn(!!sub && Notification.permission === "granted"))
      .catch(() => setPushOn(false));
  }, [session?.id, pushSupported]);

  // 세션이 생기면: 대시보드/주간기록/일정 로드 + 1초마다 로컬 틱 + 15초마다 서버 동기화
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      try {
        const dash = await api.getDashboard(session.id);
        if (!cancelled) syncFromDashboard(dash);
        const weekly = await api.getWeekly(session.id);
        if (!cancelled) setWeeklyMinutes(weekly.days);
        const sched = await api.listSchedule(session.id);
        if (!cancelled) setSchedule(sched.blocks);
        const rem = await api.listReminders(session.id);
        if (!cancelled) setReminders(rem.reminders);
      } catch {
        /* 초기 로드 실패는 조용히 무시, 다음 동기화에서 재시도 */
      }
    })();

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    if (!trackingOn) {
      return () => { cancelled = true; };
    }

    const tickTimer = window.setInterval(() => {
      setContinuousSeconds((s) => s + 1);
      setTodaySeconds((s) => s + 1);
    }, 1000);

    const syncTimer = window.setInterval(async () => {
      try {
        const hb = await api.heartbeat(session.id, 15);
        setTodaySeconds(hb.todaySeconds);
        setMovementCount(hb.todayMovementCount);
        const dash = await api.getDashboard(session.id);
        setContinuousSeconds(dash.continuousSeconds);
        setQuiet(dash.quiet);
      } catch {
        /* 네트워크 문제는 다음 주기에 재시도 */
      }
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(tickTimer);
      window.clearInterval(syncTimer);
    };
  }, [session?.id, trackingOn]);

  // 앱이 열려 있을 때 정해진 시각 알림 (푸시 구독 중이면 서버가 보내므로 건너뜀)
  useEffect(() => {
    if (!session || !notifyOn) return;
    const timer = window.setInterval(() => {
      if (quiet || pushOn) return;
      const now = new Date();
      const hm = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
      const day = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })).getDay();
      const minuteKey = `${now.toISOString().slice(0, 16)}`;
      for (const r of reminders) {
        if (!r.enabled || r.time !== hm || (r.day !== null && r.day !== day)) continue;
        const key = `${r.id}:${minuteKey}`;
        if (firedRemindersRef.current.has(key)) continue;
        firedRemindersRef.current.add(key);
        showToast(r.label || "움직일 시간이에요");
        notifyBrowser("시작점", r.label || "움직일 시간이에요");
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [session?.id, notifyOn, reminders, quiet, pushOn]);

  // 휴식 구간(오래 앉음) 진입 시 1회 알림
  useEffect(() => {
    if (trackingOn && continuousSeconds >= (session?.breakIntervalMin ?? 30) * 60) {
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        if (!quiet && notifyOn) {
          showToast(`${session?.breakIntervalMin ?? 30}분이 지났어요. 잠깐 움직여볼까요?`);
          if (!pushOn) notifyBrowser("시작점", `${session?.breakIntervalMin ?? 30}분이 지났어요. 잠깐 일어나서 움직여보세요!`);
        }
      }
    } else {
      notifiedRef.current = false;
    }
  }, [continuousSeconds >= (session?.breakIntervalMin ?? 30) * 60, quiet, session?.breakIntervalMin, trackingOn, notifyOn, pushOn]);

  const BODY_ASKED_KEY = "sijakjeom_bodyinfo_asked_";
  const enterApp = (user: SessionUser) => {
    saveSession(user);
    setSession(user);
    const hasProfile = !!user.profile && Object.keys(user.profile).length > 0;
    let asked = false;
    try { asked = localStorage.getItem(BODY_ASKED_KEY + user.id) === "1"; localStorage.setItem(BODY_ASKED_KEY + user.id, "1"); } catch { /* 무시 */ }
    setScreen(!hasProfile && !asked ? "bodyinfo" : "home");
  };

  const handleAuthSubmit = async (payload: { nickname: string; email: string; password: string }) => {
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const result = authMode === "login"
        ? await api.login(payload.email, payload.password)
        : await api.signup(payload.nickname, payload.email, payload.password);
      enterApp(result.user);
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : "잠시 후 다시 시도해주세요.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const result = await api.loginGoogle(credential);
      enterApp(result.user);
    } catch (e) {
      setAuthError(e instanceof ApiError ? e.message : "구글 로그인에 실패했어요.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setContinuousSeconds(0);
    setTodaySeconds(0);
    setMovementCount(0);
    setSchedule([]);
    setReminders([]);
    setPushOn(false);
    setAutoPaused(false);
    setAskSitting(false);
    setWeeklyMinutes([]);
    setAuthMode("login");
    setScreen("splash");
  };

  const handleUpdateBreakInterval = async (minutes: number) => {
    if (!session) return;
    const result = await api.updateUser(session.id, { breakIntervalMin: minutes });
    saveSession(result.user);
    setSession(result.user);
  };

  const setTracking = async (next: boolean, auto: boolean) => {
    if (!session) return;
    setContinuousSeconds(0); // 끌 때도, 다시 켤 때도 0부터 시작
    notifiedRef.current = false;
    try {
      const result = await api.updateUser(session.id, { trackingEnabled: next });
      saveSession(result.user);
      setSession(result.user);
      setAutoPaused(auto && !next); // 자동으로 멈춘 경우에만 true
      if (!next && auto) showToast("움직임이 감지돼 타이머를 멈췄어요");
      else showToast(next ? "좌식 타이머를 켰어요" : "좌식 타이머를 껐어요 · 기록과 알림이 멈춰요");
    } catch {
      showToast("잠시 후 다시 시도해주세요");
    }
  };
  const handleToggleTracking = () => setTracking(!trackingOn, false);
  const setTrackingRef = useRef(setTracking);
  setTrackingRef.current = setTracking;

  // ---- GPS 자동 감지: 움직이면 타이머 정지, 멈추면 "앉아 계신가요?" 질문 ----
  const handleToggleAutoDetect = async () => {
    if (autoDetect) {
      setAutoDetect(false);
      setAutoPaused(false);
      try { localStorage.setItem("sijakjeom_autodetect", "off"); } catch { /* 무시 */ }
      return;
    }
    if (!gpsSupported) { setGpsMsg("https 또는 localhost 접속에서만 쓸 수 있어요"); return; }
    // 아이폰은 사용자가 누를 때 센서 권한을 따로 물어봐야 함 (거부해도 GPS만으로 동작)
    setGpsMsg("위치를 확인하는 중이에요…");
    const DM = (window as any).DeviceMotionEvent;
    // 두 권한 창이 동시에 뜨면 꼬이므로 모션 권한을 먼저 끝내고 위치를 물어봄
    if (DM && typeof DM.requestPermission === "function") {
      try { await DM.requestPermission(); } catch { /* 거부해도 GPS만으로 동작 */ }
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setAutoDetect(true);
        try { localStorage.setItem("sijakjeom_autodetect", "on"); } catch { /* 무시 */ }
      },
      (err) => {
        if (err.code === 1) setGpsMsg("위치 권한이 꺼져 있어요. 아이폰: 설정 → 개인정보 보호 및 보안 → 위치 서비스 → Safari 웹사이트 → '앱을 사용하는 동안'. 바꾼 뒤 다시 눌러주세요");
        else if (err.code === 2) setGpsMsg("위치를 못 찾았어요. 창가나 밖에서 다시 눌러주세요");
        else setGpsMsg("위치 확인이 오래 걸려요. 다시 한 번 눌러주세요");
      },
      { enableHighAccuracy: false, timeout: 25000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!gpsSupported) setGpsMsg("https 또는 localhost 접속에서만 쓸 수 있어요");
    else setGpsMsg(autoDetect ? (motionInfo ? `현재: ${motionInfo}` : "위치를 확인하는 중 · 앱이 열려 있을 때만 동작해요")  : "움직이면 타이머를 멈추고, 멈추면 앉았는지 물어봐요");
  }, [autoDetect, gpsSupported, motionInfo]);

  useEffect(() => {
    if (!session || !autoDetect || !gpsSupported) { setMotionInfo(""); return; }
    const gps = new GpsClassifier();
    const steps = new StepDetector();
    let accelSeen = false;
    let walkSince = 0;
    let lastWalkAt = 0;
    let lastAskAt = 0;
    const label: Record<MotionState, string> = { still: "정지", walking: "걷는 중", vehicle: "탈것 이동", unknown: "판단 중" };

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      accelSeen = true;
      steps.push(a.x, a.y, a.z, Date.now());
    };
    window.addEventListener("devicemotion", onMotion);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords;
        gps.push({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: pos.timestamp, speed: c.speed });
        const cadence = accelSeen ? steps.analyze() : null;
        const { state, speed } = gps.classify(cadence);
        setMotionInfo(`${label[state]}${speed != null ? ` · ${(speed * 3.6).toFixed(1)}km/h` : ""}${accelSeen ? (cadence === true ? " · 걸음박자 O" : cadence === false ? " · 걸음박자 X" : "") : ""}`);
        const now = Date.now();
        if (state === "walking") {
          walkSince ||= now;
          lastWalkAt = now;
          // 걷는 상태가 10초 이상 이어지면 타이머 자동 정지 (탈것·흔들기·GPS 튐에는 반응하지 않음)
          if (now - walkSince >= MOTION.WALK_HOLD_MS && trackingRef.current) void setTrackingRef.current(false, true);
        } else if (state !== "unknown") {
          walkSince = 0;
        }
      },
      (err) => { if (err.code === 1) setGpsMsg("위치 권한이 거부됐어요. 브라우저 설정에서 허용해주세요"); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );

    const checker = window.setInterval(() => {
      const now = Date.now();
      if (!autoPausedRef.current || askOpenRef.current || !lastWalkAt) return;
      if (now - lastWalkAt >= GPS_STILL_HOLD_SEC * 1000 && now - lastAskAt >= GPS_REASK_SEC * 1000) {
        lastAskAt = now;
        setAskSitting(true);
        notifyBrowser("시작점", "지금 앉아 계신가요? 앉았다면 타이머를 다시 켤게요.");
      }
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("devicemotion", onMotion);
      window.clearInterval(checker);
    };
  }, [session?.id, autoDetect, gpsSupported]);

  const handleUpdateQuietEnabled = async (enabled: boolean) => {
    if (!session) return;
    const result = await api.updateUser(session.id, { scheduleQuietEnabled: enabled });
    saveSession(result.user);
    setSession(result.user);
  };

  const handleAddScheduleBlock = async () => {
    if (!session) return;
    const { block } = await api.addScheduleBlock(session.id, { day: null, start: "09:00", end: "18:00", title: "일정", notify: false });
    setSchedule((prev) => [...prev, block]);
  };

  const handleUpdateScheduleBlock = async (id: string, patch: Partial<Omit<ScheduleBlock, "id">>) => {
    if (!session) return;
    setSchedule((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    await api.updateScheduleBlock(session.id, id, patch);
  };

  const handleRemoveScheduleBlock = async (id: string) => {
    if (!session) return;
    setSchedule((prev) => prev.filter((b) => b.id !== id));
    await api.removeScheduleBlock(session.id, id);
  };

  const handleSaveClass = async (d: ClassDraft) => {
    if (!session) return;
    const gid = d.groupId ?? crypto.randomUUID();
    if (d.groupId) {
      for (const b of schedule.filter((x) => (x.groupId ?? x.id) === d.groupId)) await api.removeScheduleBlock(session.id, b.id);
    }
    for (const sl of d.slots) {
      await api.addScheduleBlock(session.id, { day: sl.day, start: sl.start, end: sl.end, title: d.title, notify: d.notify, professor: d.professor, place: sl.place, color: d.color, groupId: gid });
    }
    setSchedule((await api.listSchedule(session.id)).blocks);
  };
  const handleDeleteClass = async (groupId: string) => {
    if (!session) return;
    for (const b of schedule.filter((x) => (x.groupId ?? x.id) === groupId)) await api.removeScheduleBlock(session.id, b.id);
    setSchedule((await api.listSchedule(session.id)).blocks);
  };

  const handleSaveNickname = async (nickname: string): Promise<string | null> => {
    if (!session) return "로그인이 필요해요";
    if (nickname.length < 1 || nickname.length > 20) return "닉네임은 1~20자로 입력해주세요";
    try {
      const result = await api.updateUser(session.id, { nickname });
      saveSession(result.user);
      setSession(result.user);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "저장하지 못했어요";
    }
  };

  const handleToggleNotify = () => {
    const next = !notifyOn;
    setNotifyOn(next);
    try { localStorage.setItem("sijakjeom_notif", next ? "on" : "off"); } catch { /* 무시 */ }
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  };

  const handleTogglePush = async () => {
    if (!session || !vapidKey || !pushSupported) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      if (pushOn && existing) {
        await api.unsubscribePush(session.id, existing.endpoint);
        await existing.unsubscribe();
        setPushOn(false);
        showToast("백그라운드 푸시를 껐어요");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showToast("브라우저에서 알림을 허용해주세요"); return; }
      const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      await api.subscribePush(session.id, sub.toJSON());
      setPushOn(true);
      showToast("앱을 닫아도 알림을 받아요");
    } catch {
      showToast("푸시를 켜지 못했어요");
    }
  };

  const handleAddReminder = async () => {
    if (!session) return;
    const { reminder } = await api.addReminder(session.id, { day: null, time: "12:30", label: "점심 후 가볍게 움직이기" });
    setReminders((prev) => [...prev, reminder]);
  };
  const handleUpdateReminder = async (id: string, patch: Partial<Omit<ReminderTime, "id">>) => {
    if (!session) return;
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await api.updateReminder(session.id, id, patch).catch(() => {});
  };
  const handleRemoveReminder = async (id: string) => {
    if (!session) return;
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await api.removeReminder(session.id, id).catch(() => {});
  };

  const handleImportIcs = async (source: { ics?: string; url?: string }): Promise<string> => {
    if (!session) return "";
    try {
      const res = await api.importIcs(session.id, source);
      const sched = await api.listSchedule(session.id);
      setSchedule(sched.blocks);
      const sk = res.skipped;
      const extra = [sk.allDay ? `종일 ${sk.allDay}` : "", sk.past ? `지난 일정 ${sk.past}` : "", sk.unsupported ? `미지원 ${sk.unsupported}` : ""].filter(Boolean).join(", ");
      return `${res.added}개 일정을 가져왔어요${extra ? ` (제외: ${extra})` : ""}`;
    } catch (e) {
      return e instanceof ApiError ? e.message : "가져오지 못했어요";
    }
  };

  const handleMoveComplete = async (exerciseId: string, durationSec: number, asRecovery: boolean) => {
    if (!session) return;
    setScreen("home");
    const name = EXERCISE_BY_ID[exerciseId]?.name ?? "움직임";
    setContinuousSeconds(0);
    notifiedRef.current = false;
    try {
      const result = await api.logMovement(session.id, exerciseId, durationSec, asRecovery);
      const gain = Math.round((result.score.total - score.total) * 10) / 10;
      showToast(`${name} ${Math.max(1, Math.round(durationSec / 60))}분 기록 · 오늘 ${result.score.total}점${gain > 0 ? ` (+${gain})` : ""}`);
      setMovementCount(result.todayMovementCount);
      setTodayMoves(result.todayMoves);
      setTodayRecoveries(result.todayRecoveries);
      setScore(result.score);
      setGoal(result.goal);
      setContinuousSeconds(result.continuousSeconds);
    } catch {
      showToast("기록하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleSaveProfile = async (p: BodyProfile | null): Promise<string | null> => {
    if (!session) return "로그인이 필요해요";
    try {
      const r = await api.updateUser(session.id, { profile: p });
      saveSession(r.user);
      setSession(r.user);
      setProfile(r.user.profile ?? {});
      const dash = await api.getDashboard(session.id);
      syncFromDashboard(dash);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "저장하지 못했어요";
    }
  };

  const goTo = (next: Screen) => { setScreen(next); setMoveSheetOpen(false); };
  const goToMain = (next: NavItem["id"]) => goTo(next);
  const chooseMove = (mode: MoveMode) => { setMoveMode(mode); setMoveSheetOpen(false); setScreen("timer"); };

  const screenContent = useMemo(() => {
    if (screen === "splash") return <SplashScreen onStart={() => { setOnboardingStep(0); setScreen("onboarding"); }} />;
    if (screen === "onboarding") return <OnboardingScreen step={onboardingStep} onStepChange={setOnboardingStep} onSkip={() => setScreen("auth")} onComplete={() => setScreen("auth")} />;
    if (screen === "auth") return (
      <AuthScreen
        mode={authMode}
        onModeChange={(m) => { setAuthMode(m); setAuthError(""); }}
        onBack={() => setScreen("splash")}
        onSubmit={handleAuthSubmit} onGoogle={handleGoogle} googleClientId={googleClientId} providers={providers}
        submitting={authSubmitting}
        error={authError}
      />
    );
    if (!session) {
      // 로그인하지 않은 상태에서 메인 화면 그룹으로 진입하면 로그인으로 보냄
      return <AuthScreen mode={authMode} onModeChange={(m) => { setAuthMode(m); setAuthError(""); }} onBack={() => setScreen("splash")} onSubmit={handleAuthSubmit} onGoogle={handleGoogle} googleClientId={googleClientId} providers={providers} submitting={authSubmitting} error={authError} />;
    }
    if (screen === "bodyinfo") return <BodyInfoScreen nickname={session.nickname} onSave={handleSaveProfile} onDone={() => setScreen("home")} />;
    if (screen === "timer") return <TimerScreen key={moveMode} mode={moveMode} todaySeconds={todaySeconds} continuousSeconds={continuousSeconds} moves={todayMoves} recoveries={todayRecoveries} profile={profile} onComplete={handleMoveComplete} onBack={() => { setScreen("home"); setMoveSheetOpen(true); }} />;
    if (screen === "timetable") return <TimetableScreen blocks={schedule} quietEnabled={session.scheduleQuietEnabled} onToggleQuiet={() => handleUpdateQuietEnabled(!session.scheduleQuietEnabled)} bottomNav={<BottomNav current="timetable" onNavigate={goToMain} />} onSave={handleSaveClass} onDelete={handleDeleteClass} />;
    if (screen === "calendar") return <CalendarScreen userId={session.id} onNavigate={goToMain} />;
    if (screen === "stats") return <StatsScreen userId={session.id} onNavigate={goToMain} weeklyMinutes={weeklyMinutes} breakIntervalMin={session.breakIntervalMin} />;
    if (screen === "settings") return (
      <SettingsScreen
        user={session}
        onNavigate={goToMain}
        onUpdateBreakInterval={handleUpdateBreakInterval}
        onUpdateQuietEnabled={handleUpdateQuietEnabled}
        onSaveNickname={handleSaveNickname}
        notifyOn={notifyOn}
        onToggleNotify={handleToggleNotify}
        pushSupported={pushSupported}
        pushOn={pushOn}
        onTogglePush={handleTogglePush}
        autoDetect={autoDetect}
        gpsMsg={gpsMsg}
        onToggleAutoDetect={handleToggleAutoDetect}
        reminders={reminders}
        onAddReminder={handleAddReminder}
        onUpdateReminder={handleUpdateReminder}
        onRemoveReminder={handleRemoveReminder}
        onImportIcs={handleImportIcs}
        onOpenTimetable={() => setScreen("timetable")}
        schedule={schedule}
        onAddBlock={handleAddScheduleBlock}
        onUpdateBlock={handleUpdateScheduleBlock}
        onRemoveBlock={handleRemoveScheduleBlock}
        onLogout={handleLogout}
        profile={profile}
        onSaveProfile={handleSaveProfile}
      />
    );
    return (
      <HomeScreen
        user={session}
        continuousSeconds={continuousSeconds}
        todaySeconds={todaySeconds}
        movementCount={movementCount}
        score={score}
        goal={goal}
        zone={zone}
        trackingOn={trackingOn}
        autoPaused={autoPaused}
        onToggleTracking={handleToggleTracking}
        onMove={() => setMoveSheetOpen(true)}
        onNavigate={goToMain}
      />
    );
  }, [authMode, authSubmitting, authError, moveMode, onboardingStep, screen, session, continuousSeconds, todaySeconds, movementCount, zone, trackingOn, weeklyMinutes, schedule, reminders, notifyOn, pushOn, pushSupported, googleClientId, providers, autoDetect, autoPaused, gpsMsg, score, goal, profile, todayMoves, todayRecoveries]);

  return <main className="prototype-page"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="prototype-layout"><PrototypeRail screen={screen} onNavigate={goTo} /><PhoneShell screen={screen}>{screenContent}{moveSheetOpen && <MoveSheet onClose={() => setMoveSheetOpen(false)} onSelect={chooseMove} />}{askSitting && <div className="sheet-backdrop"><div className="move-sheet" onClick={(e) => e.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><span className="section-kicker">ARE YOU SITTING?</span><h2>지금 앉아 계신가요?</h2><p>움직임이 멈춘 것 같아요. 앉았다면 좌식 타이머를 다시 켤게요.</p></div></div><div className="ask-actions"><button className="primary-button" onClick={() => { setAskSitting(false); void setTracking(true, false); }}><Check size={17} /> 네, 앉았어요</button><button className="secondary-button" onClick={() => setAskSitting(false)}>아니요, 계속 움직여요</button></div></div></div>}{toast && <div className="toast-message"><Check size={16} /> {toast}</div>}</PhoneShell></div><footer className="prototype-footer"><span>INTERACTIVE MOBILE PROTOTYPE</span><span>사용자 행동을 바꾸는 가장 작은 시작점</span><span>© 2026 SIJAKJEOM</span></footer></main>;
}
