import React, { useEffect, useRef, useState } from "react";
import "./landing-premium.css";
import { API_BASE_URL, getToken, setToken } from "./api.js";

const GOOGLE_CLIENT_ID = "326409235411-m2v9butg0bib4vhkl3sb8vdqat6hghsu.apps.googleusercontent.com";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const LANDING_SPLASH_KEY = "qrmart_landing_splash_seen";

const landingMetrics = [
  {
    value: "2 min",
    label: "Average checkout target for QR-based repeat ordering"
  },
  {
    value: "0 signup",
    label: "No forced login before menu browsing and cart usage"
  },
  {
    value: "Live",
    label: "Payment confirmation and tracking status after checkout"
  }
];

const customerFlow = [
  {
    step: "01",
    title: "Scan QR and open menu instantly",
    text: "Every shop gets a unique QR that opens a direct web menu without any login wall."
  },
  {
    step: "02",
    title: "Browse, add to cart, and move fast",
    text: "Customers stay in guest mode while exploring categories, images, prices, and their cart."
  },
  {
    step: "03",
    title: "Verify only before payment",
    text: "OTP shows up at the last moment, right before UPI payment and final order creation."
  },
  {
    step: "04",
    title: "Track payment and order status live",
    text: "After payment claim, the experience shifts into waiting, tracking, and repeat-order flows."
  }
];

const platformHighlights = [
  {
    title: "Direct QR storefronts",
    text: "Customers land directly on a premium menu page instead of downloading an app first."
  },
  {
    title: "Checkout-only verification",
    text: "OTP appears only when the customer is serious about paying, keeping browsing friction almost zero."
  },
  {
    title: "Live owner confirmation",
    text: "Payment claimed, accepted, preparing, ready, and completed states keep the experience trustworthy."
  }
];

const heroImage = "/ChatGPT Image Apr 22, 2026, 01_08_41 PM.png";
const logoImage = "/ChatGPT Image Apr 22, 2026, 01_12_14 PM.png";

