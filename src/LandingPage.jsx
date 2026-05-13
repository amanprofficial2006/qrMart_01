import React, { useEffect, useState } from "react";
import "./landing-premium.css";
import { API_BASE_URL } from "./api.js";

const CUSTOMER_SESSION_KEY = "qrmart_customer_session";
const SAVED_SHOPS_KEY = "qrmart_saved_shops";
const SAVED_ADDRESSES_KEY = "qrmart_saved_addresses";
const ORDER_HISTORY_KEY = "qrmart_customer_order_history";
const STATIC_CUSTOMER_OTP = "142006";
const logoImage = "/favicon.png";

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

function readCustomerSession() {
  const session = readJson(CUSTOMER_SESSION_KEY, null);
  return session && session.token && session.customer ? session : null;
}

function LandingPage({ startOpen = false }) {
  const [customerSession, setCustomerSession] = useState(readCustomerSession);
  const [savedShops] = useState(() => readJson(SAVED_SHOPS_KEY, []));
  const [recentShops, setRecentShops] = useState([]);
  const [orderHistory] = useState(() => readJson(ORDER_HISTORY_KEY, []));
  const [mode, setMode] = useState(startOpen ? "register" : "login");
  const [customerView, setCustomerView] = useState("home");
  const [profileName, setProfileName] = useState(() => readCustomerSession()?.customer?.name || "");
  const [addressForm, setAddressForm] = useState({
    title: "Home",
    address: ""
  });
  const [localSavedAddresses, setLocalSavedAddresses] = useState(() => readJson(SAVED_ADDRESSES_KEY, []));
  const [form, setForm] = useState({
    name: "",
    phone: "",
    otp: ""
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.add("landing-premium-body");
    return () => document.body.classList.remove("landing-premium-body");
  }, []);

  useEffect(() => {
    if (!customerSession?.token) {
      setRecentShops([]);
      return;
    }

    let cancelled = false;

    async function loadRecentShops() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/recent-shops`, {
          headers: {
            Authorization: `Bearer ${customerSession.token}`
          }
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Unable to load recent shops.");
        }

        if (!cancelled) {
          setRecentShops(result.data || []);
        }
      } catch (_error) {
        if (!cancelled) {
          setRecentShops([]);
        }
      }
    }

    loadRecentShops();

    return () => {
      cancelled = true;
    };
  }, [customerSession?.token]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  const shopMap = new Map();
  [...savedShops, ...recentShops].forEach((entry) => {
    if (entry?.slug) {
      shopMap.set(entry.slug, entry);
    }
  });
  const allShops = Array.from(shopMap.values());
  const activeOrder = orderHistory[0] || null;

  function openShop(entry) {
    if (!entry?.basePath) {
      return;
    }

    window.location.href = entry.basePath;
  }

  function openSavedShop() {
    const firstShop = allShops[0];

    if (!firstShop?.basePath) {
      setMessage("Open any shop QR first. Saved shops will appear here after you save them.");
      return;
    }

    window.location.href = firstShop.basePath;
  }

  function openCustomerHome() {
    setCustomerView("home");
    setMessage("");
    setError("");
  }

  function openCustomerProfile() {
    if (!customerSession) {
      setMode("login");
      setMessage("");
      setError("");
      return;
    }

    setCustomerView("profile");
    setMessage("");
  }

  function logoutCustomer() {
    window.localStorage.removeItem(CUSTOMER_SESSION_KEY);
    setCustomerSession(null);
    setCustomerView("home");
    setMessage("Logged out.");
  }

  function addAddress(event) {
    event.preventDefault();
    const cleanAddress = addressForm.address.trim();
    const cleanTitle = addressForm.title.trim() || "Address";

    if (!cleanAddress) {
      setError("Address is required.");
      return;
    }

    const nextAddress = {
      id: `${cleanAddress.toLowerCase()}-${customerSession?.customer?.phone || Date.now()}`,
      title: cleanTitle,
      address: cleanAddress,
      phone: customerSession?.customer?.phone || "",
      updatedAt: new Date().toISOString()
    };
    const nextAddresses = [nextAddress, ...localSavedAddresses.filter((entry) => entry.id !== nextAddress.id)].slice(0, 8);

    writeJson(SAVED_ADDRESSES_KEY, nextAddresses);
    setLocalSavedAddresses(nextAddresses);
    setAddressForm({
      title: "Home",
      address: ""
    });
    setError("");
    setMessage("Address saved.");
  }

  function removeAddress(entry) {
    const nextAddresses = localSavedAddresses.filter((item) => item.id !== entry.id);
    writeJson(SAVED_ADDRESSES_KEY, nextAddresses);
    setLocalSavedAddresses(nextAddresses);
    setMessage("Address removed.");
  }

  async function saveCustomerProfile(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!customerSession?.token) {
      setMode("login");
      return;
    }

    if (!profileName.trim()) {
      setError("Name is required.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSession.token}`
        },
        body: JSON.stringify({
          name: profileName,
          address: customerSession.customer?.address || ""
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to save profile.");
      }

      const nextSession = {
        ...customerSession,
        customer: {
          ...customerSession.customer,
          ...result.data.customer
        }
      };
      writeJson(CUSTOMER_SESSION_KEY, nextSession);
      setCustomerSession(nextSession);
      setProfileName(nextSession.customer?.name || "");
      setMessage("Profile saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCustomer(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (mode === "register" && !form.name.trim()) {
      setError("Name is required.");
      return;
    }

    if (form.phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number.");
      return;
    }

    if (!form.otp.trim()) {
      setError("Enter OTP.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: mode === "register" ? form.name : "",
          phone: form.phone,
          otp: form.otp.trim()
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to continue.");
      }

      writeJson(CUSTOMER_SESSION_KEY, result.data);
      setCustomerSession(result.data);
      setProfileName(result.data.customer?.name || "");
      setCustomerView("home");
      setForm({
        name: result.data.customer?.name || "",
        phone: result.data.customer?.phone || "",
        otp: ""
      });
      setMessage("Customer account ready. Scan a shop QR or open your saved shop.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-premium-shell">
      <header className="landing-customer-topbar">
        <a className="landing-customer-brand" href="/" aria-label="qrMart customer home">
          <img src={logoImage} alt="" />
          <strong>qrMart</strong>
        </a>
        <div className="landing-customer-header-note">Scan a shop QR to start ordering</div>
        <div className="landing-customer-top-actions">
          {customerSession ? (
            <button type="button" onClick={() => setMessage("Order alerts appear after you place an order from a shop.")} aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 9.8c0-3.3-2.1-5.8-6-5.8s-6 2.5-6 5.8v2.9c0 .8-.3 1.5-.9 2.1L4 15.9h16l-1.1-1.1c-.6-.6-.9-1.3-.9-2.1V9.8ZM9.7 19a2.4 2.4 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            null
          )}
        </div>
      </header>

      <section className="landing-welcome-card">
        {customerSession ? (
          customerView === "profileEdit" ? (
          <div className="landing-profile-page">
            <div className="landing-profile-head">
              <div>
                <p className="landing-premium-overline">Profile</p>
                <h1>Edit profile</h1>
              </div>
              <button className="landing-premium-secondary" type="button" onClick={() => setCustomerView("profile")}>
                Back
              </button>
            </div>
            <section className="landing-welcome-panel">
              <form className="landing-customer-form" onSubmit={saveCustomerProfile}>
                <label className="landing-premium-field">
                  <span>Name</span>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Your name" />
                </label>
                <div className="landing-otp-note">
                  <span>Phone</span>
                  <strong>{customerSession.customer?.phone}</strong>
                </div>
                <button className="landing-premium-primary landing-premium-primary-block" type="submit" disabled={busy}>
                  {busy ? "Saving..." : "Save profile"}
                </button>
              </form>
              {error ? <div className="landing-inline-error">{error}</div> : null}
              {message ? <div className="landing-inline-message">{message}</div> : null}
            </section>
          </div>
          ) : customerView === "addresses" ? (
          <div className="landing-profile-page">
            <div className="landing-profile-head">
              <div>
                <p className="landing-premium-overline">Addresses</p>
                <h1>Order addresses</h1>
              </div>
              <button className="landing-premium-secondary" type="button" onClick={() => setCustomerView("profile")}>
                Back
              </button>
            </div>
            <section className="landing-welcome-panel">
              <form className="landing-customer-form" onSubmit={addAddress}>
                <label className="landing-premium-field">
                  <span>Label</span>
                  <input value={addressForm.title} onChange={(event) => setAddressForm({ ...addressForm, title: event.target.value })} placeholder="Home, Work, Pickup" />
                </label>
                <label className="landing-premium-field">
                  <span>Address</span>
                  <input value={addressForm.address} onChange={(event) => setAddressForm({ ...addressForm, address: event.target.value })} placeholder="House, street, landmark" />
                </label>
                <button className="landing-premium-primary landing-premium-primary-block" type="submit">
                  Add address
                </button>
              </form>
            </section>
            <section className="landing-welcome-panel">
              <div className="landing-shop-list">
                {localSavedAddresses.length ? (
                  localSavedAddresses.map((entry) => (
                    <div className="landing-shop-row landing-address-row" key={entry.id}>
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.address}</small>
                      </span>
                      <button type="button" onClick={() => removeAddress(entry)}>Delete</button>
                    </div>
                  ))
                ) : (
                  <div className="landing-empty-line">No saved addresses yet.</div>
                )}
              </div>
              {error ? <div className="landing-inline-error">{error}</div> : null}
              {message ? <div className="landing-inline-message">{message}</div> : null}
            </section>
          </div>
          ) : customerView === "shops" ? (
          <div className="landing-profile-page">
            <div className="landing-profile-head">
              <div>
                <p className="landing-premium-overline">Saved shops</p>
                <h1>Saved shops</h1>
              </div>
              <button className="landing-premium-secondary" type="button" onClick={() => setCustomerView("profile")}>
                Back
              </button>
            </div>
            <section className="landing-welcome-panel">
              <div className="landing-shop-list">
                {savedShops.length ? (
                  savedShops.map((entry) => (
                    <button className="landing-shop-row" type="button" key={entry.slug} onClick={() => openShop(entry)}>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{entry.address || "Saved for repeat ordering"}</small>
                      </span>
                      <b>Open</b>
                    </button>
                  ))
                ) : (
                  <div className="landing-empty-line">No saved shops yet.</div>
                )}
              </div>
            </section>
          </div>
          ) : customerView === "orders" ? (
          <div className="landing-profile-page">
            <div className="landing-profile-head">
              <div>
                <p className="landing-premium-overline">Recent orders</p>
                <h1>Recent orders</h1>
              </div>
              <button className="landing-premium-secondary" type="button" onClick={() => setCustomerView("profile")}>
                Back
              </button>
            </div>
            <section className="landing-welcome-panel">
              <div className="landing-shop-list">
                {orderHistory.length ? (
                  orderHistory.map((entry) => (
                    <button className="landing-shop-row" type="button" key={entry.orderId} onClick={() => {
                      window.location.href = `${entry.basePath}/${entry.status === "payment_claimed" || entry.status === "placed" ? "waiting" : "track"}`;
                    }}>
                      <span>
                        <strong>{entry.orderNumber}</strong>
                        <small>{entry.shopName} | {entry.status}</small>
                      </span>
                      <b>Open</b>
                    </button>
                  ))
                ) : (
                  <div className="landing-empty-line">No recent orders yet.</div>
                )}
              </div>
            </section>
          </div>
          ) :
          customerView === "profile" ? (
          <div className="landing-profile-page">
            <div className="landing-profile-head">
              <div>
                <p className="landing-premium-overline">Profile</p>
                <h1>{customerSession.customer?.name || "Customer"}'s profile</h1>
              </div>
            </div>

            <section className="landing-profile-hero">
              <div className="landing-profile-identity">
                <div className="landing-profile-avatar">
                  {(customerSession.customer?.name || "Q").charAt(0).toUpperCase()}
                </div>
                <div>
                  <span>Verified customer</span>
                  <strong>{customerSession.customer?.name || "Customer"}</strong>
                  <small>{customerSession.customer?.phone}</small>
                </div>
              </div>
              <div className="landing-profile-stats">
                <div>
                  <span>Saved addresses</span>
                  <strong>{localSavedAddresses.length}</strong>
                </div>
                <div>
                  <span>Saved shops</span>
                  <strong>{savedShops.length}</strong>
                </div>
                <div>
                  <span>Orders</span>
                  <strong>{orderHistory.length}</strong>
                </div>
              </div>
            </section>

            <section className="landing-profile-menu">
              <button type="button" onClick={() => setCustomerView("profileEdit")}>
                <span>
                  <strong>Profile</strong>
                  <small>Image, name, and phone details</small>
                </span>
                <b>{customerSession.customer?.name || "Customer"}</b>
              </button>
              <button type="button" onClick={() => setCustomerView("addresses")}>
                <span>
                  <strong>Addresses</strong>
                  <small>Manage order delivery addresses</small>
                </span>
                <b>{localSavedAddresses.length}</b>
              </button>
              <button type="button" onClick={() => setCustomerView("shops")}>
                <span>
                  <strong>Saved shops</strong>
                  <small>Open shops saved for repeat ordering</small>
                </span>
                <b>{savedShops.length}</b>
              </button>
              <button type="button" onClick={() => setCustomerView("orders")}>
                <span>
                  <strong>Recent orders</strong>
                  <small>Track and reopen previous orders</small>
                </span>
                <b>{orderHistory.length}</b>
              </button>
            </section>

            <div className="landing-profile-bottom-actions">
              <button className="landing-premium-secondary landing-logout-action" type="button" onClick={logoutCustomer}>
                Logout
              </button>
            </div>

            {message ? <div className="landing-inline-message">{message}</div> : null}
          </div>
          ) : (
          <div className="landing-customer-home">
            <section className="landing-welcome-panel landing-customer-panel">
              <p className="landing-premium-overline">Customer home</p>
              <h1>Hi, {customerSession.customer?.name || "Customer"}</h1>
              <p>Open a saved shop, revisit a recent shop, or scan a new shop QR to start ordering.</p>

              <div className="landing-scan-box">
                <button className="landing-premium-primary landing-premium-primary-block" type="button" onClick={() => setMessage("Scan the QR code shown at the shop to open its menu.")}>
                  Scan QR for new shop
                </button>
              </div>

              {message ? <div className="landing-inline-message">{message}</div> : null}
            </section>

            <section className="landing-welcome-panel">
              <div className="landing-section-title">
                <p className="landing-premium-overline">Saved shops</p>
                <strong>{savedShops.length}</strong>
              </div>
              <div className="landing-shop-list">
                {savedShops.length ? (
                  savedShops.map((entry) => (
                    <button className="landing-shop-row" type="button" key={entry.slug} onClick={() => openShop(entry)}>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{entry.address || "Saved for repeat ordering"}</small>
                      </span>
                      <b>Open</b>
                    </button>
                  ))
                ) : (
                  <div className="landing-empty-line">No saved shops yet.</div>
                )}
              </div>
            </section>

            <section className="landing-welcome-panel">
              <div className="landing-section-title">
                <p className="landing-premium-overline">Recent shops</p>
                <strong>{recentShops.length}</strong>
              </div>
              <div className="landing-shop-list">
                {recentShops.length ? (
                  recentShops.slice(0, 6).map((entry) => (
                    <button className="landing-shop-row" type="button" key={entry.slug} onClick={() => openShop(entry)}>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{entry.address || entry.description || "Recently opened"}</small>
                      </span>
                      <b>Open</b>
                    </button>
                  ))
                ) : (
                  <div className="landing-empty-line">Recent shops will appear after you scan a QR.</div>
                )}
              </div>
            </section>
          </div>
          )
        ) : (
          <div className="landing-welcome-grid landing-customer-only-grid">
          <section className="landing-welcome-panel landing-customer-panel">
            <p className="landing-premium-overline">Customer</p>
            <h1>Login or register</h1>
            <p>Use your mobile number to keep profile, saved shops, addresses, and order history ready.</p>

              <form className="landing-customer-form" onSubmit={submitCustomer}>
                <div className="landing-auth-tabs" role="tablist" aria-label="Customer auth mode">
                  <button className={mode === "login" ? "is-active" : ""} type="button" onClick={() => setMode("login")}>
                    Login
                  </button>
                  <button className={mode === "register" ? "is-active" : ""} type="button" onClick={() => setMode("register")}>
                    Register
                  </button>
                </div>

                {mode === "register" ? (
                  <label className="landing-premium-field">
                    <span>Name</span>
                    <input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Your name" />
                  </label>
                ) : null}

                <label className="landing-premium-field">
                  <span>Phone number</span>
                  <input value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="10 digit mobile number" inputMode="tel" />
                </label>

                <label className="landing-premium-field">
                  <span>OTP</span>
                  <input value={form.otp} onChange={(event) => update("otp", event.target.value)} placeholder="Enter OTP" inputMode="numeric" />
                </label>

                <div className="landing-otp-note">
                  <span>Test OTP</span>
                  <strong>{STATIC_CUSTOMER_OTP}</strong>
                </div>

                <button className="landing-premium-primary landing-premium-primary-block" type="submit" disabled={busy}>
                  {busy ? "Please wait..." : mode === "register" ? "Register" : "Login"}
                </button>
              </form>

            {error ? <div className="landing-inline-error">{error}</div> : null}
            {message ? <div className="landing-inline-message">{message}</div> : null}
          </section>

          <section className="landing-welcome-panel landing-customer-help">
            <p className="landing-premium-overline">How it works</p>
            <h2>Scan, order, track</h2>
            <div className="landing-help-list">
              <div>
                <strong>1</strong>
                <span>Scan a shop QR to open its menu.</span>
              </div>
              <div>
                <strong>2</strong>
                <span>Login once with phone OTP before checkout.</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Save shops and addresses for faster repeat orders.</span>
              </div>
            </div>
          </section>
        </div>
        )}
      </section>

      <nav className="landing-mobile-tabs" aria-label="Customer mobile navigation">
        <button type="button" onClick={openSavedShop}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9M9 19v-5h6v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Shop</span>
        </button>
        <button type="button" className={customerView === "home" ? "is-active" : ""} onClick={openCustomerHome}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Home</span>
        </button>
        <button type="button" className={customerView !== "home" || !customerSession ? "is-active" : ""} onClick={openCustomerProfile}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 21a8 8 0 0 0-16 0m8-10a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Profile</span>
        </button>
      </nav>

    </main>
  );
}

export default LandingPage;
