import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
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
import { api, ApiError, type CalendarDay, type Dashboard, type EdemaLevel, type PeriodStat, type ReminderTime, type ScheduleBlock, type SessionUser } from "@/lib/api";
import { clearSession, loadSession, saveSession } from "@/lib/session";

type Screen =
  | "splash"
  | "onboarding"
  | "auth"
  | "home"
  | "calendar"
  | "stats"
  | "settings"
  | "timer";
type AuthMode = "login" | "signup";
type MoveMode = "seated" | "standing";
type RiskLevel = "safe" | "notice" | "risk";

type NavItem = {
  id: Exclude<Screen, "splash" | "onboarding" | "auth" | "timer">;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "calendar", label: "캘린더", icon: CalendarDays },
  { id: "stats", label: "통계", icon: BarChart3 },
  { id: "settings", label: "설정", icon: Settings },
];

const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
const BREAK_INTERVAL_OPTIONS = [20, 30, 45, 60];

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

const movementCards = {
  seated: {
    title: "앉아서 가볍게",
    copy: "자리에서 바로 할 수 있는\n다리 혈액순환 동작이에요.",
    duration: "30초",
    action: "발목 펌프",
    detail: "발뒤꿈치는 바닥에 두고, 발끝을 최대한 들었다가 천천히 내려주세요.",
    icon: Footprints,
    accent: "mint",
    seconds: 30,
  },
  standing: {
    title: "잠깐 일어나기",
    copy: "물 한 잔을 가지러 가거나\n짧게 몸을 깨워보세요.",
    duration: "1분",
    action: "물 마시러 가기",
    detail: "자리에서 일어나 물을 한 잔 받아오며 몸에 작은 전환을 만들어보세요.",
    icon: MoveUpRight,
    accent: "lime",
    seconds: 60,
  },
} as const;

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
  const intervalSec = intervalMin * 60;
  if (elapsedSeconds < intervalSec * 0.6) return { level: "safe", label: "편안함" };
  if (elapsedSeconds < intervalSec) return { level: "notice", label: "잠깐 전환" };
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
        <button className={`flow-item ${screen === "auth" ? "is-active" : ""}`} onClick={() => onNavigate("auth")}>
          <span className="flow-index">03</span><span>로그인 / 가입</span><ArrowRight size={14} />
        </button>
        <button className={`flow-item ${["home", "calendar", "stats", "settings"].includes(screen) ? "is-active" : ""}`} onClick={() => onNavigate("home")}>
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
    timer: "움직임 타이머",
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
    return <div className="onboarding-art art-schedule"><div className="schedule-sun"><Bell size={22} /></div><div className="schedule-card"><div className="schedule-line"><span className="schedule-time">10:00</span><span className="schedule-title">전공 수업</span><span className="schedule-status">진행 중</span></div><div className="schedule-line schedule-line--active"><span className="schedule-time">12:30</span><span className="schedule-title">점심시간</span><span className="schedule-alert"><Bell size={13} /> 제안</span></div><div className="schedule-line"><span className="schedule-time">14:00</span><span className="schedule-title">스터디</span></div></div><div className="schedule-wave"><span /><span /><span /><span /><span /><span /><span /></div></div>;
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

