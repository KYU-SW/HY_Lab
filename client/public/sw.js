// 시작점 서비스워커: 앱을 닫아도 서버가 보내는 웹 푸시 알림을 표시
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "시작점", body: "잠깐 움직여볼까요?" };
  try { data = { ...data, ...event.data.json() }; } catch (e) { /* 텍스트가 아니면 기본 문구 */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/favicon.png",
      badge: "/favicon.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      return self.clients.openWindow("/");
    })
  );
});
