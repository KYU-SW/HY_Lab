import { useEffect, useMemo, useState } from "react";
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
  Footprints,
  HeartPulse,
  Home as HomeIcon,
  Info,
  Leaf,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  MoveUpRight,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserRound,
  X,
  Zap,
} from "lucide-react";

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
  },
  standing: {
    title: "잠깐 일어나기",
    copy: "물 한 잔을 가지러 가거나\n짧게 몸을 깨워보세요.",
    duration: "1분",
    action: "물 마시러 가기",
    detail: "자리에서 일어나 물을 한 잔 받아오며 몸에 작은 전환을 만들어보세요.",
    icon: MoveUpRight,
    accent: "lime",
  },
} as const;

function LogoMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo-mark ${inverse ? "logo-mark--inverse" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
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

function AuthScreen({ mode, onModeChange, onLogin }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void; onLogin: () => void }) {
  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="auth-header"><button className="icon-button" onClick={onLogin}><ArrowLeft size={19} /></button><AppLogo /><button className="help-button"><CircleHelp size={18} /></button></div>
      <div className="auth-intro"><span className="eyebrow">WELCOME TO SIJAKJEOM</span><h2>{mode === "login" ? "오늘의 리듬을\n이어가볼까요?" : "가볍게 시작하고\n꾸준히 이어가요."}</h2><p>{mode === "login" ? "나에게 맞는 작은 움직임을 다시 만나보세요." : "일정에 맞는 움직임 알림을 준비해드릴게요."}</p></div>
      <div className="auth-tabs"><button className={mode === "login" ? "is-active" : ""} onClick={() => onModeChange("login")}>로그인</button><button className={mode === "signup" ? "is-active" : ""} onClick={() => onModeChange("signup")}>회원가입</button></div>
      <div className="auth-form">
        {mode === "signup" && <label><span>닉네임</span><div className="input-wrap"><UserRound size={17} /><input placeholder="어떻게 불러드릴까요?" /></div></label>}
        <label><span>이메일</span><div className="input-wrap"><span className="input-at">@</span><input placeholder="hello@example.com" /></div></label>
        <label><span>비밀번호</span><div className="input-wrap"><LockKeyhole size={17} /><input type="password" placeholder="8자 이상 입력해주세요" /><EyeIcon /></div></label>
        {mode === "login" && <button className="forgot-button">비밀번호를 잊으셨나요?</button>}
        <button className="primary-button auth-submit" onClick={onLogin}>{mode === "login" ? "로그인" : "시작하기"}<ArrowRight size={17} /></button>
      </div>
      <div className="social-divider"><span>또는 간편하게</span></div>
      <div className="social-buttons"><button><span className="social-symbol kakao">k</span>카카오로 계속하기</button><button><span className="social-symbol naver">N</span>네이버로 계속하기</button><button><span className="social-symbol apple">●</span>Apple로 계속하기</button></div>
      <p className="terms-copy">계속하면 <u>이용약관</u> 및 <u>개인정보 처리방침</u>에<br />동의하는 것으로 간주됩니다.</p>
    </div>
  );
}

function EyeIcon() { return <span className="eye-icon">◉</span>; }

