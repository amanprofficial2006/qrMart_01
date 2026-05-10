import { initializeApp, getApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfigDefaults = {
  apiKey: "AIzaSyBEd31CoL3fpBRQSfBJP9u2K4gVSZe0zno",
  authDomain: "qrmart-fc52c.firebaseapp.com",
  projectId: "qrmart-fc52c",
  storageBucket: "qrmart-fc52c.firebasestorage.app",
  messagingSenderId: "51233536961",
  appId: "1:51233536961:web:d6803b4f93f84f7a690d40",
  measurementId: "G-K1CKQ55P19"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigDefaults.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigDefaults.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigDefaults.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigDefaults.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigDefaults.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigDefaults.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigDefaults.measurementId
};

const vapidKey =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  "BCabXVvEYG-AIXTlbpAyyRXPczvxy4t0OglXx5HBL8BQAwfcJ3h5myLmDNFd3Ed_hCD3C5RzXWtXaHVqv761N5w";
const ORDER_ALERT_SOUND_URL = "/freesound_community-phone-ringing-48238.mp3";
const ORDER_ALERT_VIBRATION_PATTERN = [500, 150, 500, 150, 500];
const ORDER_ALERT_DEDUPE_MS = 12000;
let orderAlertAudio = null;
let orderAlertAudioUnlocked = false;
let orderAlertUnlockHandler = null;
let ownerNotificationBridgeAttached = false;
const recentOrderAlerts = new Map();

function isIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function getPushSupportError() {
  if (typeof window === "undefined") {
    return "Push notifications are only available in the browser.";
  }

  if (!window.isSecureContext) {
    return "Push notifications work only on HTTPS websites. If you opened this on your phone using a local IP or HTTP link, open the HTTPS deployed site instead.";
  }

  if (isIosDevice() && !isStandaloneWebApp()) {
    return "On iPhone and iPad, push notifications work only after adding this site to the Home Screen and opening it from there.";
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "This browser does not support push notifications.";
  }

  return "";
}

function requestNotificationPermission() {
  return new Promise((resolve, reject) => {
    if (!("Notification" in window)) {
      resolve("denied");
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const result = Notification.requestPermission((permission) => {
        finish(permission);
      });

      if (result && typeof result.then === "function") {
        result.then(finish).catch(reject);
        return;
      }

      if (typeof result === "string") {
        finish(result);
        return;
      }
    } catch (error) {
      reject(error);
      return;
    }

    finish(Notification.permission || "default");
  });
}

function toNotificationErrorMessage(error) {
  const message = String(error?.message || error || "");

  if (!message) {
    return "Unable to enable push notifications on this device.";
  }

  if (/messaging\/unsupported-browser/i.test(message) || /supported browsers/i.test(message)) {
    return "This browser does not support Firebase web push notifications.";
  }

  if (/permission/i.test(message) && /block|denied/i.test(message)) {
    return "Notification permission is blocked for this site in your browser settings.";
  }

  if (/service worker/i.test(message) && !window.isSecureContext) {
    return "Push notifications require HTTPS. Open the deployed HTTPS site on your phone.";
  }

  return message;
}

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

function ensureOrderAlertAudio() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!orderAlertAudio) {
    orderAlertAudio = new Audio(ORDER_ALERT_SOUND_URL);
    orderAlertAudio.preload = "auto";
    orderAlertAudio.playsInline = true;
    orderAlertAudio.load();
  }

  return orderAlertAudio;
}

