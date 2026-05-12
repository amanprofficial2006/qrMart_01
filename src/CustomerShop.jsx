import React, { useEffect, useState } from "react";
import "./customer-experience.css";
import { API_BASE_URL, assetUrl } from "./api.js";
import { createCustomerNotificationToken } from "./notifications.js";

const flowSteps = [
  { id: "menu", label: "Menu" },
  { id: "product", label: "Product" },
  { id: "cart", label: "Cart" },
  { id: "verify", label: "Verify" },
  { id: "payment", label: "Payment" },
  { id: "waiting", label: "Waiting" },
  { id: "track", label: "Track" }
];

const accountSteps = [
  { id: "dashboard", label: "Home" },
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Alerts" }
];

const routeSteps = [...flowSteps, ...accountSteps];
const mobileTabs = [
  { id: "menu", label: "Menu", icon: "menu" },
  { id: "cart", label: "Cart", icon: "cart" },
  { id: "profile", label: "Profile", icon: "user" }
];

const orderFlowRoutes = new Set(["menu", "cart", "verify", "payment", "waiting", "track"]);
const checkoutRoutes = new Set(["verify", "payment"]);
const trackStatuses = ["payment_claimed", "accepted", "preparing", "ready", "completed"];

const CUSTOMER_SESSION_KEY = "qrmart_customer_session";
const CART_STORAGE_KEY_PREFIX = "qrmart_customer_cart:";
const ACTIVE_ORDER_KEY_PREFIX = "qrmart_customer_active_order:";
const ORDER_HISTORY_KEY = "qrmart_customer_order_history";
const RECENT_SHOPS_KEY = "qrmart_recent_shops";
const SAVED_SHOPS_KEY = "qrmart_saved_shops";
const SAVED_ADDRESSES_KEY = "qrmart_saved_addresses";
const CUSTOMER_NOTIFICATIONS_KEY = "qrmart_customer_notifications";
const INSTALL_BANNER_KEY = "qrmart_install_banner_dismissed";
const SPLASH_SEEN_KEY = "qrmart_customer_shop_seen";
const brandIcon = "/favicon.png";

const STATIC_CUSTOMER_OTP = "142006";

function readJson(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function readSessionJson(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function cartStorageKey(slug) {
  return `${CART_STORAGE_KEY_PREFIX}${slug}`;
}

function activeOrderStorageKey(slug) {
  return `${ACTIVE_ORDER_KEY_PREFIX}${slug}`;
}

function readCartSession(slug) {
  return readSessionJson(cartStorageKey(slug), {});
}

function saveCartSession(slug, cart) {
  writeSessionJson(cartStorageKey(slug), cart);
}

function readActiveOrder(slug) {
  return readJson(activeOrderStorageKey(slug), null);
}

function saveActiveOrder(slug, order) {
  if (typeof window === "undefined") {
    return;
  }

  if (!order) {
    window.localStorage.removeItem(activeOrderStorageKey(slug));
    return;
  }

  writeJson(activeOrderStorageKey(slug), order);
}

function readCustomerSession() {
  const session = readJson(CUSTOMER_SESSION_KEY, null);
  return session && session.token && session.customer ? session : null;
}

function saveCustomerSession(session) {
  writeJson(CUSTOMER_SESSION_KEY, session);
}

function clearCustomerSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CUSTOMER_SESSION_KEY);
}

function readOrderHistory() {
  return readJson(ORDER_HISTORY_KEY, []);
}

function readRecentShops() {
  return readJson(RECENT_SHOPS_KEY, []);
}

function readSavedShops() {
  return readJson(SAVED_SHOPS_KEY, []);
}

function readSavedAddresses() {
  return readJson(SAVED_ADDRESSES_KEY, []);
}

function readNotifications() {
  return readJson(CUSTOMER_NOTIFICATIONS_KEY, []);
}

function readInstallDismissed() {
  return readJson(INSTALL_BANNER_KEY, false);
}

function getShopPathInfo() {
  const match = window.location.pathname.match(/^\/(shop|s)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);

  if (!match) {
    return { slug: "", basePath: "", step: "menu", productId: "" };
  }

  const candidateStep = match[3] || "menu";
  const step = routeSteps.some((entry) => entry.id === candidateStep) ? candidateStep : "menu";
  const productId = step === "product" ? decodeURIComponent(match[4] || "") : "";

  return {
    slug: decodeURIComponent(match[2]),
    basePath: `/${match[1]}/${match[2]}`,
    step: step === "product" && !productId ? "menu" : step,
    productId
  };
}

function groupByCategory(products) {
  return products.reduce((groups, product) => {
    const category = product.category || "Chef picks";
    groups[category] = groups[category] || [];
    groups[category].push(product);
    return groups;
  }, {});
}

function buildUpiLink(shop, amount) {
  const upiId = shop?.payment?.upiId;

  if (!upiId) {
    return "";
  }

  const params = new URLSearchParams({
    pa: upiId,
    pn: shop.name || "Shop",
    am: String(amount),
    cu: "INR",
    tn: `qrMart order for ${shop.name || "shop"}`
  });

  return `upi://pay?${params.toString()}`;
}

function normalizeStatus(status) {
  return status === "placed" ? "payment_claimed" : status || "payment_claimed";
}

function resolveOrderRoute(order) {
  const status = normalizeStatus(order?.status);
  return status === "payment_claimed" ? "waiting" : "track";
}

function createShopSnapshot(shop, basePath) {
  return {
    slug: shop.slug,
    basePath,
    name: shop.name,
    address: shop.address || "",
    description: shop.description || "",
    logoUrl: shop.logoUrl || "",
    savedAt: new Date().toISOString()
  };
}