function HomeScreen({ onMove, onNavigate }: { onMove: () => void; onNavigate: (next: NavItem["id"]) => void }) {
  return (
    <div className="screen app-screen home-screen">
      <StatusBar />
      <div className="app-header"><div><span className="date-label">2026년 9월 22일 · 화요일</span><h2>좋은 오후예요, 민지님 <span>✦</span></h2></div><button className="avatar-button">민</button></div>
      <div className="daily-note"><div className="note-icon"><Sparkles size={16} /></div><div><strong>오늘도 가볍게 이어가요</strong><span>어제보다 12분 더 자주 움직였어요.</span></div><ChevronRight size={17} /></div>
      <section className="gauge-card">
        <div className="gauge-card-top"><span className="section-kicker">CURRENT RHYTHM</span><button className="more-icon"><MoreHorizontal size={18} /></button></div>
        <div className="gauge-area"><div className="gauge-arc"><div className="gauge-arc-inner" /><div className="gauge-needle" /></div><div className="gauge-center"><span>연속 좌식 시간</span><strong>01:32:45</strong><small><i /> 안정적인 흐름이에요</small></div></div>
        <div className="gauge-legend"><span><i className="legend-dot legend-dot--safe" /> 편안함</span><span><i className="legend-dot legend-dot--notice" /> 잠깐 전환</span><span><i className="legend-dot legend-dot--risk" /> 오래 앉음</span></div>
      </section>
      <section className="schedule-section"><div className="section-heading"><div><span className="section-kicker">UP NEXT</span><h3>오늘 일정</h3></div><button>전체보기 <ChevronRight size={14} /></button></div><div className="schedule-preview"><div className="tiny-time"><strong>12:30</strong><span>지금</span></div><div className="schedule-preview-main"><strong>점심시간</strong><span>12:30 — 13:30 · 휴식 가능</span></div><span className="schedule-tag">움직임 추천</span></div><div className="schedule-preview muted"><div className="tiny-time"><strong>14:00</strong><span>후</span></div><div className="schedule-preview-main"><strong>스터디 모임</strong><span>14:00 — 16:00 · 집중 시간</span></div><span className="schedule-tag tag-gray">알림 꺼짐</span></div></section>
      <section className="stat-grid"><div className="stat-card"><div className="stat-card-top"><span>오늘 총 좌식시간</span><Clock3 size={16} /></div><strong>04<span>h</span> 18<span>m</span></strong><small>어제보다 <b>15분 줄었어요</b></small></div><div className="stat-card"><div className="stat-card-top"><span>움직임 실현 횟수</span><Footprints size={16} /></div><strong>06<span>회</span></strong><small><b>+2회</b> 어제보다 많아요</small></div></section>
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
  const [seconds, setSeconds] = useState(mode === "seated" ? 30 : 60);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value > 0 ? value - 1 : 0), 1000); return () => window.clearInterval(timer); }, []);
  const progress = ((mode === "seated" ? 30 : 60) - seconds) / (mode === "seated" ? 30 : 60);
  const Icon = movement.icon;
  return <div className="screen app-screen timer-screen"><StatusBar /><div className="timer-header"><button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button><span>움직임 타이머</span><button className="icon-button"><CircleHelp size={18} /></button></div><div className="timer-intro"><span className="section-kicker">RIGHT NOW</span><h2>{movement.title}</h2><p>{movement.copy.split("\n").map((line) => <span key={line}>{line}</span>)}</p></div><div className={`timer-circle timer-circle--${movement.accent}`} style={{ "--progress": `${progress * 360}deg` } as React.CSSProperties}><div className="timer-circle-inner"><span>남은 시간</span><strong>00:{String(seconds).padStart(2, "0")}</strong><small><i /> 천천히 따라 해보세요</small></div></div><div className="movement-detail-card"><div className={`movement-detail-icon movement-detail-icon--${movement.accent}`}><Icon size={23} /></div><div><span>오늘의 움직임</span><strong>{movement.action}</strong><p>{movement.detail}</p></div></div><div className="timer-actions"><button className="secondary-button" onClick={onBack}><RotateCcw size={16} /> 다시 고르기</button><button className="primary-button" onClick={onComplete}><Check size={17} /> 완료했어요</button></div><p className="medical-note"><Info size={13} /> 통증이나 불편함이 있다면 멈추고 의료 전문가와 상담하세요.</p></div>;
}