async function primeOrderAlertAudio() {
  const audio = ensureOrderAlertAudio();

  if (!audio || orderAlertAudioUnlocked) {
    return orderAlertAudioUnlocked;
  }

  try {
    audio.muted = true;
    audio.currentTime = 0;
    const playback = audio.play();

    if (playback && typeof playback.then === "function") {
      await playback;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    orderAlertAudioUnlocked = true;
    return true;
  } catch (_error) {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    return false;
  }
}

function attachOrderAlertUnlockListeners() {
  if (typeof window === "undefined" || orderAlertUnlockHandler) {
    return;
  }

  const events = ["pointerdown", "touchstart", "keydown"];
  orderAlertUnlockHandler = () => {
    void primeOrderAlertAudio().then((unlocked) => {
      if (!unlocked || !orderAlertUnlockHandler) {
        return;
      }

      for (const eventName of events) {
        window.removeEventListener(eventName, orderAlertUnlockHandler);
      }

      orderAlertUnlockHandler = null;
    });
  };

  for (const eventName of events) {
    window.addEventListener(eventName, orderAlertUnlockHandler, {
      passive: eventName !== "keydown"
    });
  }
}

function pruneRecentOrderAlerts() {
  const now = Date.now();

  for (const [orderId, timestamp] of recentOrderAlerts.entries()) {
    if (now - timestamp > ORDER_ALERT_DEDUPE_MS) {
      recentOrderAlerts.delete(orderId);
    }
  }
}

function markOrderAlertHandled(orderId) {
  pruneRecentOrderAlerts();

  const cleanOrderId = String(orderId || "").trim();

  if (!cleanOrderId) {
    return true;
  }

  if (recentOrderAlerts.has(cleanOrderId)) {
    return false;
  }

  recentOrderAlerts.set(cleanOrderId, Date.now());
  return true;
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

function playOrderAlertSound() {
  try {
    const audio = ensureOrderAlertAudio();

    if (!audio) {
      playFallbackOrderAlertTone();
      return;
    }

    audio.muted = false;
    audio.currentTime = 0;
    const playback = audio.play();

    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        attachOrderAlertUnlockListeners();
        playFallbackOrderAlertTone();
      });
    }
  } catch (_error) {
    attachOrderAlertUnlockListeners();
    playFallbackOrderAlertTone();
  }
}

function triggerOrderAlertEffects(orderId = "") {
  if (!markOrderAlertHandled(orderId)) {
    return;
  }

  if ("vibrate" in navigator) {
    navigator.vibrate(ORDER_ALERT_VIBRATION_PATTERN);
  }

  playOrderAlertSound();
}

export function bindOwnerNotificationSoundBridge() {
  if (
    ownerNotificationBridgeAttached ||
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  ensureOrderAlertAudio();
  attachOrderAlertUnlockListeners();
  ownerNotificationBridgeAttached = true;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const payload = event.data || {};

    if (payload.type !== "OWNER_ORDER_ALERT" || payload.sound !== "order_incoming") {
      return;
    }

    triggerOrderAlertEffects(payload.orderId || "");
  });
}

export async function registerOwnerNotifications(apiFetch) {
  const supportError = getPushSupportError();

  ensureOrderAlertAudio();
  attachOrderAlertUnlockListeners();
  void primeOrderAlertAudio();

  if (supportError) {
    return {
      ok: false,
      message: supportError
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

  const permission = await requestNotificationPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      message: "Notification permission was not granted."
    };
  }

  try {
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
  } catch (error) {
    return {
      ok: false,
      message: toNotificationErrorMessage(error)
    };
  }

  return {
    ok: true,
    message: "Order notifications enabled on this browser."
  };
}

export async function createCustomerNotificationToken() {
  const supportError = getPushSupportError();

  if (supportError) {
    return {
      ok: false,
      message: supportError
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

  const permission = await requestNotificationPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      message: "Notification permission was not granted."
    };
  }

  try {
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
  } catch (error) {
    return {
      ok: false,
      message: toNotificationErrorMessage(error)
    };
  }
}

export function showForegroundOrderAlert(order) {
  const orderId = order?._id || order?.id || "";
  const customerName = order.customer?.name || "Customer";
  const itemSummary = (order.items || [])
    .slice(0, 3)
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(", ");

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("New Order", {
      body: `${customerName}: ${itemSummary} - Rs. ${order.totalAmount}`,
      icon: "/favicon.png",
      tag: `order-${orderId || "new-order"}`,
      requireInteraction: true,
      silent: true
    });
  }

  triggerOrderAlertEffects(orderId);
}

function playFallbackOrderAlertTone() {
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
