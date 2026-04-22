import React, { useEffect, useRef, useState } from "react";
import { API_BASE_URL, getToken, setToken } from "./api.js";

const GOOGLE_CLIENT_ID = "326409235411-m2v9butg0bib4vhkl3sb8vdqat6hghsu.apps.googleusercontent.com";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

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

const features = [
  {
    icon: "qr",
    title: "Orders come in clearly",
    text: "Customers choose items from your QR menu, so your team sees the exact order without repeating it at the counter."
  },
  {
    icon: "bell",
    title: "Never miss a customer",
    text: "New orders show up instantly with customer details, payment status, and one-tap status updates."
  },
  {
    icon: "shop",
    title: "Update your menu anytime",
    text: "Change prices, hide sold-out items, and add new products from the owner dashboard whenever your shop changes."
  },
  {
    icon: "spark",
    title: "Built for busy shop owners",
    text: "Simple screens for orders, products, shop details, and QR code sharing keep the whole setup easy to manage."
  }
];

const ownerBenefits = [
  {
    stat: "0 apps",
    label: "Customers scan and order from their browser"
  },
  {
    stat: "Live",
    label: "Orders arrive on your owner dashboard"
  },
  {
    stat: "2 min",
    label: "Create a shop page and start sharing your QR"
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

function StartField({ icon, label, ...inputProps }) {
  return (
    <label className="start-field">
      <span>{label}</span>
      <span className="start-input">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={fieldIcons[icon]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input placeholder={label} aria-label={label} {...inputProps} />
      </span>
    </label>
  );
}

function FeatureIcon({ type }) {
  const commonProps = {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true"
  };

  if (type === "qr") {
    return (
      <svg {...commonProps}>
        <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Z" stroke="currentColor" strokeWidth="2" />
        <path d="M14 14h2v2h-2v-2Zm4 0h2v6h-2v-6Zm-4 4h2v2h-2v-2Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === "bell") {
    return (
      <svg {...commonProps}>
        <path
          d="M18 10a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "shop") {
    return (
      <svg {...commonProps}>
        <path
          d="M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 19v-5h6v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path
        d="M12 3 9.7 9.7 3 12l6.7 2.3L12 21l2.3-6.7L21 12l-6.7-2.3L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
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
  const heroStyle = {
    backgroundImage: [
      "linear-gradient(90deg, rgba(255, 250, 244, 0.96) 0%, rgba(255, 250, 244, 0.88) 34%, rgba(255, 250, 244, 0.16) 62%)",
      `url("${heroImage}")`
    ].join(", ")
  };

  useEffect(() => {
    formRef.current = form;
  }, [form]);

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
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "rectangular",
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
    <main className="landing-page">
      <nav className="landing-nav">
        <a className="landing-brand" href="/" aria-label="qrMart home">
          <img src={logoImage} alt="qrMart" />
        </a>
        <div className="landing-nav-actions">
          <a className="nav-link" href="/login">
            Login
          </a>
          <button className="nav-button" type="button" onClick={openStart}>
            Start
          </button>
        </div>
      </nav>

      <section className="landing-hero" style={heroStyle}>
        <div className="landing-hero-copy">
          <p className="eyebrow">QR ordering for local shops</p>
          <h1>Run orders faster from one simple shop dashboard</h1>
          <p className="landing-description">
            Put your menu behind one QR code. Customers scan, place orders from their phone, and your team gets a
            clear live queue with prices, customer details, and order actions.
          </p>
          <div className="landing-actions">
            <button className="primary-cta" type="button" onClick={openStart}>
              Start your QR shop
            </button>
            <a className="secondary-cta" href={dashboardHref}>
              Open dashboard
            </a>
          </div>
          <div className="owner-proof" aria-label="Shop owner benefits">
            {ownerBenefits.map((benefit) => (
              <div className="proof-pill" key={benefit.stat}>
                <strong>{benefit.stat}</strong>
                <span>{benefit.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="owner-utility-strip" aria-label="Why shop owners use qrMart">
        <div>
          <strong>Less counter rush</strong>
          <span>Customers order while they wait.</span>
        </div>
        <div>
          <strong>Cleaner order flow</strong>
          <span>Every item, amount, and customer note stays in one place.</span>
        </div>
        <div>
          <strong>Easy QR sharing</strong>
          <span>Print it, paste it, or send your shop link on WhatsApp.</span>
        </div>
      </section>

      <section className="landing-features" aria-label="Features">
        {features.map((feature) => (
          <article className="landing-feature-card" key={feature.title}>
            <div className="feature-icon">
              <FeatureIcon type={feature.icon} />
            </div>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-cta">
        <p className="eyebrow">Ready for your first QR order?</p>
        <h2>Create a useful ordering system for your shop today</h2>
        <button className="primary-cta" type="button" onClick={openStart}>
          Continue from home
        </button>
      </section>

      {showStart ? (
        <div className="start-modal" role="dialog" aria-modal="true" aria-label="Start qrMart shop">
          <div className="start-modal-backdrop" onClick={closeStart} />
          <section className={pendingGoogle ? "start-panel start-panel-details" : "start-panel"}>
            <button className="start-close" type="button" aria-label="Close" onClick={closeStart}>
              x
            </button>
            <span className="start-logo" aria-hidden="true">
              <img src={logoImage} alt="" />
            </span>
            <p className="eyebrow">{pendingGoogle ? "Google verified" : "Start from home"}</p>
            <h2>{pendingGoogle ? "Complete your shop details" : "Continue with Google"}</h2>
            <p className="muted">
              {pendingGoogle
                ? "Set your shop details and password. Later you can login with Google or email and password."
                : "Use your Google account to verify ownership and start setting up your shop."}
            </p>

            {startError ? <div className="inline-error">{startError}</div> : null}

            {pendingGoogle ? (
              <form className="start-form" onSubmit={finishRegistration}>
                <StartField icon="user" label="Full Name" value={form.name} onChange={(event) => update("name", event.target.value)} required />
                <StartField icon="shop" label="Shop Name" value={form.shopName} onChange={(event) => update("shopName", event.target.value)} required />
                <StartField icon="phone" label="Phone Number" value={form.phone} onChange={(event) => update("phone", event.target.value)} inputMode="tel" required />
                <StartField icon="lock" label="Password" value={form.password} onChange={(event) => update("password", event.target.value)} type="password" minLength="6" required />
                <StartField icon="lock" label="Confirm Password" value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} type="password" minLength="6" required />
                <button className="submit-button" type="submit" disabled={loading}>
                  {loading ? "Please wait..." : "Finish registration"}
                </button>
                <button className="auth-reset-google" type="button" onClick={() => setPendingGoogle(null)}>
                  Use a different Google account
                </button>
              </form>
            ) : (
              <>
                <div className={googleLoading ? "auth-google is-loading" : "auth-google"} ref={googleButtonRef} />
                <p className="auth-switch">
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
