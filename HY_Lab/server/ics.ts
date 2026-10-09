import dns from "node:dns/promises";
import net from "node:net";
import { todayIso, type ScheduleBlock } from "./db";

export type ParsedBlock = Omit<ScheduleBlock, "id">;

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfold(text: string) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function tzOffsetMs(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - utcMs;
}

// "YYYYMMDDTHHMMSS(Z)" + 시간대 -> 서울 기준 { date, minutes }
function toSeoul(value: string, params: string): { date: string; minutes: number } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null; // 종일 일정(날짜만) 등은 제외
  const [, y, mo, d, h, mi, , z] = m;
  const local = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  let utcMs: number;
  const tzid = params.match(/TZID=([^;:]+)/)?.[1];
  if (z) {
    utcMs = local;
  } else {
    const tz = tzid && isValidTz(tzid) ? tzid : "Asia/Seoul";
    utcMs = local - tzOffsetMs(local, tz);
    utcMs = local - tzOffsetMs(utcMs, tz); // 한 번 더 보정 (DST 경계)
  }
  const seoul = new Date(utcMs + 9 * 3600 * 1000);
  return {
    date: seoul.toISOString().slice(0, 10),
    minutes: seoul.getUTCHours() * 60 + seoul.getUTCMinutes(),
  };
}

function isValidTz(tz: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function weekdayOf(date: string) {
  return new Date(date + "T00:00:00+09:00").getDay();
}

export function parseIcs(text: string) {
  const lines = unfold(text);
  const today = todayIso();
  const blocks: ParsedBlock[] = [];
  const skipped = { allDay: 0, past: 0, unsupported: 0 };

  let cur: Record<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) handle(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rest] = head.split(";");
    cur[name.toUpperCase()] = { params: rest.join(";"), value };
  }

  function handle(ev: Record<string, { params: string; value: string }>) {
    if (ev.STATUS?.value === "CANCELLED") return;
    const ds = ev.DTSTART, de = ev.DTEND;
    if (!ds) return;
    const start = toSeoul(ds.value, ds.params);
    if (!start) { skipped.allDay++; return; }
    let end = de ? toSeoul(de.value, de.params) : null;
    let endMin = end && end.date === start.date ? end.minutes : end ? 23 * 60 + 59 : start.minutes + 60;
    if (endMin <= start.minutes) endMin = Math.min(23 * 60 + 59, start.minutes + 60);
    const title = (ev.SUMMARY?.value ?? "일정").replace(/\\,/g, ",").replace(/\\n/g, " ").slice(0, 40) || "일정";
    const base = { start: hhmm(start.minutes), end: hhmm(endMin), title, notify: false };

    const rule = ev.RRULE?.value;
    if (rule) {
      const kv = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]));
      const until = kv.UNTIL ? toSeoul(kv.UNTIL.length === 8 ? kv.UNTIL + "T235959" : kv.UNTIL, "") : null;
      if (until && until.date < today) { skipped.past++; return; }
      if (kv.FREQ === "WEEKLY") {
        const days = kv.BYDAY ? kv.BYDAY.split(",").map((c) => DAY_CODES.indexOf(c.slice(-2))).filter((d) => d >= 0) : [weekdayOf(start.date)];
        for (const day of days) blocks.push({ ...base, day });
        return;
      }
      if (kv.FREQ === "DAILY") { blocks.push({ ...base, day: null }); return; }
      skipped.unsupported++;
      return;
    }
    if (start.date < today) { skipped.past++; return; }
    blocks.push({ ...base, day: weekdayOf(start.date), date: start.date });
  }

  return { blocks: blocks.slice(0, 300), skipped };
}

// ---------- URL로 가져오기 (SSRF 방지 포함) ----------

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
}

export async function fetchIcsFromUrl(rawUrl: string): Promise<string> {
  const url = new URL(rawUrl.trim().replace(/^webcal:\/\//i, "https://"));
  if (url.protocol !== "https:") throw new Error("https 주소만 가져올 수 있어요.");
  const addrs = await dns.lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("가져올 수 없는 주소예요.");
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`캘린더를 불러오지 못했어요 (${res.status}).`);
  const text = await res.text();
  if (text.length > 2_000_000) throw new Error("파일이 너무 커요.");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("캘린더(.ics) 형식이 아니에요.");
  return text;
}