function CalendarScreen({ onNavigate }: { onNavigate: (next: NavItem["id"]) => void }) {
  const [selectedDay, setSelectedDay] = useState(22);
  const [signalLevel, setSignalLevel] = useState("기록 전");
  const [monthOffset, setMonthOffset] = useState(0);
  const days = Array.from({ length: 30 }, (_, index) => index + 1);
  const monthLabel = monthOffset === 0 ? "2026년 9월" : monthOffset < 0 ? "2026년 8월" : "2026년 10월";
  const selectedHasSignal = [8, 15, 22].includes(selectedDay);
  const activity = 25 + ((selectedDay * 13) % 70);
  return <div className="screen app-screen calendar-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">YOUR RECORD</span><h2>캘린더</h2></div><button className="icon-button" onClick={() => setSelectedDay(22)}><MoreHorizontal size={19} /></button></div><div className="calendar-summary"><div className="calendar-summary-icon"><CalendarDays size={17} /></div><div><strong>이번 달의 리듬</strong><span>7일 동안 움직임을 기록했어요</span></div><div className="calendar-summary-score">74<span>%</span></div></div><div className="month-switcher"><button onClick={() => setMonthOffset((value) => Math.max(-1, value - 1))}><ChevronLeft size={18} /></button><strong>{monthLabel}</strong><button onClick={() => setMonthOffset((value) => Math.min(1, value + 1))}><ChevronRight size={18} /></button></div><div className="calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid"><span /><span /><span /><span />{days.map((day) => <button key={day} onClick={() => setSelectedDay(day)} className={`${day === 22 ? "today" : ""} ${selectedDay === day ? "is-selected" : ""} ${[2, 4, 8, 11, 15, 22, 26].includes(day) ? "has-ring" : ""} ${[8, 15, 22].includes(day) ? "has-signal" : ""}`}><span>{day}</span>{[2, 4, 8, 11, 15, 22, 26].includes(day) && <i style={{ "--ring": `${25 + ((day * 13) % 70)}%` } as React.CSSProperties} />}</button>)}</div><div className="calendar-legend"><span><i className="legend-ring" /> 활동도</span><span><i className="legend-signal" /> 신체 신호 기록</span><span className="calendar-selected-label">{selectedDay}일 선택됨</span></div><div className="record-sheet"><div className="record-sheet-heading"><div><span className="section-kicker">{selectedDay === 22 ? "TUE, SEP 22" : `SEP ${String(selectedDay).padStart(2, "0")}`}</span><h3>{selectedDay}일의 기록</h3></div><span className="record-day-score">활동도 {activity}%</span></div><div className="record-row"><span className="record-row-icon"><Clock3 size={17} /></span><div><strong>연속 좌식 최대 시간</strong><span>{selectedDay === 22 ? "01시간 32분 45초" : "01시간 08분 20초"}</span></div><ChevronRight size={16} /></div><div className="record-row record-row--signal"><span className="record-row-icon record-row-icon--peach"><HeartPulse size={17} /></span><div><strong>오늘의 신체 신호</strong><span>{selectedHasSignal ? "부종 신호를 기록했어요" : "부종 정도를 선택해보세요"}</span></div>{selectedHasSignal ? <span className="recorded-chip">{signalLevel === "기록 전" ? "보통" : signalLevel}</span> : <button className="record-action" onClick={() => setSignalLevel("약함")}>기록하기</button>}</div><div className="signal-picker"><span>부종 정도</span><div>{["없음", "약함", "보통", "심함"].map((level) => <button key={level} className={signalLevel === level ? "is-active" : ""} onClick={() => setSignalLevel(level)}>{level}</button>)}</div></div></div><BottomNav current="calendar" onNavigate={onNavigate} /></div>;
}