const fieldIcons = {
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  shop: "M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9M9 19v-5h6v5",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.31 1.85.53 2.81.66A2 2 0 0 1 22 16.92Z",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Z"
};

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function StartField({ icon, label, ...inputProps }) {
  return (
    <label className="landing-premium-field">
      <span>{label}</span>
      <div className="landing-premium-input">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={fieldIcons[icon]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input placeholder={label} aria-label={label} {...inputProps} />
      </div>
    </label>
  );
}

function LandingPage({ startOpen = false }) {
  const dashboardHref = getToken() ? "/dashboard" : "/login";
  const googleButtonRef = useRef(null);
  const formRef = useRef(null);
  const [showStart, setShowStart] = useState(startOpen);
  const [pendingGoogle, setPendingGoogle] = useState(null);
  const [form, setForm] = useState({
    name: "",
    shopName: "",
    phone: "",
    password: "",
    confirmPassword: ""
  });
  const [startError, setStartError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (startOpen || typeof window === "undefined") {
      return false;
    }

    return !window.sessionStorage.getItem(LANDING_SPLASH_KEY);
  });
  const [splashExit, setSplashExit] = useState(false);

  useEffect(() => {
    document.body.classList.add("landing-premium-body");
    return () => document.body.classList.remove("landing-premium-body");
  }, []);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!showSplash) {
      return undefined;
    }

    window.sessionStorage.setItem(LANDING_SPLASH_KEY, "1");

    const fadeTimer = window.setTimeout(() => setSplashExit(true), 900);
    const closeTimer = window.setTimeout(() => setShowSplash(false), 1350);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [showSplash]);

  useEffect(() => {
    if (!showStart || pendingGoogle) {
      return undefined;
    }

    let cancelled = false;

    async function setupGoogleButton() {
      try {
        await loadGoogleScript();

        if (cancelled || !googleButtonRef.current) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse
        });

        googleButtonRef.current.innerHTML = "";
        const buttonWidth = Math.min(360, googleButtonRef.current.clientWidth || 360);
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          type: "standard",
          shape: "pill",
          text: "continue_with",
          width: buttonWidth
        });
      } catch {
        if (!cancelled) {
          setStartError("Google sign-in could not load. Check your internet connection and OAuth settings.");
        }
      }
    }

    setupGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [showStart, pendingGoogle]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function openStart() {
    setStartError("");
    setShowStart(true);
  }

  function closeStart() {
    setShowStart(false);
    setPendingGoogle(null);
    setStartError("");
  }

  async function handleGoogleResponse(response) {
    const currentForm = formRef.current || form;
    setStartError("");
    setGoogleLoading(true);

    try {
      const apiResponse = await fetch(`${API_BASE_URL}/api/v1/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          credential: response.credential,
          name: currentForm.name,
          phone: currentForm.phone,
          shopName: currentForm.shopName,
          password: currentForm.password
        })
      });
      const result = await apiResponse.json();

      if (!apiResponse.ok) {
        throw new Error(result.message || "Unable to continue with Google");
      }

      if (result.data.needsProfile) {
        setPendingGoogle({
          credential: response.credential,
          profile: result.data.profile
        });
        setForm((current) => ({
          ...current,
          name: result.data.profile?.name || current.name
        }));
        return;
      }

      setToken(result.data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setStartError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function finishRegistration(event) {
    event.preventDefault();
    setStartError("");

    if (!form.name.trim() || !form.shopName.trim() || !form.phone.trim() || !form.password) {
      setStartError("Fill all details to finish registration");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setStartError("Password and confirm password do not match");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          credential: pendingGoogle.credential,
          name: form.name,
          phone: form.phone,
          shopName: form.shopName,
          password: form.password
        })
      });
      const result = await response.json();

      if (!response.ok || result.data?.needsProfile) {
        throw new Error(result.message || "Unable to finish registration");
      }

      setToken(result.data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setStartError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-premium-shell">
      {showSplash ? (
        <section className={`landing-premium-splash ${splashExit ? "is-exit" : ""}`} aria-label="qrMart splash screen">
          <div className="landing-premium-splash-mark">
            <img src={logoImage} alt="qrMart" />
          </div>
          <div>
            <p>qrMart</p>
            <h1>QR ordering that feels instant</h1>
            <span>Loading the premium web-first ordering experience.</span>
          </div>
        </section>
      ) : null}

      <div className="landing-premium-ambient landing-premium-ambient-left" aria-hidden="true" />
      <div className="landing-premium-ambient landing-premium-ambient-right" aria-hidden="true" />

      <nav className="landing-premium-nav">
        <a className="landing-premium-brand" href="/" aria-label="qrMart home">
          <img src={logoImage} alt="qrMart" />
        </a>

        <div className="landing-premium-nav-links">
          <a href="#flow">Flow</a>
          <a href="#experience">Experience</a>
          <a href="#launch">Launch</a>
        </div>

        <div className="landing-premium-nav-actions">
          <a className="landing-premium-nav-link" href="/login">
            Login
          </a>
          <button className="landing-premium-primary" type="button" onClick={openStart}>
            Start now
          </button>
        </div>
      </nav>

      <section className="landing-premium-hero">
        <div className="landing-premium-hero-copy">
          <div className="landing-premium-chip-row">
            <span>QR-first ordering</span>
            <span>Checkout-only verification</span>
            <span>Live order tracking</span>
          </div>

          <p className="landing-premium-overline">Modern web ordering for local shops</p>
          <h1>Fast menu browsing, low-friction checkout, and premium order tracking.</h1>
          <p className="landing-premium-hero-text">
            qrMart is built for the exact QR scan moment. Customers open a menu instantly, stay in guest mode while
            browsing, verify only before payment, and move into a smooth waiting and tracking experience after checkout.
          </p>

          <div className="landing-premium-hero-actions">
            <button className="landing-premium-primary" type="button" onClick={openStart}>
              Launch your QR shop
            </button>
            <a className="landing-premium-secondary" href={dashboardHref}>
              Open dashboard
            </a>
          </div>

          <div className="landing-premium-metrics">
            {landingMetrics.map((metric) => (
              <div className="landing-premium-metric" key={metric.value}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-premium-hero-visual">
          <div className="landing-premium-device">
            <div className="landing-premium-device-top">
              <span>qrMart / Shop menu</span>
              <strong>Scan. Browse. Pay. Track.</strong>
            </div>
            <div className="landing-premium-device-image">
              <img src={heroImage} alt="qrMart menu preview" />
            </div>
            <div className="landing-premium-device-bottom">
              <div>
                <span>Menu opens instantly</span>
                <strong>No forced login</strong>
              </div>
              <div>
                <span>Payment flow</span>
                <strong>OTP only before checkout</strong>
              </div>
            </div>
          </div>
          <div className="landing-premium-floating-note">
            <span>Install banner</span>
            <strong>Subtle prompt for repeat ordering</strong>
          </div>
        </div>
      </section>

      <section className="landing-premium-strip" aria-label="Platform highlights">
        {platformHighlights.map((highlight) => (
          <article key={highlight.title}>
            <strong>{highlight.title}</strong>
            <span>{highlight.text}</span>
          </article>
        ))}
      </section>

      <section className="landing-premium-story" id="flow">
        <div className="landing-premium-story-copy">
          <p className="landing-premium-overline">Ordering flow</p>
          <h2>A multi-page customer journey designed to stay under two minutes.</h2>
          <p>
            From QR scan to live order tracking, every screen is designed to feel fast, premium, and production-ready
            on mobile-first devices.
          </p>
        </div>

        <div className="landing-premium-flow-grid">
          {customerFlow.map((item) => (
            <article className="landing-premium-flow-card" key={item.step}>
              <span>{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-premium-showcase" id="experience">
        <div className="landing-premium-showcase-band landing-premium-showcase-band-primary">
          <div>
            <p className="landing-premium-overline">Customer pages</p>
            <h2>Menu, cart, OTP, payment, waiting, tracking, dashboard, profile, and notifications.</h2>
            <p>
              The interface keeps desktop clean with a premium top navbar and gives mobile users bottom navigation,
              sticky cart summaries, and fast thumb-friendly actions.
            </p>
          </div>
          <div className="landing-premium-page-list">
            <span>Splash reveal</span>
            <span>Welcome page</span>
            <span>QR menu page</span>
            <span>Cart and OTP flow</span>
            <span>Payment and waiting screens</span>
            <span>Live tracking and customer dashboard</span>
          </div>
        </div>

        <div className="landing-premium-showcase-grid">
          <article className="landing-premium-showcase-card">
            <p className="landing-premium-overline">UX rule</p>
            <h3>Never force login before checkout</h3>
            <p>Customers browse the full menu and use the cart first. Verification happens only when money is involved.</p>
          </article>

          <article className="landing-premium-showcase-card">
            <p className="landing-premium-overline">Install app banner</p>
            <h3>Subtle but useful</h3>
            <p>Encourage repeat ordering without hijacking the current web session or blocking the menu.</p>
          </article>

          <article className="landing-premium-showcase-card">
            <p className="landing-premium-overline">Status visibility</p>
            <h3>Payment to completion</h3>
            <p>Payment claimed, accepted, preparing, ready, and completed states all map into dedicated customer pages.</p>
          </article>
        </div>
      </section>

      <section className="landing-premium-cta" id="launch">
        <div>
          <p className="landing-premium-overline">Ready to launch</p>
          <h2>Turn your menu into a premium QR ordering flow.</h2>
          <p>Give customers a polished web experience while keeping the shop side simple and operationally clear.</p>
        </div>
        <div className="landing-premium-cta-actions">
          <button className="landing-premium-primary" type="button" onClick={openStart}>
            Start your QR shop
          </button>
          <a className="landing-premium-secondary" href={dashboardHref}>
            Open owner dashboard
          </a>
        </div>
      </section>

      {showStart ? (
        <div className="landing-premium-modal" role="dialog" aria-modal="true" aria-label="Start qrMart shop">
          <div className="landing-premium-modal-backdrop" onClick={closeStart} />
          <section className="landing-premium-modal-panel">
            <button className="landing-premium-close" type="button" aria-label="Close" onClick={closeStart}>
              x
            </button>
            <div className="landing-premium-modal-header">
              <img src={logoImage} alt="qrMart" />
              <div>
                <p className="landing-premium-overline">{pendingGoogle ? "Google verified" : "Start from home"}</p>
                <h2>{pendingGoogle ? "Complete your shop details" : "Continue with Google"}</h2>
                <p>
                  {pendingGoogle
                    ? "Set your owner profile and finish the shop setup in one fast flow."
                    : "Use your Google account to verify ownership and start building your QR storefront."}
                </p>
              </div>
            </div>

            {startError ? <div className="landing-premium-inline-error">{startError}</div> : null}

            {pendingGoogle ? (
              <form className="landing-premium-form" onSubmit={finishRegistration}>
                <StartField icon="user" label="Full Name" value={form.name} onChange={(event) => update("name", event.target.value)} required />
                <StartField icon="shop" label="Shop Name" value={form.shopName} onChange={(event) => update("shopName", event.target.value)} required />
                <StartField icon="phone" label="Phone Number" value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" required />
                <StartField icon="lock" label="Password" value={form.password} onChange={(event) => update("password", event.target.value)} type="password" minLength="6" required />
                <StartField icon="lock" label="Confirm Password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} type="password" minLength="6" required />
                <button className="landing-premium-primary landing-premium-primary-block" type="submit" disabled={loading}>
                  {loading ? "Please wait..." : "Finish registration"}
                </button>
                <button className="landing-premium-text-link" type="button" onClick={() => setPendingGoogle(null)}>
                  Use a different Google account
                </button>
              </form>
            ) : (
              <>
                <div className={googleLoading ? "landing-premium-google is-loading" : "landing-premium-google"} ref={googleButtonRef} />
                <p className="landing-premium-auth-note">
                  Already have an account? <a href="/login">Login</a>
                </p>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default LandingPage;
