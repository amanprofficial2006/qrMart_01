importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const ORDER_ALERT_SOUND = "order_incoming";
const OWNER_DASHBOARD_PATHS = ["/dashboard", "/owner/dashboard"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
  measurementId: params.get("measurementId")
};

if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  function isOwnerDashboardClient(client) {
    try {
      const pathname = new URL(client.url).pathname;
      return OWNER_DASHBOARD_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    } catch (_error) {
      return false;
    }
  }

  messaging.onBackgroundMessage(async (payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const type = String(data.type || "").toUpperCase();
    const isNewOrder = type === "NEW_ORDER";
    const isOrderUpdate = type === "ORDER_UPDATE";
    const targetUrl =
      isOrderUpdate && data.shopSlug
        ? `/shop/${encodeURIComponent(data.shopSlug)}/${data.status === "rejected" ? "track" : "notifications"}`
        : "/dashboard";
    const windowClients = isNewOrder
      ? await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      : [];
    const ownerClients = windowClients.filter(isOwnerDashboardClient);

    await self.registration.showNotification(notification.title || (isNewOrder ? "New Order" : "Notification"), {
      body: notification.body || data.orderSummary || "A new order was placed.",
      icon: "/favicon.png",
      badge: "/favicon.png",
      tag: data.orderId ? `order-${data.orderId}` : "new-order",
      requireInteraction: true,
      silent: isNewOrder && ownerClients.length > 0,
      data: {
        url: targetUrl
      }
    });

    if (isNewOrder) {
      for (const client of ownerClients) {
        client.postMessage({
          type: "OWNER_ORDER_ALERT",
          sound: ORDER_ALERT_SOUND,
          orderId: data.orderId || ""
        });
      }
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/dashboard"));
});
