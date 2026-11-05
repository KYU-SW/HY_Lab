import webpush from "web-push";
import {
  allUserIds,
  getLastMovedAt,
  getPushSubs,
  getUser,
  getVapid,
  isQuietNow,
  listReminders,
  nowInSeoul,
  removePushSub,
  setVapid,
  toMinutes,
} from "./db";

let ready = false;

export function initPush() {
  let vapid = getVapid();
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys();
    setVapid(vapid);
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", vapid.publicKey, vapid.privateKey);
  ready = true;
  return vapid.publicKey;
}

export function getPublicKey() {
  return getVapid()?.publicKey ?? null;
}

async function sendToUser(userId: string, payload: { title: string; body: string; tag?: string }) {
  if (!ready) return;
  for (const sub of getPushSubs(userId)) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (e: any) {
      // 만료/해지된 구독은 정리
      if (e?.statusCode === 404 || e?.statusCode === 410) removePushSub(userId, sub.endpoint);
    }
  }
}

// 사용자별로 "이번 휴식 알림을 이미 보냈는지" 기억 (lastMovedAt가 바뀌면 새 회차)
const breakNotified = new Map<string, string>();
const reminderFired = new Set<string>();

export function startPushScheduler() {
  setInterval(() => {
    const { day, minutes } = nowInSeoul();
    const minuteKey = `${new Date().toISOString().slice(0, 13)}:${minutes}`;
    if (reminderFired.size > 5000) reminderFired.clear();

    for (const userId of allUserIds()) {
      if (!getPushSubs(userId).length) continue;
      const user = getUser(userId);
      if (!user) continue;
      const quiet = isQuietNow(userId);

      // 1) 권장 휴식 주기 도달 알림
      if (user.trackingEnabled !== false && !quiet) {
        const lastMovedAt = getLastMovedAt(userId);
        const elapsedSec = (Date.now() - new Date(lastMovedAt).getTime()) / 1000;
        if (elapsedSec >= user.breakIntervalMin * 60 && breakNotified.get(userId) !== lastMovedAt) {
          breakNotified.set(userId, lastMovedAt);
          void sendToUser(userId, {
            title: "시작점",
            body: `${user.breakIntervalMin}분이 지났어요. 잠깐 일어나서 움직여볼까요?`,
            tag: "break",
          });
        }
      }

      // 2) 지정 시각 알림
      if (!quiet) {
        for (const r of listReminders(userId)) {
          if (!r.enabled) continue;
          if (r.day !== null && r.day !== day) continue;
          if (toMinutes(r.time) !== minutes) continue;
          const key = `${userId}:${r.id}:${minuteKey}`;
          if (reminderFired.has(key)) continue;
          reminderFired.add(key);
          void sendToUser(userId, { title: "시작점", body: r.label || "움직일 시간이에요", tag: `reminder-${r.id}` });
        }
      }
    }
  }, 20000);
}