function humanizeStatus(status) {
  return String(status || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "Just now";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (_error) {
    return "Just now";
  }
}

function timeAgo(value) {
  if (!value) {
    return "Just now";
  }

  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

function orderStateCopy(order) {
  const normalized = normalizeStatus(order?.status);

  switch (normalized) {
    case "accepted":
      return {
        eyebrow: "Payment verified",
        title: "The shop has accepted your order",
        copy: "Everything is confirmed and the kitchen or counter team has started processing it.",
        eta: "Usually ready in 8 to 15 minutes"
      };
    case "preparing":
      return {
        eyebrow: "In progress",
        title: "Your order is being prepared",
        copy: "The shop is actively preparing your items. Stay on this page for the next status update.",
        eta: "Usually ready in 5 to 10 minutes"
      };
    case "ready":
      return {
        eyebrow: "Pickup alert",
        title: "Your order is ready",
        copy: "Head to the counter or pickup point. The shop has marked your order ready.",
        eta: "Ready right now"
      };
    case "completed":
      return {
        eyebrow: "Completed",
        title: "Order completed",
        copy: "Your order is done. It is now saved for faster repeat ordering in the future.",
        eta: "Completed"
      };
    case "payment_claimed":
    default:
      return {
        eyebrow: "Waiting for Shop Confirmation",
        title: "Waiting for Shop Confirmation",
        copy: "We are verifying your payment with the shop.",
        eta: "Usually confirmed in 2 to 5 minutes"
      };
  }
}

function trackingSteps(order) {
  return [
    {
      id: "payment_claimed",
      title: order?.payment?.declaredPaid ? "Payment claimed" : "Order created",
      text: order?.payment?.declaredPaid
        ? "Your payment proof has been shared with the shop."
        : "Your order has been created and shared with the shop."
    },
    {
      id: "accepted",
      title: "Order accepted",
      text: "The shop has confirmed the order and payment."
    },
    {
      id: "preparing",
      title: "Preparing",
      text: "The shop is preparing your items."
    },
    {
      id: "ready",
      title: "Ready",
      text: "The order is ready to collect or serve."
    },
    {
      id: "completed",
      title: "Completed",
      text: "The order has been completed."
    }
  ];
}

function isTrackStepComplete(currentStatus, targetStatus) {
  const currentIndex = trackStatuses.indexOf(normalizeStatus(currentStatus));
  const targetIndex = trackStatuses.indexOf(targetStatus);
  return currentIndex >= targetIndex;
}

function activeTrackIndex(status) {
  const index = trackStatuses.indexOf(normalizeStatus(status));
  return index === -1 ? 0 : index;
}

function categorySectionId(category) {
  return `customer-category-${String(category).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function buildNotification(title, message, extras = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: new Date().toISOString(),
    unread: true,
    ...extras
  };
}

function buildOrderRecord(orderData, shop, cartItems, customer, customerSession, basePath) {
  return {
    ...orderData,
    slug: shop.slug,
    basePath,
    shopName: shop.name,
    shopLogoUrl: shop.logoUrl || "",
    shopAddress: shop.address || "",
    shopDescription: shop.description || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: cartItems.map((item) => ({
      productId: item._id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      imageUrl: item.imageUrl || ""
    })),
    customerSnapshot: {
      name: customer.name.trim() || customerSession?.customer?.name || "",
      phone: customerSession?.customer?.phone || customer.phone || "",
      address: customer.address || "",
      note: customer.note || ""
    }
  };
}

function upsertById(list, item, idField) {
  return [item, ...list.filter((entry) => entry[idField] !== item[idField])];
}

function SafeImage({ src, fallback = null, ...props }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return fallback;
  }

  return <img {...props} src={src} onError={() => setFailed(true)} />;
}

function LoadingShell() {
  return (
    <main className="customer-shell customer-loading-shell">
      <div className="customer-ambient customer-ambient-left" aria-hidden="true" />
      <div className="customer-ambient customer-ambient-right" aria-hidden="true" />
      <section className="customer-splash-panel">
        <div className="customer-logo-mark" aria-hidden="true">
          <img className="customer-logo-image" src={brandIcon} alt="" />
        </div>
        <div>
          <h1>qrMart</h1>
          <span>Loading store</span>
        </div>
      </section>
    </main>
  );
}

function CustomerShop() {
  const [pathInfo] = useState(getShopPathInfo);
  const [slug] = useState(pathInfo.slug);
  const [activeStep, setActiveStep] = useState(pathInfo.step);
  const [activeProductId, setActiveProductId] = useState(pathInfo.productId || "");
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => readCartSession(pathInfo.slug));
  const [customerSession, setCustomerSession] = useState(readCustomerSession);
  const [customer, setCustomer] = useState(() => {
    const savedSession = readCustomerSession();
    const savedAddresses = readSavedAddresses();
    return {
      name: savedSession?.customer?.name || "",
      phone: savedSession?.customer?.phone || "",
      address: savedAddresses[0]?.address || "",
      note: ""
    };
  });
  const [otp, setOtp] = useState("");
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Trying to attach your location for easier support...");
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeOrder, setActiveOrder] = useState(() => readActiveOrder(pathInfo.slug));
  const [orderHistory, setOrderHistory] = useState(readOrderHistory);
  const [recentShops, setRecentShops] = useState(readRecentShops);
  const [savedShops, setSavedShops] = useState(readSavedShops);
  const [savedAddresses, setSavedAddresses] = useState(readSavedAddresses);
  const [notifications, setNotifications] = useState(readNotifications);
  const [customerNotificationStatus, setCustomerNotificationStatus] = useState("");
  const [enablingOrderUpdates, setEnablingOrderUpdates] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(readInstallDismissed);
  const [installHint, setInstallHint] = useState("");
  const [profileLoginIntent, setProfileLoginIntent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const cartItems = products
    .map((product) => ({
      ...product,
      quantity: cart[product._id] || 0
    }))
    .filter((item) => item.quantity > 0);

  const itemTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryCharge = Number(shop?.settings?.deliveryCharge || 0);
  const payableDeliveryCharge = cartItems.length ? deliveryCharge : 0;
  const totalAmount = itemTotal + payableDeliveryCharge;
  const categoryGroups = groupByCategory(products);
  const categories = Object.entries(categoryGroups);
  const paymentConfigured = Boolean(shop?.payment?.upiId || shop?.payment?.qrCodeUrl);
  const upiLink = buildUpiLink(shop, totalAmount);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const currentShopOrder = activeOrder || orderHistory.find((entry) => entry.slug === slug) || null;
  const dashboardOrder = activeOrder || orderHistory[0] || null;
  const activeProduct = products.find((product) => product._id === activeProductId) || null;
  const currentOrderCopy = currentShopOrder ? orderStateCopy(currentShopOrder) : null;
  const unreadCount = notifications.filter((entry) => entry.unread).length;
  const shopInitial = (shop?.name || "Q").charAt(0).toUpperCase();
  const shopBrandLogo = shop?.logoUrl ? assetUrl(shop.logoUrl) : "";
  const activeFlowIndex = flowSteps.findIndex((entry) => entry.id === activeStep);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchResults = (normalizedSearch
    ? products.filter((product) =>
        [product.name, product.category, product.description].some((value) => String(value || "").toLowerCase().includes(normalizedSearch))
      )
    : products
  ).slice(0, 8);

  useEffect(() => {
    document.body.classList.add("customer-body");
    return () => document.body.classList.remove("customer-body");
  }, []);

  useEffect(() => {
    function syncStepFromUrl() {
      const nextPathInfo = getShopPathInfo();
      setActiveStep(nextPathInfo.step);
      setActiveProductId(nextPathInfo.productId || "");
    }

    window.addEventListener("popstate", syncStepFromUrl);
    return () => window.removeEventListener("popstate", syncStepFromUrl);
  }, []);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Invalid shop link.");
      return;
    }

    let cancelled = false;

    async function loadShop() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/public/shops/${slug}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Unable to load shop.");
        }

        if (cancelled) {
          return;
        }

        setShop(result.data.shop);
        setProducts(result.data.products);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadShop();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Location is unavailable on this browser. Ordering still works normally.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setLocationStatus("Location attached for smoother support and pickup coordination.");
      },
      () => {
        setLocationStatus("Location was skipped. You can still order without it.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 300000
      }
    );
  }, []);

  useEffect(() => {
    saveCartSession(slug, cart);
  }, [cart, slug]);

  useEffect(() => {
    saveActiveOrder(slug, activeOrder);
  }, [activeOrder, slug]);

  useEffect(() => {
    writeJson(ORDER_HISTORY_KEY, orderHistory);
  }, [orderHistory]);

  useEffect(() => {
    writeJson(RECENT_SHOPS_KEY, recentShops);
  }, [recentShops]);

  useEffect(() => {
    writeJson(SAVED_SHOPS_KEY, savedShops);
  }, [savedShops]);

  useEffect(() => {
    writeJson(SAVED_ADDRESSES_KEY, savedAddresses);
  }, [savedAddresses]);

  useEffect(() => {
    writeJson(CUSTOMER_NOTIFICATIONS_KEY, notifications);
  }, [notifications]);

  useEffect(() => {
    writeJson(INSTALL_BANNER_KEY, installDismissed);
  }, [installDismissed]);

  useEffect(() => {
    if (activeOrder) {
      setOrderHistory((current) => upsertById(current, activeOrder, "orderId").slice(0, 12));
    }
  }, [activeOrder]);

  useEffect(() => {
    if (!shop) {
      return;
    }

    const snapshot = createShopSnapshot(shop, pathInfo.basePath);
    setRecentShops((current) => upsertById(current, snapshot, "slug").slice(0, 8));
    setSavedShops((current) =>
      current.map((entry) => (entry.slug === snapshot.slug ? { ...entry, ...snapshot, savedAt: entry.savedAt } : entry))
    );
  }, [pathInfo.basePath, shop]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
    }

    function handleInstalled() {
      setInstallDismissed(true);
      setInstallHint("qrMart is now installed on this device.");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (activeStep === "notifications") {
      setNotifications((current) => current.map((notice) => ({ ...notice, unread: false })));
    }
  }, [activeStep]);

  useEffect(() => {
    const allowProfileVerify = activeStep === "verify" && profileLoginIntent;

    if (!cartItems.length && checkoutRoutes.has(activeStep) && !allowProfileVerify) {
      navigateStep("menu", true);
    }
  }, [activeStep, cartItems.length, profileLoginIntent]);

  useEffect(() => {
    if (activeStep === "waiting" && currentShopOrder && normalizeStatus(currentShopOrder.status) !== "payment_claimed") {
      navigateStep("track", true);
    }
  }, [activeStep, currentShopOrder]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!window.sessionStorage.getItem(SPLASH_SEEN_KEY)) {
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  function appendNotification(title, message, extras = {}) {
    setNotifications((current) => [buildNotification(title, message, extras), ...current].slice(0, 18));
  }

  function navigateStep(step, replace = false, productId = "") {
    const nextPath =
      step === "menu"
        ? pathInfo.basePath
        : step === "product" && productId
          ? `${pathInfo.basePath}/product/${encodeURIComponent(productId)}`
          : `${pathInfo.basePath}/${step}`;

    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({ customerStep: step, productId }, "", nextPath);
    }

    setActiveStep(step);
    setActiveProductId(step === "product" ? productId : "");
  }

  function goToStep(step) {
    setError("");

    if (step === "cart" && !cartCount) {
      setError("Add at least one item before opening the cart.");
      navigateStep("menu");
      return;
    }

    const allowProfileVerify = step === "verify" && profileLoginIntent;

    if (checkoutRoutes.has(step) && !cartCount && !allowProfileVerify) {
      setError("Add items to your cart before checkout.");
      navigateStep("menu");
      return;
    }

    if (step === "payment" && !customerSession?.token) {
      setError("Verify your phone number before payment.");
      navigateStep("verify");
      return;
    }

    if ((step === "waiting" || step === "track") && !currentShopOrder) {
      navigateStep("dashboard");
      return;
    }

    navigateStep(step);
  }

  function openProductPage(product) {
    if (!product?._id) {
      return;
    }

    setError("");
    navigateStep("product", false, product._id);
  }

  function openSearchedProduct(product) {
    setSearchOpen(false);
    setSearchQuery("");
    openProductPage(product);
  }

  function changeQuantity(productId, direction) {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[productId] || 0) + direction);
      const next = { ...current };

      if (nextQuantity === 0) {
        delete next[productId];
      } else {
        next[productId] = nextQuantity;
      }

      return next;
    });
  }

  function continueToCheckout() {
    if (!cartCount) {
      setError("Add at least one item first.");
      navigateStep("menu");
      return;
    }

    setProfileLoginIntent(false);
    navigateStep(customerSession?.token ? "payment" : "verify");
  }

  function startProfileLogin() {
    setError("");
    setProfileLoginIntent(true);
    navigateStep("verify");
  }

  function useSavedAddress(entry) {
    setCustomer((current) => ({
      ...current,
      address: entry.address
    }));
    appendNotification("Address applied", "Your saved address has been copied into the payment form.");
  }

  function resetVerifiedCustomer() {
    clearCustomerSession();
    setCustomerSession(null);
    setProfileLoginIntent(false);
    setOtp("");
    setCustomer((current) => ({
      ...current,
      name: "",
      phone: ""
    }));
    appendNotification("Verification cleared", "You can now verify with a different mobile number.");
    navigateStep("verify");
  }

  async function verifyCustomer(event) {
    event.preventDefault();
    setError("");

    if (!customer.phone.trim()) {
      setError("Phone number is required for OTP verification.");
      return;
    }

    if (customer.phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number.");
      return;
    }

    if (!otp.trim()) {
      setError("Enter the OTP to continue.");
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          otp: otp.trim()
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to verify OTP.");
      }

      saveCustomerSession(result.data);
      setCustomerSession(result.data);
      setCustomer((current) => ({
        ...current,
        name: result.data.customer.name || current.name,
        phone: result.data.customer.phone
      }));
      setOtp("");
      const nextStep = profileLoginIntent ? "profile" : "payment";
      appendNotification("Phone verified", `Your account is ready with ${result.data.customer.phone}.`, {
        slug,
        step: nextStep
      });
      setProfileLoginIntent(false);
      navigateStep(nextStep);
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError("");

    if (!cartCount) {
      setError("Add at least one item before placing the order.");
      return;
    }

    if (!customer.address.trim()) {
      setError("Address is required before payment can be completed.");
      return;
    }

    if (!customerSession?.token) {
      setError("Verify your phone number before placing the order.");
      navigateStep("verify");
      return;
    }

    if (paymentConfigured && !paymentAcknowledged) {
      setError("Mark payment as completed before placing the order.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/shops/${slug}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSession.token}`
        },
        body: JSON.stringify({
          customer: {
            name: customer.name.trim() || customerSession.customer.name || "",
            phone: customerSession.customer.phone,
            address: customer.address,
            note: customer.note,
            location
          },
          payment: {
            declaredPaid: paymentAcknowledged
          },
          items: cartItems.map((item) => ({
            productId: item._id,
            quantity: item.quantity
          }))
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to place order.");
      }

      const nextOrder = buildOrderRecord(result.data, shop, cartItems, customer, customerSession, pathInfo.basePath);
      const savedAddress = {
        id: `${customer.address.trim().toLowerCase()}-${customerSession.customer.phone}`,
        title: shop.name,
        address: customer.address.trim(),
        phone: customerSession.customer.phone,
        updatedAt: new Date().toISOString()
      };

      setActiveOrder(nextOrder);
      setOrderHistory((current) => upsertById(current, nextOrder, "orderId").slice(0, 12));
      setSavedAddresses((current) => upsertById(current, savedAddress, "id").slice(0, 6));
      setCart({});
      setPaymentAcknowledged(false);
      setCustomerNotificationStatus("");

      appendNotification(
        normalizeStatus(nextOrder.status) === "payment_claimed" ? "Payment claimed" : "Order placed",
        `${nextOrder.orderNumber} has been sent to ${shop.name}.`,
        {
          slug,
          orderId: nextOrder.orderId,
          step: resolveOrderRoute(nextOrder)
        }
      );

      navigateStep(resolveOrderRoute(nextOrder), true);
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("verify your phone")) {
        clearCustomerSession();
        setCustomerSession(null);
        navigateStep("verify");
      }

      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUpiId() {
    if (!shop?.payment?.upiId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shop.payment.upiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      appendNotification("UPI copied", "The UPI ID is ready to paste into your payment app.");
    } catch (_error) {
      setError("Unable to copy UPI ID right now.");
    }
  }

  async function enableOrderUpdates() {
    if (!currentShopOrder?.orderId || enablingOrderUpdates) {
      return;
    }

    setEnablingOrderUpdates(true);
    setCustomerNotificationStatus("Connecting live order notifications...");

    try {
      const tokenResult = await createCustomerNotificationToken();

      if (!tokenResult.ok) {
        setCustomerNotificationStatus(tokenResult.message);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/public/orders/${currentShopOrder.orderId}/customer-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fcmToken: tokenResult.fcmToken
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to enable order updates.");
      }

      setCustomerNotificationStatus("Live order notifications are enabled for this order.");
      appendNotification("Live updates enabled", "You will be notified when the shop changes this order status.", {
        slug,
        orderId: currentShopOrder.orderId,
        step: resolveOrderRoute(currentShopOrder)
      });
    } catch (err) {
      setCustomerNotificationStatus(err.message);
    } finally {
      setEnablingOrderUpdates(false);
    }
  }

  async function promptInstall() {
    setInstallHint("");

    if (!installPromptEvent) {
      setInstallHint("Use your browser menu and choose Add to Home Screen to install qrMart.");
      return;
    }

    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;

    if (choice.outcome === "accepted") {
      setInstallDismissed(true);
      return;
    }

    setInstallHint("You can continue on the web and install later anytime.");
  }

  function clearCart() {
    setCart({});
  }

  function markAllNotificationsRead() {
    setNotifications((current) => current.map((entry) => ({ ...entry, unread: false })));
  }

  function openNotification(notice) {
    setNotifications((current) => current.map((entry) => (entry.id === notice.id ? { ...entry, unread: false } : entry)));

    if (notice.slug && notice.slug !== slug) {
      const targetStep = notice.step || "dashboard";
      window.location.href = `/shop/${encodeURIComponent(notice.slug)}/${targetStep}`;
      return;
    }

    navigateStep(notice.step || "notifications");
  }

  function openSavedShop(entry, step = "menu") {
    if (entry.slug === slug) {
      navigateStep(step);
      return;
    }

    window.location.href = `${entry.basePath}${step === "menu" ? "" : `/${step}`}`;
  }

  function openOrder(order) {
    if (order.slug !== slug) {
      const step = resolveOrderRoute(order);
      window.location.href = `${order.basePath}/${step}`;
      return;
    }

    setActiveOrder(order);
    navigateStep(resolveOrderRoute(order));
  }

  function logoutCustomer() {
    clearCustomerSession();
    setCustomerSession(null);
    setCustomer((current) => ({
      ...current,
      name: "",
      phone: ""
    }));
    appendNotification("Logged out", "Your verified customer session has been cleared on this browser.", {
      slug,
      step: "profile"
    });
    navigateStep("profile");
  }

  function renderDesktopNav() {
    return (
      <header className="customer-topbar">
        <a className="customer-brand" href={shop ? pathInfo.basePath : "/"} aria-label={shop ? `${shop.name} menu` : "qrMart home"}>
          <SafeImage
            className="customer-brand-icon"
            src={shopBrandLogo}
            alt={shop ? `${shop.name} logo` : ""}
            fallback={
              <span className="customer-brand-fallback" aria-hidden="true">
                {shopInitial}
              </span>
            }
          />
          <span className="customer-brand-copy">
            <strong>{shop?.name || "qrMart"}</strong>
          </span>
        </a>

        <div className="customer-topbar-search">
          <label className="customer-search-field" aria-label="Search products">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onClick={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              placeholder="Search products"
            />
          </label>

          {searchOpen ? (
            <div className="customer-search-dropdown">
              {searchResults.length ? (
                searchResults.map((product) => (
                  <button type="button" key={product._id} onMouseDown={(event) => event.preventDefault()} onClick={() => openSearchedProduct(product)}>
                    <SafeImage
                      className="customer-search-thumb"
                      src={assetUrl(product.imageUrl)}
                      alt=""
                      fallback={<span>{(product.name || "?").charAt(0).toUpperCase()}</span>}
                    />
                    <span>
                      <strong>{product.name}</strong>
                      <small>{product.category || "Product"} | {formatCurrency(product.price)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="customer-search-empty">No product found</div>
              )}
            </div>
          ) : null}
        </div>

        <div className="customer-topbar-actions">
          <button
            type="button"
            className={`customer-ghost-chip customer-icon-chip ${activeStep === "cart" ? "is-active" : ""}`}
            onClick={() => goToStep("cart")}
            aria-label={`Cart${cartCount ? ` ${cartCount} items` : ""}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L20 8H7m3 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {cartCount ? <strong>{cartCount}</strong> : null}
          </button>
          <button
            type="button"
            className={`customer-ghost-chip customer-icon-chip ${activeStep === "profile" ? "is-active" : ""}`}
            onClick={() => goToStep("profile")}
            aria-label={customerSession?.token ? "Open profile" : "Profile access"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 21a8 8 0 0 0-16 0m8-10a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>
    );
  }

  function renderInstallBanner() {
    if (installDismissed) {
      return null;
    }

    return (
      <section className="customer-install-banner">
        <div>
          <p className="customer-overline">Install qrMart</p>
          <h2>Install qrMart for faster ordering and live order tracking.</h2>
          <p>Keep this shop a tap away, skip browser friction, and get smoother status updates after checkout.</p>
          {installHint ? <small>{installHint}</small> : null}
        </div>
        <div className="customer-install-actions">
          <button className="customer-primary-action" type="button" onClick={promptInstall}>
            Install App
          </button>
          <button className="customer-secondary-action" type="button" onClick={() => setInstallDismissed(true)}>
            Continue on Web
          </button>
        </div>
      </section>
    );
  }

  function renderSummaryRail() {
    return (
      <aside className="customer-summary-rail">
        <section className="customer-summary-card customer-panel-sticky">
          <div className="customer-summary-head">
            <div>
              <p className="customer-overline">Cart summary</p>
              <h3>{cartCount ? `${cartCount} item${cartCount > 1 ? "s" : ""}` : "Ready when you are"}</h3>
            </div>
            <strong className="customer-summary-amount">{formatCurrency(totalAmount)}</strong>
          </div>

          <div className="customer-summary-breakdown">
            <div>
              <span>Items</span>
              <strong>{formatCurrency(itemTotal)}</strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong>{formatCurrency(payableDeliveryCharge)}</strong>
            </div>
          </div>

          {currentShopOrder ? (
            <button className="customer-summary-status" type="button" onClick={() => goToStep(resolveOrderRoute(currentShopOrder))}>
              <span>Active order</span>
              <strong>{humanizeStatus(currentShopOrder.status)}</strong>
            </button>
          ) : (
            <p className="customer-summary-helper">Browse freely now. Verification appears only when you continue to payment.</p>
          )}

          <div className="customer-summary-actions">
            <button className="customer-primary-action" type="button" onClick={() => (cartCount ? continueToCheckout() : goToStep("menu"))}>
              {cartCount ? "Continue order" : "Browse menu"}
            </button>
            <button className="customer-secondary-action" type="button" onClick={() => goToStep("profile")}>
              {customerSession?.token ? "Open profile" : "Profile access"}
            </button>
          </div>
        </section>
      </aside>
    );
  }

  function renderMenuPage() {
    return (
      <div className="customer-stage-layout">
        <div className="customer-stage-main">
          {categories.map(([category, items]) => (
            <section className="customer-section" key={category} id={categorySectionId(category)}>
              <div className="customer-band-head">
                <div>
                  <p className="customer-overline">Category</p>
                  <h3>{category}</h3>
                </div>
                <span>{items.length} picks</span>
              </div>

              <div className="customer-menu-grid">
                {items.map((product) => (
                  <article className="customer-menu-card" key={product._id}>
                    <button className="customer-menu-detail" type="button" onClick={() => openProductPage(product)}>
                      <SafeImage
                        className="customer-menu-image"
                        src={assetUrl(product.imageUrl)}
                        alt={product.name}
                        fallback={<div className="customer-menu-placeholder">{(product.name || "?").charAt(0).toUpperCase()}</div>}
                      />

                      <div className="customer-menu-copy">
                        <div className="customer-price-row">
                          <span>{product.category || "Featured"}</span>
                          <strong>{formatCurrency(product.price)}</strong>
                        </div>
                        <h3>{product.name}</h3>
                        <p>{product.description || "Freshly listed for fast QR ordering."}</p>
                      </div>
                    </button>

                    <div className="customer-menu-actions">
                      {cart[product._id] ? (
                        <div className="customer-qty">
                          <button type="button" onClick={() => changeQuantity(product._id, -1)}>
                            -
                          </button>
                          <span>{cart[product._id]}</span>
                          <button type="button" onClick={() => changeQuantity(product._id, 1)}>
                            +
                          </button>
                        </div>
                      ) : (
                        <button className="customer-primary-action customer-inline-action" type="button" onClick={() => changeQuantity(product._id, 1)}>
                          Add to cart
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        {renderSummaryRail()}
      </div>
    );
  }

  function renderProductPage() {
    if (!activeProduct) {
      return (
        <section className="customer-section">
          <div className="customer-empty">
            <strong>Product not found</strong>
            <p>This item is not available right now.</p>
            <button className="customer-primary-action" type="button" onClick={() => goToStep("menu")}>
              Back to menu
            </button>
          </div>
        </section>
      );
    }

    return (
      <div className="customer-stage-layout">
        <div className="customer-stage-main">
          <section className="customer-section customer-product-shell">
            <div className="customer-section-head">
              <div>
                <p className="customer-overline">Product</p>
                <h2>{activeProduct.name}</h2>
                <p>{activeProduct.description || "Freshly listed for fast QR ordering."}</p>
              </div>
              <div className="customer-section-actions">
                <button className="customer-secondary-action" type="button" onClick={() => goToStep("menu")}>
                  Back to menu
                </button>
              </div>
            </div>

            <div className="customer-product-layout">
              <div className="customer-product-media">
                <SafeImage
                  className="customer-product-image"
                  src={assetUrl(activeProduct.imageUrl)}
                  alt={activeProduct.name}
                  fallback={<div className="customer-menu-placeholder">{(activeProduct.name || "?").charAt(0).toUpperCase()}</div>}
                />
              </div>

              <div className="customer-product-copy">
                <div className="customer-product-meta">
                  <span>{activeProduct.category || "Featured"}</span>
                  <strong>{formatCurrency(activeProduct.price)}</strong>
                </div>

                <p>{activeProduct.description || "Freshly listed for fast QR ordering."}</p>

                <div className="customer-product-actions">
                  {cart[activeProduct._id] ? (
                    <>
                      <div className="customer-qty">
                        <button type="button" onClick={() => changeQuantity(activeProduct._id, -1)}>
                          -
                        </button>
                        <span>{cart[activeProduct._id]}</span>
                        <button type="button" onClick={() => changeQuantity(activeProduct._id, 1)}>
                          +
                        </button>
                      </div>
                      <button className="customer-secondary-action" type="button" onClick={() => goToStep("cart")}>
                        View cart
                      </button>
                    </>
                  ) : (
                    <button className="customer-primary-action" type="button" onClick={() => changeQuantity(activeProduct._id, 1)}>
                      Add to cart
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {renderSummaryRail()}
      </div>
    );
  }

  function renderCartPage() {
    return (
      <div className="customer-stage-layout">
        <div className="customer-stage-main">
          <section className="customer-section">
            <div className="customer-section-head">
              <div>
                <p className="customer-overline">Cart</p>
                <h2>Review your order before checkout</h2>
                <p>Keep editing quantities or jump straight to OTP verification when everything looks right.</p>
              </div>
              <div className="customer-section-actions">
                {cartCount ? (
                  <button className="customer-secondary-action" type="button" onClick={clearCart}>
                    Clear cart
                  </button>
                ) : null}
              </div>
            </div>

            {cartItems.length ? (
              <>
                <div className="customer-cart-list">
                  {cartItems.map((item) => (
                    <article className="customer-cart-row" key={item._id}>
                      <div className="customer-media-button">
                        <SafeImage
                          className="customer-cart-image"
                          src={assetUrl(item.imageUrl)}
                          alt={item.name}
                          fallback={<div className="customer-menu-placeholder">{(item.name || "?").charAt(0).toUpperCase()}</div>}
                        />
                      </div>
                      <div>
                        <h3>{item.name}</h3>
                        <p>{formatCurrency(item.price)} each</p>
                      </div>
                      <div className="customer-qty">
                        <button type="button" onClick={() => changeQuantity(item._id, -1)}>
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(item._id, 1)}>
                          +
                        </button>
                      </div>
                      <strong>{formatCurrency(item.price * item.quantity)}</strong>
                    </article>
                  ))}
                </div>

                <div className="customer-inline-summary">
                  <div>
                    <span>Item total</span>
                    <strong>{formatCurrency(itemTotal)}</strong>
                  </div>
                  <div>
                    <span>Delivery charge</span>
                    <strong>{formatCurrency(payableDeliveryCharge)}</strong>
                  </div>
                  <div>
                    <span>Final total</span>
                    <strong>{formatCurrency(totalAmount)}</strong>
                  </div>
                </div>

                <div className="customer-page-actions">
                  <button className="customer-secondary-action" type="button" onClick={() => goToStep("menu")}>
                    Add more items
                  </button>
                  <button className="customer-primary-action" type="button" onClick={continueToCheckout}>
                    Proceed to checkout
                  </button>
                </div>
              </>
            ) : (
              <div className="customer-empty">
                <strong>Your cart is empty</strong>
                <p>Jump back to the menu and add a few items to start the order flow.</p>
                <button className="customer-primary-action" type="button" onClick={() => goToStep("menu")}>
                  Browse menu
                </button>
              </div>
            )}
          </section>
        </div>

        {renderSummaryRail()}
      </div>
    );
  }

  function renderVerifyPage() {
    return (
      <section className="customer-login-section">
        <section className="customer-section customer-verify-shell">
          <div className="customer-verify-hero">
            <p className="customer-overline">Customer login</p>
            <h2>Login with OTP</h2>
          </div>

          <form className="customer-form-panel customer-verify-form" id="customer-verify-form" onSubmit={verifyCustomer}>
            <label className="customer-field">
              <span>Name</span>
              <input
                value={customer.name}
                onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
                placeholder="Enter your name"
              />
            </label>

            <label className="customer-field">
              <span>Phone number</span>
              <input
                value={customer.phone}
                onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                placeholder="Enter phone number"
                inputMode="tel"
                required
              />
            </label>

            <label className="customer-field customer-otp-field">
              <span>OTP</span>
              <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" inputMode="numeric" required />
            </label>

            <div className="customer-note customer-otp-hint">
              <span>OTP</span>
              <strong>{STATIC_CUSTOMER_OTP}</strong>
            </div>

            <div className="customer-page-actions">
              <button className="customer-secondary-action" type="button" onClick={() => goToStep("cart")}>
                Back
              </button>
              <button className="customer-primary-action" type="submit" disabled={verifying}>
                {verifying ? "Verifying..." : "Login"}
              </button>
            </div>
          </form>
        </section>
      </section>
    );
  }

  function renderPaymentPage() {
    return (
      <section className="customer-split-section">
        <div className="customer-split-main">
          <section className="customer-section">
            <div className="customer-section-head">
              <div>
                <p className="customer-overline">Payment</p>
                <h2>Pay through UPI and place the order</h2>
                <p>Verification is complete. Add your address, pay the shop, and we will send the order for confirmation.</p>
              </div>
              <button className="customer-secondary-action" type="button" onClick={resetVerifiedCustomer}>
                Use another number
              </button>
            </div>

            <form className="customer-payment-shell" id="customer-payment-form" onSubmit={submitOrder}>
              <div className="customer-identity-strip">
                <div>
                  <span>Verified customer</span>
                  <strong>{customer.name.trim() || customerSession?.customer?.name || "qrMart customer"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{customerSession?.customer?.phone || customer.phone}</strong>
                </div>
              </div>

              <div className="customer-form-grid">
                <label className="customer-field customer-field-wide">
                  <span>Address</span>
                  <textarea
                    value={customer.address}
                    onChange={(event) => setCustomer({ ...customer, address: event.target.value })}
                    placeholder="House, street, landmark, or pickup note"
                    rows="4"
                    required
                  />
                </label>

                <label className="customer-field customer-field-wide">
                  <span>Order note</span>
                  <textarea
                    value={customer.note}
                    onChange={(event) => setCustomer({ ...customer, note: event.target.value })}
                    placeholder="Less spicy, pickup timing, landmark, or extra notes"
                    rows="3"
                  />
                </label>
              </div>

              {savedAddresses.length ? (
                <section className="customer-inline-panel">
                  <div className="customer-band-head">
                    <div>
                      <p className="customer-overline">Saved addresses</p>
                      <h3>Use a previous address</h3>
                    </div>
                  </div>
                  <div className="customer-chip-grid">
                    {savedAddresses.map((entry) => (
                      <button key={entry.id} type="button" className="customer-data-chip" onClick={() => useSavedAddress(entry)}>
                        <strong>{entry.title}</strong>
                        <span>{entry.address}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <p className="customer-helper">{locationStatus}</p>
            </form>
          </section>
        </div>

        <aside className="customer-split-side">
          <section className="customer-panel">
            <p className="customer-overline">Final total</p>
            <h3>{formatCurrency(totalAmount)}</h3>
            <div className="customer-metric-list">
              <div>
                <span>Item total</span>
                <strong>{formatCurrency(itemTotal)}</strong>
              </div>
              <div>
                <span>Delivery</span>
                <strong>{formatCurrency(payableDeliveryCharge)}</strong>
              </div>
            </div>
          </section>

          <section className="customer-panel">
            <p className="customer-overline">UPI payment</p>
            <h3>Complete payment before placing the order</h3>

            {paymentConfigured ? (
              <>
                {shop.payment?.qrCodeUrl ? (
                  <SafeImage className="customer-payment-qr" src={assetUrl(shop.payment.qrCodeUrl)} alt="Payment QR code" />
                ) : null}

                {shop.payment?.upiId ? (
                  <div className="customer-upi-row">
                    <span>{shop.payment.upiId}</span>
                    <button type="button" onClick={copyUpiId}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}

                {upiLink ? (
                  <a className="customer-pay-link" href={upiLink}>
                    Open UPI app
                  </a>
                ) : null}

                <button
                  className={`customer-payment-flag ${paymentAcknowledged ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setPaymentAcknowledged((current) => !current)}
                >
                  {paymentAcknowledged ? "Payment marked as done" : "I Have Paid"}
                </button>
              </>
            ) : (
              <div className="customer-empty">
                <strong>No UPI details added</strong>
                <p>This shop has not yet configured its UPI account for direct web payments.</p>
              </div>
            )}
          </section>

          <div className="customer-page-actions customer-page-actions-stack">
            <button className="customer-secondary-action" type="button" onClick={() => goToStep("verify")}>
              Back to verification
            </button>
            <button className="customer-primary-action" type="submit" form="customer-payment-form" disabled={submitting}>
              {submitting ? "Placing order..." : "Place order"}
            </button>
          </div>
        </aside>
      </section>
    );
  }

  function renderWaitingPage() {
    if (!currentShopOrder) {
      return (
        <section className="customer-section">
          <div className="customer-empty">
            <strong>No active waiting order</strong>
            <p>Your latest order will appear here once payment is claimed and sent to the shop.</p>
            <button className="customer-primary-action" type="button" onClick={() => goToStep("menu")}>
              Browse menu
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="customer-section customer-waiting-section">
        <div className="customer-waiting-hero">
          <div className="customer-waiting-copy">
            <p className="customer-overline">{currentOrderCopy.eyebrow}</p>
            <h2>{currentOrderCopy.title}</h2>
            <p>{currentOrderCopy.copy}</p>
          </div>
          <div className="customer-waiting-badge">
            <span>Estimated confirmation time</span>
            <strong>{currentOrderCopy.eta}</strong>
          </div>
        </div>

        <div className="customer-waiting-grid">
          <section className="customer-panel">
            <p className="customer-overline">Current order details</p>
            <h3>{currentShopOrder.orderNumber}</h3>
            <div className="customer-metric-list">
              <div>
                <span>Payment status</span>
                <strong>{currentShopOrder.payment?.declaredPaid ? "Payment claimed" : "Order created"}</strong>
              </div>
              <div>
                <span>Total amount</span>
                <strong>{formatCurrency(currentShopOrder.totalAmount)}</strong>
              </div>
              <div>
                <span>Placed at</span>
                <strong>{formatDateTime(currentShopOrder.createdAt)}</strong>
              </div>
              <div>
                <span>Address</span>
                <strong>{currentShopOrder.customerSnapshot?.address || "Not provided"}</strong>
              </div>
            </div>
          </section>

          <section className="customer-panel">
            <p className="customer-overline">Payment verification</p>
            <h3>We are verifying your payment with the shop.</h3>
            <p>Keep this page open or enable notifications so the next state reaches you the moment the owner confirms.</p>
            <button className="customer-primary-action" type="button" onClick={enableOrderUpdates} disabled={enablingOrderUpdates}>
              {enablingOrderUpdates ? "Connecting..." : "Enable live updates"}
            </button>
            {customerNotificationStatus ? <small>{customerNotificationStatus}</small> : null}
          </section>
        </div>

        <div className="customer-page-actions">
          <button className="customer-secondary-action" type="button" onClick={() => goToStep("notifications")}>
            Open notifications
          </button>
          <button className="customer-primary-action" type="button" onClick={() => goToStep("track")}>
            View live timeline
          </button>
        </div>
      </section>
    );
  }

  function renderTrackingPage() {
    if (!currentShopOrder) {
      return renderWaitingPage();
    }

    const steps = trackingSteps(currentShopOrder);
    const currentIndex = activeTrackIndex(currentShopOrder.status);

    return (
      <section className="customer-section">
        <div className="customer-section-head">
          <div>
            <p className="customer-overline">Live order tracking</p>
            <h2>Track your order in real time</h2>
            <p>{orderStateCopy(currentShopOrder).copy}</p>
          </div>
          <div className="customer-section-stats">
            <span>{humanizeStatus(currentShopOrder.status)}</span>
            <span>{formatCurrency(currentShopOrder.totalAmount)}</span>
          </div>
        </div>

        <div className="customer-track-layout">
          <div className="customer-track-main">
            <div className="customer-timeline">
              {steps.map((step, index) => (
                <article
                  className={`customer-timeline-step ${isTrackStepComplete(currentShopOrder.status, step.id) ? "is-complete" : ""} ${
                    index === currentIndex ? "is-current" : ""
                  }`}
                  key={step.id}
                >
                  <div className="customer-timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <section className="customer-inline-panel">
              <div className="customer-band-head">
                <div>
                  <p className="customer-overline">Order details</p>
                  <h3>{currentShopOrder.orderNumber}</h3>
                </div>
              </div>

              <div className="customer-order-lines">
                {currentShopOrder.items?.map((item) => (
                  <div className="customer-order-line" key={`${currentShopOrder.orderId}-${item.productId}`}>
                    <span>
                      {item.quantity} x {item.name}
                    </span>
                    <strong>{formatCurrency(item.price * item.quantity)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="customer-track-side">
            <section className="customer-panel">
              <p className="customer-overline">Status snapshot</p>
              <h3>{humanizeStatus(currentShopOrder.status)}</h3>
              <div className="customer-metric-list">
                <div>
                  <span>Payment</span>
                  <strong>{currentShopOrder.payment?.declaredPaid ? "Verified flow" : "Manual flow"}</strong>
                </div>
                <div>
                  <span>Latest ETA</span>
                  <strong>{orderStateCopy(currentShopOrder).eta}</strong>
                </div>
              </div>
            </section>

            <section className="customer-panel">
              <p className="customer-overline">Quick actions</p>
              <h3>Keep things moving</h3>
              <div className="customer-page-actions customer-page-actions-stack">
                <button className="customer-primary-action" type="button" onClick={enableOrderUpdates} disabled={enablingOrderUpdates}>
                  {enablingOrderUpdates ? "Connecting..." : "Enable live updates"}
                </button>
                <button className="customer-secondary-action" type="button" onClick={() => goToStep("dashboard")}>
                  Open dashboard
                </button>
              </div>
              {customerNotificationStatus ? <small>{customerNotificationStatus}</small> : null}
            </section>
          </aside>
        </div>
      </section>
    );
  }

  function renderDashboardPage() {
    return (
      <section className="customer-section customer-dashboard-section">
        <div className="customer-section-head">
          <div>
            <p className="customer-overline">Customer dashboard</p>
            <h2>Everything important in one place</h2>
            <p>Current order status, history, recent shops, saved shops, and profile shortcuts stay one tap away.</p>
          </div>
          <div className="customer-section-actions">
            <button className="customer-secondary-action" type="button" onClick={() => goToStep("profile")}>
              Profile
            </button>
            <button className="customer-primary-action" type="button" onClick={() => goToStep("menu")}>
              Reorder now
            </button>
          </div>
        </div>

        <div className="customer-dashboard-grid">
          <section className="customer-panel customer-panel-hero">
            <p className="customer-overline">Current order status</p>
            <h3>{dashboardOrder ? dashboardOrder.orderNumber : "No active order"}</h3>
            <p>
              {dashboardOrder
                ? `${dashboardOrder.shopName} | ${humanizeStatus(dashboardOrder.status)} | ${formatCurrency(dashboardOrder.totalAmount)}`
                : "Start a fresh order from the menu and it will appear here instantly."}
            </p>
            {dashboardOrder ? (
              <button className="customer-primary-action" type="button" onClick={() => openOrder(dashboardOrder)}>
                Open live status
              </button>
            ) : null}
          </section>

          <section className="customer-panel">
            <p className="customer-overline">Recent shops</p>
            <h3>Back to familiar places</h3>
            <div className="customer-data-list">
              {recentShops.length ? (
                recentShops.slice(0, 4).map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.slug} onClick={() => openSavedShop(entry)}>
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.address || entry.description || "Quick QR ordering"}</span>
                    </div>
                    <small>{timeAgo(entry.savedAt)}</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No recent shops yet</strong>
                  <p>QR links you open will be saved here for faster repeat visits.</p>
                </div>
              )}
            </div>
          </section>

          <section className="customer-panel">
            <p className="customer-overline">Saved shops</p>
            <h3>Your pinned storefronts</h3>
            <div className="customer-data-list">
              {savedShops.length ? (
                savedShops.slice(0, 4).map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.slug} onClick={() => openSavedShop(entry)}>
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.address || "Saved for repeat ordering"}</span>
                    </div>
                    <small>Saved</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No saved shops yet</strong>
                  <p>Save a shop from the top bar to keep it on your dashboard.</p>
                </div>
              )}
            </div>
          </section>

          <section className="customer-panel customer-panel-wide">
            <p className="customer-overline">Order history</p>
            <h3>Recent orders</h3>
            <div className="customer-data-list">
              {orderHistory.length ? (
                orderHistory.map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.orderId} onClick={() => openOrder(entry)}>
                    <div>
                      <strong>{entry.orderNumber}</strong>
                      <span>
                        {entry.shopName} | {humanizeStatus(entry.status)} | {formatCurrency(entry.totalAmount)}
                      </span>
                    </div>
                    <small>{formatDateTime(entry.createdAt)}</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No orders yet</strong>
                  <p>As soon as you place your first order, it will appear here with full tracking access.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderProfilePage() {
    if (!customerSession?.token) {
      return (
        <section className="customer-section customer-profile-section">
          <div className="customer-profile-gate customer-profile-gate-simple">
            <div className="customer-profile-gate-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M12 12.25a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12.25Z" />
                <path d="M12 14.25c-4.3 0-7.25 2.18-7.25 5.28 0 .68.57 1.22 1.25 1.22h12c.68 0 1.25-.54 1.25-1.22 0-3.1-2.95-5.28-7.25-5.28Z" />
              </svg>
            </div>
            <h2>Login to access your profile</h2>
            <p>Use your number to open your profile.</p>
            <div className="customer-page-actions">
              <button className="customer-primary-action" type="button" onClick={startProfileLogin}>
                Login with number
              </button>
              <button className="customer-secondary-action" type="button" onClick={() => goToStep("menu")}>
                Continue browsing
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="customer-section customer-profile-section">
        <div className="customer-section-head">
          <div>
            <p className="customer-overline">Profile</p>
            <h2>{customerSession?.customer?.name ? `${customerSession.customer.name}'s profile` : "Customer profile"}</h2>
            <p>Keep your details, saved addresses, favorite shops, and repeat-order shortcuts all in one clean space.</p>
          </div>
          {customerSession?.token ? (
            <button className="customer-secondary-action" type="button" onClick={logoutCustomer}>
              Logout
            </button>
          ) : null}
        </div>

        <section className="customer-profile-hero">
          <div className="customer-profile-identity">
            <div className="customer-profile-avatar" aria-hidden="true">
              {(customerSession?.customer?.name || "Q").charAt(0).toUpperCase()}
            </div>
            <div className="customer-profile-copy">
              <span className="customer-profile-kicker">Verified customer</span>
              <h3>{customerSession?.customer?.name || "Guest customer"}</h3>
              <p>{customerSession?.customer?.phone || "Verify at checkout"}</p>
            </div>
          </div>

          <div className="customer-profile-stats">
            <div className="customer-profile-stat">
              <span>Saved addresses</span>
              <strong>{savedAddresses.length}</strong>
            </div>
            <div className="customer-profile-stat">
              <span>Saved shops</span>
              <strong>{savedShops.length}</strong>
            </div>
            <div className="customer-profile-stat">
              <span>Orders</span>
              <strong>{orderHistory.length}</strong>
            </div>
          </div>

          <div className="customer-profile-actions">
            {dashboardOrder ? (
              <button className="customer-primary-action" type="button" onClick={() => openOrder(dashboardOrder)}>
                Open active order
              </button>
            ) : (
              <button className="customer-primary-action" type="button" onClick={() => goToStep("menu")}>
                Browse menu
              </button>
            )}
            <button className="customer-secondary-action" type="button" onClick={() => goToStep("dashboard")}>
              Dashboard
            </button>
          </div>
        </section>

        <div className="customer-profile-grid">
          <section className="customer-panel">
            <p className="customer-overline">Identity</p>
            <h3>Account details</h3>
            <div className="customer-metric-list">
              <div>
                <span>Phone</span>
                <strong>{customerSession?.customer?.phone || "Verify at checkout"}</strong>
              </div>
              <div>
                <span>Saved addresses</span>
                <strong>{savedAddresses.length}</strong>
              </div>
              <div>
                <span>Saved shops</span>
                <strong>{savedShops.length}</strong>
              </div>
            </div>
          </section>

          <section className="customer-panel">
            <p className="customer-overline">Saved addresses</p>
            <h3>Fast checkout helpers</h3>
            <div className="customer-data-list">
              {savedAddresses.length ? (
                savedAddresses.map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.id} onClick={() => useSavedAddress(entry)}>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{entry.address}</span>
                    </div>
                    <small>{entry.phone || "Reuse"}</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No saved addresses yet</strong>
                  <p>Addresses from completed orders will automatically show up here.</p>
                </div>
              )}
            </div>
          </section>

          <section className="customer-panel">
            <p className="customer-overline">Saved shops</p>
            <h3>Quick return list</h3>
            <div className="customer-data-list">
              {savedShops.length ? (
                savedShops.slice(0, 4).map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.slug} onClick={() => openSavedShop(entry)}>
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.address || "Saved for repeat ordering"}</span>
                    </div>
                    <small>Open</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No saved shops yet</strong>
                  <p>Shops you pin will show up here for faster repeat ordering.</p>
                </div>
              )}
            </div>
          </section>

          <section className="customer-panel customer-panel-wide">
            <p className="customer-overline">Recent orders</p>
            <h3>Open an old order anytime</h3>
            <div className="customer-data-list">
              {orderHistory.length ? (
                orderHistory.map((entry) => (
                  <button className="customer-data-row" type="button" key={entry.orderId} onClick={() => openOrder(entry)}>
                    <div>
                      <strong>{entry.orderNumber}</strong>
                      <span>
                        {entry.shopName} | {humanizeStatus(entry.status)} | {formatCurrency(entry.totalAmount)}
                      </span>
                    </div>
                    <small>{timeAgo(entry.createdAt)}</small>
                  </button>
                ))
              ) : (
                <div className="customer-empty customer-empty-inline">
                  <strong>No order history yet</strong>
                  <p>Your profile becomes more useful after the first verified order.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderNotificationsPage() {
    return (
      <section className="customer-section customer-notification-section">
        <div className="customer-section-head">
          <div>
            <p className="customer-overline">Notifications</p>
            <h2>Live status updates and payment alerts</h2>
            <p>Payment confirmed, order preparing, ready, and completed states are all meant to show up here.</p>
          </div>
          <div className="customer-section-actions">
            <button className="customer-secondary-action" type="button" onClick={markAllNotificationsRead}>
              Mark all read
            </button>
          </div>
        </div>

        <div className="customer-notification-band">
          <div>
            <span>Unread</span>
            <strong>{unreadCount}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{notifications.length}</strong>
          </div>
          <div>
            <span>Latest order</span>
            <strong>{dashboardOrder ? dashboardOrder.orderNumber : "None"}</strong>
          </div>
        </div>

        <div className="customer-notification-list">
          {notifications.length ? (
            notifications.map((notice) => (
              <button
                className={`customer-notification-row ${notice.unread ? "is-unread" : ""}`}
                type="button"
                key={notice.id}
                onClick={() => openNotification(notice)}
              >
                <div>
                  <strong>{notice.title}</strong>
                  <p>{notice.message}</p>
                </div>
                <small>{timeAgo(notice.createdAt)}</small>
              </button>
            ))
          ) : (
            <div className="customer-empty">
              <strong>No notifications yet</strong>
              <p>Payment and tracking updates will appear here as you move through the order flow.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderContent() {
    switch (activeStep) {
      case "cart":
        return renderCartPage();
      case "product":
        return renderProductPage();
      case "verify":
        return renderVerifyPage();
      case "payment":
        return renderPaymentPage();
      case "waiting":
        return renderWaitingPage();
      case "track":
        return renderTrackingPage();
      case "dashboard":
        return renderDashboardPage();
      case "profile":
        return renderProfilePage();
      case "notifications":
        return renderNotificationsPage();
      case "menu":
      default:
        return renderMenuPage();
    }
  }

  if (loading) {
    return <LoadingShell />;
  }

  if (error && !shop) {
    return (
      <main className="customer-shell">
        <div className="customer-ambient customer-ambient-left" aria-hidden="true" />
        <div className="customer-ambient customer-ambient-right" aria-hidden="true" />
        <section className="customer-section">
          <div className="customer-empty">
            <strong>Unable to load this shop</strong>
            <p>{error}</p>
            <a className="customer-primary-action" href="/">
              Back to qrMart
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`customer-shell customer-route-${activeStep}`}>
      <div className="customer-ambient customer-ambient-left" aria-hidden="true" />
      <div className="customer-ambient customer-ambient-right" aria-hidden="true" />

      {renderDesktopNav()}
      {renderInstallBanner()}

      {searchOpen ? <button className="customer-search-backdrop" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} /> : null}

      {error ? <div className="customer-inline-error">{error}</div> : null}

      {renderContent()}

      <aside className="customer-mobile-summary" aria-label="Sticky order summary">
        <div>
          <span>
            {cartCount ? `${cartCount} item${cartCount > 1 ? "s" : ""}` : "No items yet"} |{" "}
            {activeStep === "dashboard"
              ? "Customer home"
              : activeStep === "profile"
                ? "Profile"
                : activeStep === "notifications"
                  ? "Alerts"
                  : activeStep === "verify"
                    ? "Login"
                    : "Order flow"}
          </span>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>

        {activeStep === "menu" ? (
          <button type="button" onClick={() => goToStep("cart")} disabled={!cartCount}>
            View cart
          </button>
        ) : null}
        {activeStep === "product" ? (
          cart[activeProductId] ? (
            <button type="button" onClick={() => goToStep("cart")}>
              View cart
            </button>
          ) : (
            <button type="button" onClick={() => activeProduct && changeQuantity(activeProduct._id, 1)} disabled={!activeProduct}>
              Add to cart
            </button>
          )
        ) : null}
        {activeStep === "cart" ? (
          <button type="button" onClick={continueToCheckout} disabled={!cartCount}>
            Checkout
          </button>
        ) : null}
        {activeStep === "verify" ? (
          <button type="submit" form="customer-verify-form" disabled={verifying}>
            {verifying ? "Verifying..." : "Login"}
          </button>
        ) : null}
        {activeStep === "payment" ? (
          <button type="submit" form="customer-payment-form" disabled={submitting || !cartCount}>
            {submitting ? "Placing..." : "Place order"}
          </button>
        ) : null}
        {activeStep === "waiting" ? (
          <button type="button" onClick={() => goToStep("track")}>
            Live timeline
          </button>
        ) : null}
        {activeStep === "track" ? (
          <button type="button" onClick={() => goToStep("dashboard")}>
            Dashboard
          </button>
        ) : null}
        {activeStep === "dashboard" || activeStep === "profile" || activeStep === "notifications" ? (
          <button type="button" onClick={() => goToStep("menu")}>
            Browse menu
          </button>
        ) : null}
      </aside>

      <nav className="customer-mobile-tabs" aria-label="Customer mobile navigation">
        {mobileTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeStep === tab.id ? "is-active" : ""}
            onClick={() => goToStep(tab.id)}
          >
            {tab.icon === "menu" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            ) : null}
            {tab.icon === "cart" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L20 8H7m3 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm9 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            {tab.icon === "user" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 21a8 8 0 0 0-16 0m8-10a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            <span>{tab.label}</span>
            {tab.id === "cart" ? <strong>{cartCount}</strong> : null}
          </button>
        ))}
      </nav>

    </main>
  );
}

export default CustomerShop;