function StatsScreen({ onNavigate }: { onNavigate: (next: NavItem["id"]) => void }) {
  const [period, setPeriod] = useState("일간");
  const dataset: Record<string, { bars: number[]; labels: string[]; change: string; caption: string; score: string }> = {
    일간: { bars: [48, 62, 38, 72, 55, 78, 66], labels: ["월", "화", "수", "목", "금", "토", "일"], change: "15분", caption: "최근 7일 평균보다 18분 짧아요", score: "78" },
    주간: { bars: [58, 42, 68, 51, 79, 63, 74], labels: ["1주", "2주", "3주", "4주", "5주", "6주", "7주"], change: "42분", caption: "지난주보다 42분 짧아요", score: "82" },
    월간: { bars: [39, 55, 47, 69, 61, 76, 84], labels: ["4월", "5월", "6월", "7월", "8월", "9월", "이번"], change: "1.2h", caption: "지난달보다 1시간 12분 짧아요", score: "86" },
  };
  const current = dataset[period];
  return <div className="screen app-screen stats-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">YOUR TREND</span><h2>통계</h2></div><button className="icon-button"><MoreHorizontal size={19} /></button></div><div className="stats-hero"><div><span className="section-kicker">THIS WEEK</span><strong>06<span>회</span></strong><small>움직임 실현 횟수</small></div><div className="stats-hero-ring"><span>+2</span><small>어제보다</small></div></div><div className="segmented">{["일간", "주간", "월간"].map((item) => <button key={item} className={period === item ? "is-active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div><div className="trend-card"><div className="trend-card-heading"><div><span className="section-kicker">CONTINUOUS SITTING</span><h3>연속 좌식 시간</h3></div><span className="trend-change"><ArrowDownIcon /> {current.change}</span></div><div className="chart-wrap"><div className="chart-y"><span>2h</span><span>1h</span><span>0h</span></div><div className="bar-chart">{current.bars.map((height, index) => <div className="bar-column" key={index}><div className={`bar ${index === 4 ? "is-highlight" : ""}`} style={{ height: `${height}%` }}><span>{index === 4 ? "1h 32m" : ""}</span></div><small>{current.labels[index]}</small></div>)}</div></div><p className="chart-caption"><span /> {current.caption}</p></div><div className="activity-card"><div className="activity-card-top"><div><span className="section-kicker">BLOOD FLOW ACTIVITY</span><h3>혈류 활동도</h3></div><div className="activity-score">{current.score}<span>%</span></div></div><div className="activity-progress"><span style={{ width: `${current.score}%` }} /></div><div className="activity-bottom"><span>개인 기록 기준으로 좋아지고 있어요</span><HeartPulse size={17} /></div></div><div className="stats-metric-row"><div><span>평균 연속 좌식</span><strong>48<span>분</span></strong><small>지난주보다 6분 ↓</small></div><div><span>가장 좋은 시간대</span><strong>12<span>시</span></strong><small>움직임 성공률 86%</small></div></div><div className="insight-card"><div className="insight-icon"><Sparkles size={18} /></div><div><strong>나만의 리듬을 발견했어요</strong><p>오후 12시~1시 사이에 움직임을 실현할 확률이 가장 높아요.</p></div></div><BottomNav current="stats" onNavigate={onNavigate} /></div>;
}

function ArrowDownIcon() { return <span className="trend-arrow">↓</span>; }

function SettingsScreen({ onNavigate }: { onNavigate: (next: NavItem["id"]) => void }) {
  const [notifications, setNotifications] = useState(true);
  const [openRow, setOpenRow] = useState("");
  const [quietHours, setQuietHours] = useState(true);
  const toggleRow = (row: string) => setOpenRow((current) => current === row ? "" : row);
  return <div className="screen app-screen settings-screen"><StatusBar /><div className="page-header"><div><span className="section-kicker">MAKE IT YOURS</span><h2>설정</h2></div><button className="icon-button"><MoreHorizontal size={19} /></button></div><div className="profile-card profile-card--editable" onClick={() => toggleRow("profile")}><div className="profile-avatar">민</div><div><strong>민지</strong><span>나의 리듬을 만들어가는 중</span></div><span className="profile-edit">프로필 수정</span><ChevronRight size={17} /></div>{openRow === "profile" && <div className="inline-panel profile-panel"><label>닉네임<input value="민지" readOnly /></label><button className="panel-save" onClick={() => setOpenRow("")}>저장했어요</button></div>}<div className="settings-group"><span className="settings-group-label">알림 & 일정</span><div className="setting-row"><span className="setting-icon setting-icon--green"><Bell size={17} /></span><div><strong>움직임 알림</strong><small>{notifications ? "일정에 맞춰 제안받기" : "알림이 잠시 꺼져 있어요"}</small></div><button className={`toggle ${notifications ? "is-on" : ""}`} onClick={() => setNotifications(!notifications)}><span /></button></div><div className="setting-row setting-row--clickable" onClick={() => toggleRow("schedule")}><span className="setting-icon setting-icon--blue"><CalendarDays size={17} /></span><div><strong>일정 관리</strong><small>내 일정에 맞춰 알림을 조절해요</small></div><ChevronRight size={17} /></div>{openRow === "schedule" && <div className="inline-panel schedule-panel"><div className="quiet-row"><div><strong>집중 시간에는 조용히</strong><small>수업·회의 중 알림을 자동으로 줄여요</small></div><button className={`toggle ${quietHours ? "is-on" : ""}`} onClick={() => setQuietHours(!quietHours)}><span /></button></div><div className="time-chip-row"><button>09:00</button><span>—</span><button>18:00</button><span className="time-chip-label">업무 시간</span></div></div>}</div><div className="settings-group"><span className="settings-group-label">앱 정보 & 도움말</span><div className="setting-row setting-row--clickable" onClick={() => toggleRow("guide")}><span className="setting-icon setting-icon--purple"><CircleHelp size={17} /></span><div><strong>시작점 사용 가이드</strong><small>앱을 더 잘 활용하는 방법</small></div><ChevronRight size={17} /></div>{openRow === "guide" && <div className="inline-panel guide-panel"><div className="guide-step"><span>01</span><div><strong>앉아있는 시간을 확인해요</strong><small>홈 게이지에서 현재 흐름을 확인하세요.</small></div></div><div className="guide-step"><span>02</span><div><strong>가능한 움직임을 골라요</strong><small>일어날 수 없는 순간에도 할 수 있어요.</small></div></div></div>}<div className="setting-row setting-row--clickable" onClick={() => toggleRow("privacy")}><span className="setting-icon setting-icon--gray"><ShieldCheck size={17} /></span><div><strong>개인정보 보호</strong><small>내 기록은 안전하게 보호돼요</small></div><ChevronRight size={17} /></div>{openRow === "privacy" && <div className="inline-panel privacy-panel"><ShieldCheck size={16} /><span>기록은 나의 흐름을 이해하기 위한 용도로만 사용돼요.</span></div>}</div><div className="settings-footer-card"><div className="settings-footer-icon"><Leaf size={16} /></div><div><strong>오늘도 충분히 잘하고 있어요</strong><span>작은 행동 하나가 다음 흐름을 바꿔요.</span></div></div><p className="settings-version">시작점 v0.1 · UI/UX preview</p><BottomNav current="settings" onNavigate={onNavigate} /></div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [moveSheetOpen, setMoveSheetOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<MoveMode>("seated");
  const [toast, setToast] = useState("");

  const goTo = (next: Screen) => { setScreen(next); setMoveSheetOpen(false); };
  const goToMain = (next: NavItem["id"]) => goTo(next);
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const chooseMove = (mode: MoveMode) => { setMoveMode(mode); setMoveSheetOpen(false); setScreen("timer"); };
  const screenContent = useMemo(() => {
    if (screen === "splash") return <SplashScreen onStart={() => { setOnboardingStep(0); setScreen("onboarding"); }} />;
    if (screen === "onboarding") return <OnboardingScreen step={onboardingStep} onStepChange={setOnboardingStep} onSkip={() => setScreen("auth")} onComplete={() => setScreen("auth")} />;
    if (screen === "auth") return <AuthScreen mode={authMode} onModeChange={setAuthMode} onLogin={() => setScreen("home")} />;
    if (screen === "timer") return <TimerScreen mode={moveMode} onComplete={() => { setScreen("home"); showToast("움직임이 기록되었어요 · 오늘 07회"); }} onBack={() => { setScreen("home"); setMoveSheetOpen(true); }} />;
    if (screen === "calendar") return <CalendarScreen onNavigate={goToMain} />;
    if (screen === "stats") return <StatsScreen onNavigate={goToMain} />;
    if (screen === "settings") return <SettingsScreen onNavigate={goToMain} />;
    return <HomeScreen onMove={() => setMoveSheetOpen(true)} onNavigate={goToMain} />;
  }, [authMode, moveMode, onboardingStep, screen]);

  return <main className="prototype-page"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><div className="prototype-layout"><PrototypeRail screen={screen} onNavigate={goTo} /><PhoneShell screen={screen}>{screenContent}{moveSheetOpen && <MoveSheet onClose={() => setMoveSheetOpen(false)} onSelect={chooseMove} />}{toast && <div className="toast-message"><Check size={16} /> {toast}</div>}</PhoneShell></div><footer className="prototype-footer"><span>INTERACTIVE MOBILE PROTOTYPE</span><span>사용자 행동을 바꾸는 가장 작은 시작점</span><span>© 2026 SIJAKJEOM</span></footer></main>;
}
