import React, { useEffect, useRef, useState } from "react";
import { API_BASE_URL, setToken } from "./api.js";

const authImage = "/ChatGPT Image Apr 22, 2026, 01_40_17 PM.png";
const logoImage = "/ChatGPT Image Apr 22, 2026, 01_12_14 PM.png";
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

const iconPaths = {
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  shop: "M4 10h16l-2-5H6l-2 5Zm2 0v9h12v-9M9 19v-5h6v5",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.31 1.85.53 2.81.66A2 2 0 0 1 22 16.92Z",
  mail: "M4 4h16v16H4V4Zm0 3 8 6 8-6",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11Z"
};

function FieldIcon({ type }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={iconPaths[type]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AuthField({ icon, label, ...inputProps }) {
  return (
    <label className="auth-input-label">
      <span className="auth-label-text">{label}</span>
      <span className="auth-input-shell">
        <FieldIcon type={icon} />
        <input aria-label={label} placeholder={label} {...inputProps} />
      </span>
    </label>
  );
}

function AuthIllustration() {
  return (
    <div className="auth-illustration" aria-hidden="true">
      <svg viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M48 54h52l-7-24H55l-7 24Z" fill="#f7d7c9" />
        <path d="M54 54h42v42H54V54Z" fill="#fff7f1" stroke="#c94f27" strokeWidth="3" />
        <path d="M47 54h54" stroke="#c94f27" strokeWidth="5" strokeLinecap="round" />
        <path d="M63 96V72h24v24" stroke="#5c2415" strokeWidth="3" />
        <rect x="110" y="18" width="60" height="86" rx="10" fill="#fff" stroke="#5c2415" strokeWidth="4" />
        <path d="M126 43 133 50l15-18M126 64l7 7 15-18M126 85l7 7 15-18" stroke="#c94f27" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M27 96h166" stroke="#e8d5c9" strokeWidth="4" strokeLinecap="round" />
        <path d="M184 86c13-13 16-29 9-44-16 10-23 25-20 44h11Z" fill="#e8d5c9" />
      </svg>
    </div>
  );
}

function OwnerAuth({ mode }) {
  const isRegister = mode === "register";
  const googleButtonRef = useRef(null);
  const formRef = useRef(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    shopName: "",
    identifier: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingGoogle, setPendingGoogle] = useState(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
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
        const buttonWidth = Math.min(370, googleButtonRef.current.clientWidth || 370);
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "rectangular",
          text: isRegister ? "continue_with" : "signin_with",
          width: buttonWidth
        });
      } catch {
        if (!cancelled) {
          setError("Google sign-in could not load. Check your internet connection and Google OAuth settings.");
        }
      }
    }

    setupGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [isRegister, pendingGoogle]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (pendingGoogle) {
      await finishGoogleRegistration();
      return;
    }

    if (isRegister) {
      setError("Continue with Google to verify your email first.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          isRegister
            ? {
                name: form.name,
                phone: form.phone,
                email: form.email,
                shopName: form.shopName,
                password: form.password
              }
            : {
                identifier: form.identifier,
                password: form.password
              }
        )
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to continue");
      }

      setToken(result.data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleResponse(response) {
    const currentForm = formRef.current || form;
    setError("");

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
          name: result.data.profile?.name || current.name,
          email: result.data.profile?.email || current.email
        }));
        return;
      }

      setToken(result.data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function finishGoogleRegistration() {
    setError("");

    if (!form.name.trim() || !form.shopName.trim() || !form.phone.trim() || !form.password) {
      setError("Fill all registration details to finish Google registration");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Password and confirm password do not match");
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
        throw new Error(result.message || "Unable to finish Google registration");
      }

      setToken(result.data.token);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="owner-auth-page">
      <div className="auth-shell">
        <aside className="auth-visual" aria-label="Shop owner using qrMart">
          <img src={authImage} alt="" />
        </aside>

        <section className="auth-card">
          <AuthIllustration />

          <div>
            <a className="auth-logo" href="/" aria-label="qrMart home">
              <img src={logoImage} alt="qrMart" />
            </a>
            <h1>{pendingGoogle ? "Complete your shop" : isRegister ? "Verify with Google" : "Welcome back"}</h1>
            <p className="muted">
              {pendingGoogle
                ? `Verified email${pendingGoogle.profile?.email ? `: ${pendingGoogle.profile.email}` : ""}`
                : isRegister
                  ? "Use Google first, then set shop details and password"
                  : "Login to manage products, orders, and your QR code."}
            </p>
          </div>

          {error ? <div className="inline-error">{error}</div> : null}

          <form className="stack-form auth-form" onSubmit={submit}>
            {pendingGoogle ? (
              <>
                <AuthField
                  icon="user"
                  label="Full Name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  autoComplete="name"
                  required
                />
                <AuthField
                  icon="shop"
                  label="Shop Name"
                  value={form.shopName}
                  onChange={(event) => update("shopName", event.target.value)}
                  required
                />
                <AuthField
                  icon="phone"
                  label="Phone Number"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  required
                />
                <AuthField
                  icon="lock"
                  label="Password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength="6"
                  required
                />
                <AuthField
                  icon="lock"
                  label="Confirm Password"
                  value={form.confirmPassword}
                  onChange={(event) => update("confirmPassword", event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength="6"
                  required
                />
              </>
            ) : !isRegister ? (
              <>
                <AuthField
                  icon="mail"
                  label="Email Address"
                  value={form.identifier}
                  onChange={(event) => update("identifier", event.target.value)}
                  autoComplete="username"
                  required
                />
                <AuthField
                  icon="lock"
                  label="Password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                  type="password"
                  autoComplete="current-password"
                  minLength="6"
                  required
                />
              </>
            ) : null}

            {pendingGoogle || !isRegister ? (
              <button className="submit-button" type="submit" disabled={loading}>
                {loading ? "Please wait..." : pendingGoogle ? "Finish registration" : "Login"}
              </button>
            ) : null}
          </form>

          {pendingGoogle ? (
            <button className="auth-reset-google" type="button" onClick={() => setPendingGoogle(null)}>
              Use a different Google account
            </button>
          ) : (
            <>
              <div className="auth-divider">
                <span>{isRegister ? "continue with" : "or"}</span>
              </div>

              <div className={googleLoading ? "auth-google is-loading" : "auth-google"} ref={googleButtonRef} />
            </>
          )}

          <p className="auth-switch">
            {isRegister ? "Already have an account?" : "New shop owner?"}{" "}
            <a href={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create account"}</a>
          </p>
        </section>
      </div>
    </main>
  );
}

export default OwnerAuth;
