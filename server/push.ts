import webpush from "web-push";
import {
  allUserIds,
  getLastMovedAt,
  getPushSubs,
  getUser,
  getHeld,
  getVapid,
  isQuietNow,
  setHeld,
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
      //    수업 중(무음 일정)이면 바로 보내지 않고 "보류" → 수업이 끝나면 다시 판단해서 보냄.
      //    그사이 움직였거나(일어나기 기록) 타이머를 껐으면 보류 취소.
      if (user.trackingEnabled !== false) {
        const lastMovedAt = getLastMovedAt(userId);
        const elapsedSec = (Date.now() - new Date(lastMovedAt).getTime()) / 1000;
        const due = elapsedSec >= user.breakIntervalMin * 60;
        const held = getHeld(userId);
        if (held && held.lastMovedAt !== lastMovedAt) setHeld(userId, undefined); // 이미 움직임
        else if (held && !quiet) {
          setHeld(userId, undefined);
          breakNotified.set(userId, lastMovedAt);
          void sendToUser(userId, {
            title: "시작점",
            body: `수업 끝났어요. ${Math.round(elapsedSec / 60)}분째 앉아 있어요. 쉬는 시간에 잠깐 일어나볼까요?`,
            tag: "break",
          });
        } else if (due && breakNotified.get(userId) !== lastMovedAt && !held) {
          if (quiet) setHeld(userId, { at: new Date().toISOString(), lastMovedAt });
          else {
            breakNotified.set(userId, lastMovedAt);
            void sendToUser(userId, {
              title: "시작점",
              body: `${user.breakIntervalMin}분이 지났어요. 잠깐 일어나서 움직여볼까요?`,
              tag: "break",
            });
          }
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
