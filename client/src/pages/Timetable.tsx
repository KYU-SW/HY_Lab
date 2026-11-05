import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Plus, Trash2, X } from "lucide-react";
import type { ScheduleBlock } from "@/lib/api";

export type ClassSlot = { day: number; start: string; end: string; place: string };
export type ClassDraft = { groupId?: string; title: string; professor: string; color: string; notify: boolean; slots: ClassSlot[] };

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const HOUR_H = 56; // 한 시간 높이(px)
export const CLASS_COLORS = ["#5b8bd0", "#8a6fc4", "#b57fd0", "#d4784a", "#c9695f", "#cba04c", "#8fb552", "#4fa66f", "#4fb0a5"];

const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const hourLabel = (h: number) => (h > 12 ? h - 12 : h);
const groupOf = (b: ScheduleBlock) => b.groupId ?? b.id;

function seoulNow() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function TimetableScreen({
  blocks, quietEnabled, onToggleQuiet, bottomNav, onSave, onDelete, initialEditor,
}: {
  blocks: ScheduleBlock[];
  quietEnabled: boolean;
  onToggleQuiet: () => void;
  bottomNav: React.ReactNode;
  onSave: (d: ClassDraft) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
  initialEditor?: ClassDraft | null;
}) {
  const [editor, setEditor] = useState<ClassDraft | null>(initialEditor ?? null);
  const [now, setNow] = useState(seoulNow());
  useEffect(() => { const t = window.setInterval(() => setNow(seoulNow()), 30000); return () => window.clearInterval(t); }, []);

  const weekly = useMemo(() => blocks.filter((b) => !b.date), [blocks]);
  const startH = Math.min(9, ...weekly.map((b) => Math.floor(toMin(b.start) / 60)));
  const endH = Math.max(18, ...weekly.map((b) => Math.ceil(toMin(b.end) / 60)));
  const days = useMemo(() => {
    const d = [1, 2, 3, 4, 5];
    if (weekly.some((b) => b.day === 6)) d.push(6);
    if (weekly.some((b) => b.day === 0)) d.push(0);
    return d;
  }, [weekly]);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const gridH = hours.length * HOUR_H;

  const openEdit = (b: ScheduleBlock) => {
    const gid = groupOf(b);
    const group = weekly.filter((x) => groupOf(x) === gid);
    setEditor({
      groupId: gid,
      title: b.title,
      professor: b.professor ?? "",
      color: b.color ?? CLASS_COLORS[0],
      notify: b.notify,
      slots: group.map((x) => ({ day: x.day ?? 1, start: x.start, end: x.end, place: x.place ?? "" })),
    });
  };
  const openNew = (day = 1, hour = 9) => {
    const used = new Set(weekly.map((b) => b.color));
    const color = CLASS_COLORS.find((c) => !used.has(c)) ?? CLASS_COLORS[weekly.length % CLASS_COLORS.length];
    const p = (n: number) => String(n).padStart(2, "0");
    setEditor({ title: "", professor: "", color, notify: false, slots: [{ day, start: `${p(hour)}:00`, end: `${p(Math.min(hour + 1, 23))}:00`, place: "" }] });
  };

  if (editor) {
    return <ClassEditor draft={editor} blocks={weekly} onCancel={() => setEditor(null)}
      onSave={async (d) => { await onSave(d); setEditor(null); }}
      onDelete={editor.groupId ? async () => { await onDelete(editor.groupId!); setEditor(null); } : undefined} />;
  }

  return (
    <div className="screen app-screen timetable-screen">
      <div className="tt-status" />
      <div className="tt-header">
        <div><span className="section-kicker">MY WEEK</span><h2>주간 일정</h2></div>
        <button className="icon-button tt-add" onClick={() => openNew()} aria-label="일정 추가"><Plus size={20} /></button>
      </div>
      <div className="tt-quiet">
        <div><strong>일정 시간엔 조용히</strong><small>등록한 일정 시간에는 알림을 자동으로 줄여요</small></div>
        <button className={`toggle ${quietEnabled ? "is-on" : ""}`} onClick={onToggleQuiet}><span /></button>
      </div>
      <div className="tt-wrap">
        <div className="tt-days" style={{ gridTemplateColumns: `28px repeat(${days.length}, 1fr)` }}>
          <span />
          {days.map((d) => <span key={d} className={d === now.day ? "is-today" : ""}>{DAY_NAMES[d]}</span>)}
        </div>
        <div className="tt-grid" style={{ gridTemplateColumns: `28px repeat(${days.length}, 1fr)`, height: gridH }}>
          <div className="tt-hours">{hours.map((h) => <span key={h} style={{ height: HOUR_H }}>{hourLabel(h)}</span>)}</div>
          {days.map((d) => (
            <div key={d} className={`tt-col ${d === now.day ? "is-today" : ""}`}
              style={{ backgroundSize: `100% ${HOUR_H}px` }}
              onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openNew(d, Math.min(23, startH + Math.floor((e.clientY - r.top) / HOUR_H))); }}>
              {weekly.filter((b) => b.day === d || b.day === null).map((b) => {
                const top = ((toMin(b.start) - startH * 60) / 60) * HOUR_H;
                const h = ((toMin(b.end) - toMin(b.start)) / 60) * HOUR_H;
                return (
                  <button key={b.id} className={`tt-block ${b.day === null ? "is-everyday" : ""}`}
                    style={{ top, height: Math.max(h - 2, 18), background: b.color ?? CLASS_COLORS[0] }}
                    onClick={(e) => { e.stopPropagation(); openEdit(b); }}>
                    <strong>{b.title}</strong>
                    {b.place && h >= 40 && <small>{b.place}</small>}
                  </button>
                );
              })}
              {d === now.day && now.minutes >= startH * 60 && now.minutes <= endH * 60 && (
                <i className="tt-now" style={{ top: ((now.minutes - startH * 60) / 60) * HOUR_H }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="tt-hint">빈 칸을 누르면 그 시간에 일정을 추가하고, 일정을 누르면 수정해요.</p>
      {bottomNav}
    </div>
  );
}

function ClassEditor({ draft, blocks, onCancel, onSave, onDelete }: {
  draft: ClassDraft; blocks: ScheduleBlock[]; onCancel: () => void; onSave: (d: ClassDraft) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [d, setD] = useState<ClassDraft>(draft);
  const [saving, setSaving] = useState(false);
  const setSlot = (i: number, patch: Partial<ClassSlot>) => setD((p) => ({ ...p, slots: p.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));

  const problem = useMemo(() => {
    if (!d.title.trim()) return "일정 이름을 입력해주세요";
    for (const s of d.slots) {
      if (!s.start || !s.end || toMin(s.start) >= toMin(s.end)) return "종료 시간이 시작보다 늦어야 해요";
    }
    for (const s of d.slots) {
      const clash = blocks.find((b) => groupOf(b) !== d.groupId && (b.day === s.day) && toMin(b.start) < toMin(s.end) && toMin(s.start) < toMin(b.end));
      if (clash) return `${DAY_NAMES[s.day]}요일 ${clash.title}와(과) 시간이 겹쳐요`;
    }
    for (let i = 0; i < d.slots.length; i++) for (let j = i + 1; j < d.slots.length; j++) {
      const a = d.slots[i], b = d.slots[j];
      if (a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end)) return "같은 일정의 시간끼리 겹쳐요";
    }
    return "";
  }, [d, blocks]);

  return (
    <div className="screen app-screen timetable-screen tt-editor">
      <div className="tt-status" />
      <div className="tt-header">
        <button className="icon-button" onClick={onCancel} aria-label="닫기"><X size={19} /></button>
        <h2>{d.groupId ? "일정 수정" : "일정 추가"}</h2>
        <button className="tt-done" disabled={!!problem || saving} onClick={async () => { setSaving(true); await onSave({ ...d, title: d.title.trim(), professor: d.professor.trim() }); setSaving(false); }}>완료</button>
      </div>
      <div className="tt-form">
        <input className="tt-input" placeholder="일정 이름 (예: 수업, 회의, 운동)" value={d.title} maxLength={40} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <input className="tt-input" placeholder="메모 (선택)" value={d.professor} maxLength={30} onChange={(e) => setD({ ...d, professor: e.target.value })} />
        <div className="tt-colors">{CLASS_COLORS.map((c) => (
          <button key={c} style={{ background: c }} className={d.color === c ? "is-active" : ""} onClick={() => setD({ ...d, color: c })} aria-label={c}>{d.color === c && <Check size={13} />}</button>
        ))}</div>
        <div className="tt-slots">
          {d.slots.map((s, i) => (
            <div className="tt-slot" key={i}>
              <div className="tt-slot-top">
                <select value={s.day} onChange={(e) => setSlot(i, { day: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 0].map((x) => <option key={x} value={x}>{DAY_NAMES[x]}요일</option>)}
                </select>
                <input type="time" step={300} value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} />
                <span>–</span>
                <input type="time" step={300} value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })} />
                {d.slots.length > 1 && <button className="schedule-block-remove" onClick={() => setD({ ...d, slots: d.slots.filter((_, k) => k !== i) })} aria-label="시간 삭제"><Trash2 size={15} /></button>}
              </div>
              <input className="tt-input tt-input--sm" placeholder="장소 (선택)" value={s.place} maxLength={30} onChange={(e) => setSlot(i, { place: e.target.value })} />
            </div>
          ))}
          <button className="tt-addslot" onClick={() => setD({ ...d, slots: [...d.slots, { day: 1, start: "09:00", end: "10:00", place: "" }] })}><Clock3 size={15} /> 시간 및 장소 추가</button>
        </div>
        <label className="tt-notify"><input type="checkbox" checked={d.notify} onChange={(e) => setD({ ...d, notify: e.target.checked })} /><span>이 일정 시간에도 알림 받기</span></label>
        {problem && <p className="tt-problem">{problem}</p>}
        {onDelete && <button className="tt-delete" onClick={() => void onDelete()}><Trash2 size={15} /> 이 일정 삭제</button>}
      </div>
    </div>
  );
}