function HomeScreen({
  user,
  continuousSeconds,
  todaySeconds,
  movementCount,
  zone,
  trackingOn,
  onToggleTracking,
  onMove,
  onNavigate,
}: {
  user: SessionUser;
  continuousSeconds: number;
  todaySeconds: number;
  movementCount: number;
  zone: { level: RiskLevel; label: string };
  trackingOn: boolean;
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
      <div className="daily-note"><div className="note-icon"><Sparkles size={16} /></div><div><strong>오늘도 가볍게 이어가요</strong><span>오늘 {movementCount}번 움직였어요.</span></div><ChevronRight size={17} /></div>
      <section className={`gauge-card ${trackingOn ? "" : "is-paused"}`}>
        <div className="gauge-card-top"><span className="section-kicker">CURRENT RHYTHM</span><button className="more-icon"><MoreHorizontal size={18} /></button></div>
        <div className="gauge-area">
          <div className="gauge-arc"><div className="gauge-arc-inner" /><div className="gauge-needle" style={{ transform: `rotate(${needleRotate}deg)` }} /></div>
          <div className="gauge-center"><span>연속 좌식 시간</span><strong>{formatClock(continuousSeconds)}</strong><small><i className={`zone-dot zone-dot--${trackingOn ? zone.level : "off"}`} /> {trackingOn ? zone.label : "기록 꺼짐"}</small></div>
        </div>
        <div className="gauge-legend"><span className={trackingOn && zone.level === "safe" ? "is-active" : ""}><i className="legend-dot legend-dot--safe" /> 편안함</span><span className={trackingOn && zone.level === "notice" ? "is-active" : ""}><i className="legend-dot legend-dot--notice" /> 잠깐 전환</span><span className={trackingOn && zone.level === "risk" ? "is-active" : ""}><i className="legend-dot legend-dot--risk" /> 오래 앉음</span></div>
        <div className="tracking-row"><div><strong>좌식 타이머</strong><small>{trackingOn ? "앉은 시간을 기록하고 알려드려요" : "꺼져 있어요 · 기록·알림이 멈춰요"}</small></div><button className={`toggle ${trackingOn ? "is-on" : ""}`} onClick={onToggleTracking} aria-label="좌식 타이머 켜기/끄기"><span /></button></div>
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
  return <div className="sheet-backdrop" onClick={onClose}><div className="move-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><span className="section-kicker">ONE SMALL SHIFT</span><h2>지금, 어떤 게 가능해요?</h2><p>지금의 상황에 맞는 움직임을 골라주세요.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="move-options"><button onClick={() => onSelect("seated")}><span className="move-option-icon move-option-icon--mint"><Footprints size={22} /></span><span><strong>지금 못 일어나요</strong><small>앉은 채로 30초, 다리 깨우기</small></span><ChevronRight size={18} /></button><button onClick={() => onSelect("standing")}><span className="move-option-icon move-option-icon--lime"><MoveUpRight size={22} /></span><span><strong>일어날 수 있어요</strong><small>물 한 잔, 짧은 이동으로 리셋하기</small></span><ChevronRight size={18} /></button></div><p className="sheet-footnote"><ShieldCheck size={14} /> 무리하지 않고 지금 가능한 만큼만 해요.</p></div></div>;
}

function TimerScreen({ mode, onComplete, onBack }: { mode: MoveMode; onComplete: () => void; onBack: () => void }) {
  const movement = movementCards[mode];
  const [seconds, setSeconds] = useState<number>(movement.seconds);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value > 0 ? value - 1 : 0), 1000); return () => window.clearInterval(timer); }, []);
  const progress = (movement.seconds - seconds) / movement.seconds;
  const Icon = movement.icon;
  return <div className="screen app-screen timer-screen"><StatusBar /><div className="timer-header"><button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button><span>움직임 타이머</span><button className="icon-button"><CircleHelp size={18} /></button></div><div className="timer-intro"><span className="section-kicker">RIGHT NOW</span><h2>{movement.title}</h2><p>{movement.copy.split("\n").map((line) => <span key={line}>{line}</span>)}</p></div><div className={`timer-circle timer-circle--${movement.accent}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}><div className="timer-circle-inner"><span>남은 시간</span><strong>00:{String(seconds).padStart(2, "0")}</strong><small><i /> 천천히 따라 해보세요</small></div></div><div className="movement-detail-card"><div className={`movement-detail-icon movement-detail-icon--${movement.accent}`}><Icon size={23} /></div><div><span>오늘의 움직임</span><strong>{movement.action}</strong><p>{movement.detail}</p></div></div><div className="timer-actions"><button className="secondary-button" onClick={onBack}><RotateCcw size={16} /> 다시 고르기</button><button className="primary-button" onClick={onComplete}><Check size={17} /> 완료했어요</button></div><p className="medical-note"><Info size={13} /> 통증이나 불편함이 있다면 멈추고 의료 전문가와 상담하세요.</p></div>;
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

const DAILY_MOVEMENT_TARGET = 8; // 활동도 링 기준: 하루 움직임 8회 = 100%

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
  const activity = selected ? Math.min(100, Math.round((selected.movementCount / DAILY_MOVEMENT_TARGET) * 100)) : 0;

  return <div className="screen app-screen calendar-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">YOUR RECORD</span><h2>캘린더</h2></div><button className="icon-button" onClick={() => { setYear(Number(todayIso.slice(0, 4))); setMonth(Number(todayIso.slice(5, 7))); setSelectedDate(todayIso); }}><MoreHorizontal size={19} /></button></div><div className="calendar-summary"><div className="calendar-summary-icon"><CalendarDays size={17} /></div><div><strong>이번 달의 리듬</strong><span>{loading ? "불러오는 중..." : `${recordedDays}일 동안 기록했어요`}</span></div><div className="calendar-summary-score">{totalMovements}<span>회</span></div></div><div className="month-switcher"><button onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><strong>{year}년 {month}월</strong><button onClick={() => moveMonth(1)} disabled={isCurrentMonth} style={isCurrentMonth ? { opacity: 0.3 } : undefined}><ChevronRight size={18} /></button></div><div className="calendar-weekdays">{WEEKDAY_LABEL.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}{days.map((day) => { const date = dateOf(day); const rec = records[date]; const ring = rec ? Math.min(100, Math.round((rec.movementCount / DAILY_MOVEMENT_TARGET) * 100)) : 0; const hasRecord = !!rec && (rec.totalSeconds > 0 || rec.movementCount > 0); return <button key={day} onClick={() => setSelectedDate(date)} disabled={date > todayIso} style={date > todayIso ? { opacity: 0.35 } : undefined} className={`${date === todayIso ? "today" : ""} ${selectedDate === date ? "is-selected" : ""} ${hasRecord ? "has-ring" : ""}`}><span>{day}</span>{hasRecord && <i style={{ "--ring": `${Math.max(ring, 8)}%` } as React.CSSProperties} />}</button>; })}</div><div className="calendar-legend"><span><i className="legend-ring" /> 움직임 달성도 (하루 {DAILY_MOVEMENT_TARGET}회 기준)</span><span className="calendar-selected-label">{selectedMonthLabel}월 {selectedDay}일 선택됨</span></div><div className="record-sheet"><div className="record-sheet-heading"><div><span className="section-kicker">{selectedDate}</span><h3>{selectedMonthLabel}월 {selectedDay}일의 기록</h3></div><span className="record-day-score">달성도 {activity}%</span></div>{selected ? <><div className="record-row"><span className="record-row-icon"><Clock3 size={17} /></span><div><strong>총 좌식시간</strong><span>{formatDuration(selected.totalSeconds)}</span></div></div><div className="record-row"><span className="record-row-icon"><Footprints size={17} /></span><div><strong>움직임 실현 횟수</strong><span>{selected.movementCount}회</span></div></div><div className="record-row"><span className="record-row-icon record-row-icon--peach"><HeartPulse size={17} /></span><div><strong>연속 좌식 최대 시간</strong><span>{selected.maxContinuousSeconds > 0 ? formatDuration(selected.maxContinuousSeconds) : "기록 없음"}</span></div></div></> : <div className="record-row"><span className="record-row-icon"><Info size={17} /></span><div><strong>기록이 없어요</strong><span>{selectedDate === todayIso ? "오늘 사용을 시작하면 여기에 쌓여요" : "이 날은 앱을 사용하지 않았어요"}</span></div></div>}<div className="record-row record-row--signal"><span className="record-row-icon record-row-icon--peach"><Droplets size={17} /></span><div><strong>부종 기록</strong><span>{selected?.edema ? `${selected.edema}` : "그날 다리 붓기를 남겨보세요"}</span></div></div><div className="signal-picker"><div>{(["없음", "약함", "보통", "심함"] as EdemaLevel[]).map((lv) => <button key={lv} className={selected?.edema === lv ? "is-active" : ""} onClick={() => chooseEdema(lv)}>{lv}</button>)}</div></div></div><BottomNav current="calendar" onNavigate={onNavigate} /></div>;
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
  reminders,
  onAddReminder,
  onUpdateReminder,
  onRemoveReminder,
  schedule,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onImportIcs,
  onLogout,
}: {
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
  reminders: ReminderTime[];
  onAddReminder: () => void;
  onUpdateReminder: (id: string, patch: Partial<Omit<ReminderTime, "id">>) => void;
  onRemoveReminder: (id: string) => void;
  schedule: ScheduleBlock[];
  onAddBlock: () => void;
  onUpdateBlock: (id: string, patch: Partial<Omit<ScheduleBlock, "id">>) => void;
  onRemoveBlock: (id: string) => void;
  onImportIcs: (source: { ics?: string; url?: string }) => Promise<string>;
  onLogout: () => void;
}) {
  const [openRow, setOpenRow] = useState("");
  const [nick, setNick] = useState(user.nickname);
  const [nickMsg, setNickMsg] = useState("");
  const [icsUrl, setIcsUrl] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
      <span className="settings-group-label">알림 & 일정</span>
      <div className="setting-row"><span className="setting-icon setting-icon--green"><Bell size={17} /></span><div><strong>앱 안 알림</strong><small>{notifyOn ? "앱이 열려 있을 때 알려드려요" : "알림이 꺼져 있어요"}</small></div><button className={`toggle ${notifyOn ? "is-on" : ""}`} onClick={onToggleNotify}><span /></button></div>
      <div className="setting-row"><span className="setting-icon setting-icon--blue"><Zap size={17} /></span><div><strong>백그라운드 푸시</strong><small>{pushSupported ? (pushOn ? "앱을 닫아도 알림이 와요" : "앱을 닫아도 알림 받기") : "https 접속에서만 쓸 수 있어요"}</small></div><button className={`toggle ${pushOn ? "is-on" : ""}`} disabled={!pushSupported} onClick={onTogglePush}><span /></button></div>
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
      <div className="setting-row setting-row--clickable" onClick={() => toggleRow("schedule")}><span className="setting-icon setting-icon--blue"><CalendarDays size={17} /></span><div><strong>일정 관리 · 캘린더 연동</strong><small>수업·일정 시간엔 알림을 조절해요</small></div><ChevronRight size={17} /></div>
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
          <div className="schedule-block-list">
            {schedule.length === 0 && <p className="schedule-empty">등록된 일정이 없어요. 수업/업무 시간을 추가해보세요.</p>}
            {schedule.map((block) => (
              <div className="schedule-block-row" key={block.id}>
                <input className="schedule-block-title" value={block.title} onChange={(e) => onUpdateBlock(block.id, { title: e.target.value })} placeholder="예: 전공 수업" />
                {(block.source === "ics" || block.date) && <span className="schedule-block-tag">{block.date ? `${block.date.slice(5).replace("-", "/")} 하루` : "가져옴"}</span>}
                <select className="schedule-block-day" value={block.day === null ? "all" : block.day} onChange={(e) => onUpdateBlock(block.id, { day: e.target.value === "all" ? null : Number(e.target.value) })}>
                  <option value="all">매일</option>
                  {WEEKDAY_LABEL.map((label, idx) => <option key={idx} value={idx}>{label}요일</option>)}
                </select>
                <div className="schedule-block-time">
                  <input type="time" value={block.start} onChange={(e) => onUpdateBlock(block.id, { start: e.target.value })} />
                  <span>—</span>
                  <input type="time" value={block.end} onChange={(e) => onUpdateBlock(block.id, { end: e.target.value })} />
                </div>
                <label className="schedule-block-notify"><input type="checkbox" checked={block.notify} onChange={(e) => onUpdateBlock(block.id, { notify: e.target.checked })} /><span>이 시간에도 알림</span></label>
                <button className="schedule-block-remove" onClick={() => onRemoveBlock(block.id)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="schedule-add-button" onClick={onAddBlock}><Plus size={15} /> 시간대 추가</button>
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
  const notifiedRef = useRef(false);
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const pushSupported = !!vapidKey && typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window;

  const trackingOn = session?.trackingEnabled !== false;
  const zone = useMemo(() => computeZone(trackingOn ? continuousSeconds : 0, session?.breakIntervalMin ?? 30), [continuousSeconds, session?.breakIntervalMin, trackingOn]);

  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };

  const syncFromDashboard = (dash: Dashboard) => {
    setContinuousSeconds(dash.continuousSeconds);
    setTodaySeconds(dash.todaySeconds);
    setMovementCount(dash.todayMovementCount);
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
      .then((r) => { saveSession(r.user); setSession(r.user); setScreen("home"); })
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
    if (trackingOn && zone.level === "risk") {
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
  }, [zone.level, quiet, session?.breakIntervalMin, trackingOn, notifyOn, pushOn]);

  const handleAuthSubmit = async (payload: { nickname: string; email: string; password: string }) => {
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const result = authMode === "login"
        ? await api.login(payload.email, payload.password)
        : await api.signup(payload.nickname, payload.email, payload.password);
      saveSession(result.user);
      setSession(result.user);
      setScreen("home");
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
      saveSession(result.user);
      setSession(result.user);
      setScreen("home");
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

  const handleToggleTracking = async () => {
    if (!session) return;
    const next = !trackingOn;
    setContinuousSeconds(0); // 끌 때도, 다시 켤 때도 0부터 시작
    notifiedRef.current = false;
    try {
      const result = await api.updateUser(session.id, { trackingEnabled: next });
      saveSession(result.user);
      setSession(result.user);
      showToast(next ? "좌식 타이머를 켰어요" : "좌식 타이머를 껐어요 · 기록과 알림이 멈춰요");
    } catch {
      showToast("잠시 후 다시 시도해주세요");
    }
  };

  const handleUpdateQuietEnabled = async (enabled: boolean) => {
    if (!session) return;
    const result = await api.updateUser(session.id, { scheduleQuietEnabled: enabled });
    saveSession(result.user);
    setSession(result.user);
  };

  const handleAddScheduleBlock = async () => {
    if (!session) return;
    const { block } = await api.addScheduleBlock(session.id, { day: null, start: "09:00", end: "18:00", title: "수업/업무", notify: false });
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

  const handleMoveComplete = async () => {
    if (!session) return;
    setScreen("home");
    showToast(`움직임이 기록되었어요 · 오늘 ${movementCount + 1}회`);
    setContinuousSeconds(0);
    notifiedRef.current = false;
    try {
      const result = await api.logMovement(session.id);
      setMovementCount(result.todayMovementCount);
      setContinuousSeconds(result.continuousSeconds);
    } catch {
      /* 다음 동기화 주기에서 정합성 맞춰짐 */
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
    if (screen === "timer") return <TimerScreen mode={moveMode} onComplete={handleMoveComplete} onBack={() => { setScreen("home"); setMoveSheetOpen(true); }} />;
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
        reminders={reminders}
        onAddReminder={handleAddReminder}
        onUpdateReminder={handleUpdateReminder}
        onRemoveReminder={handleRemoveReminder}
        onImportIcs={handleImportIcs}
        schedule={schedule}
        onAddBlock={handleAddScheduleBlock}
        onUpdateBlock={handleUpdateScheduleBlock}
        onRemoveBlock={handleRemoveScheduleBlock}
        onLogout={handleLogout}
      />
    );
    return (
      <HomeScreen
        user={session}
        continuousSeconds={continuousSeconds}
        todaySeconds={todaySeconds}
        movementCount={movementCount}
        zone={zone}
        trackingOn={trackingOn}
        onToggleTracking={handleToggleTracking}
        onMove={() => setMoveSheetOpen(true)}
        onNavigate={goToMain}
      />
    );
  }, [authMode, authSubmitting, authError, moveMode, onboardingStep, screen, session, continuousSeconds, todaySeconds, movementCount, zone, trackingOn, weeklyMinutes, schedule, reminders, notifyOn, pushOn, pushSupported, googleClientId, providers]);

  return <main className="prototype-page"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="prototype-layout"><PrototypeRail screen={screen} onNavigate={goTo} /><PhoneShell screen={screen}>{screenContent}{moveSheetOpen && <MoveSheet onClose={() => setMoveSheetOpen(false)} onSelect={chooseMove} />}{toast && <div className="toast-message"><Check size={16} /> {toast}</div>}</PhoneShell></div><footer className="prototype-footer"><span>INTERACTIVE MOBILE PROTOTYPE</span><span>사용자 행동을 바꾸는 가장 작은 시작점</span><span>© 2026 SIJAKJEOM</span></footer></main>;
}
