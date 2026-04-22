import { initializeApp, getApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

function isLikelyValidVapidKey(value) {
  const key = String(value || "").trim();

  // Firebase Web Push certificate public keys are URL-safe base64 strings.
  // They are usually around 87 characters; short keys are commonly copied from
  // the wrong Firebase field, such as API key or server key.
  return key.length >= 80 && /^[A-Za-z0-9_-]+$/.test(key);
}

function missingFirebaseConfigKeys() {
  const required = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
    VITE_FIREBASE_VAPID_KEY: vapidKey
  };

  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function serviceWorkerUrl() {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (value) {
      params.set(key, value);
    }
  }

  return `/firebase-messaging-sw.js?${params.toString()}`;
}

function waitForServiceWorkerActivation(registration) {
  if (registration.active) {
    return Promise.resolve(registration);
  }

  const worker = registration.installing || registration.waiting;

  if (!worker) {
    return navigator.serviceWorker.ready;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Service worker did not become active. Refresh the page and try again."));
    }, 10000);

    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        resolve(registration);
      }
    });
  });
}

async function registerMessagingServiceWorker() {
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
    scope: "/"
  });

  await registration.update();
  await waitForServiceWorkerActivation(registration);
  return navigator.serviceWorker.ready;
}

export async function registerOwnerNotifications(apiFetch) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return {
      ok: false,
      message: "This browser does not support push notifications."
    };
  }

  const missingKeys = missingFirebaseConfigKeys();

  if (missingKeys.length) {
    return {
      ok: false,
      message: `Firebase web push config is missing: ${missingKeys.join(", ")}. Add it in frontend/.env and restart npm run dev.`
    };
  }

  if (!isLikelyValidVapidKey(vapidKey)) {
    const keyLength = String(vapidKey || "").trim().length;
    const keyHint =
      keyLength === 43
        ? " The current value looks like a 43-character private key, not the public Web Push certificate key."
        : "";

    return {
      ok: false,
      message:
        `VITE_FIREBASE_VAPID_KEY is not a valid Web Push certificate public key.${keyHint} In Firebase Console, go to Project settings -> Cloud Messaging -> Web Push certificates, generate/copy the public key, paste it in frontend/.env, then restart npm run dev.`
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      message: "Notification permission was not granted."
    };
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const serviceWorkerRegistration = await registerMessagingServiceWorker();
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration
  });

  if (!fcmToken) {
    return {
      ok: false,
      message: "Unable to create an FCM token for this browser."
    };
  }

  await apiFetch("/api/v1/owner/devices", {
    method: "POST",
    body: JSON.stringify({
      platform: "web",
      fcmToken
    })
  });

  return {
    ok: true,
    message: "Order notifications enabled on this browser."
  };
}

export async function createCustomerNotificationToken() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return {
      ok: false,
      message: "This browser does not support push notifications."
    };
  }

  const missingKeys = missingFirebaseConfigKeys();

  if (missingKeys.length) {
    return {
      ok: false,
      message: `Firebase web push config is missing: ${missingKeys.join(", ")}.`
    };
  }

  if (!isLikelyValidVapidKey(vapidKey)) {
    return {
      ok: false,
      message: "Notification key is not configured correctly."
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      message: "Notification permission was not granted."
    };
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const serviceWorkerRegistration = await registerMessagingServiceWorker();
  const fcmToken = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration
  });

  if (!fcmToken) {
    return {
      ok: false,
      message: "Unable to create notification token."
    };
  }

  return {
    ok: true,
    fcmToken,
    message: "Order update notifications enabled."
  };
}

export function showForegroundOrderAlert(order) {
  const customerName = order.customer?.name || "Customer";
  const itemSummary = (order.items || [])
    .slice(0, 3)
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(", ");

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("New Order", {
      body: `${customerName}: ${itemSummary} - Rs. ${order.totalAmount}`,
      icon: "/favicon.png",
      tag: `order-${order._id}`,
      requireInteraction: true
    });
  }

  if ("vibrate" in navigator) {
    navigator.vibrate([500, 150, 500, 150, 500]);
  }

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.45);
  } catch (_error) {
    // Some browsers block sound until the owner interacts with the page.
  }
}
