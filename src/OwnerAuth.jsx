import React, { useState } from "react";
import { API_BASE_URL, setToken } from "./api.js";

function OwnerAuth({ mode }) {
  const isRegister = mode === "register";
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    shopName: "",
    identifier: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
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

  return (
    <main className="owner-auth-page">
      <section className="auth-card">
        <div>
          <p className="eyebrow">qrMart owner</p>
          <h1>{isRegister ? "Create your shop" : "Welcome back"}</h1>
          <p className="muted">
            {isRegister
              ? "Set up your account and get a QR ordering page in minutes."
              : "Login to manage products, orders, and your QR code."}
          </p>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <form className="stack-form" onSubmit={submit}>
          {isRegister ? (
            <>
              <label>
                Owner name
                <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
              </label>
              <label>
                Phone number
                <input
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  inputMode="tel"
                  required
                />
              </label>
              <label>
                Email optional
                <input
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  type="email"
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Shop name
                <input value={form.shopName} onChange={(event) => update("shopName", event.target.value)} required />
              </label>
            </>
          ) : (
            <label>
              Phone or email
              <input
                value={form.identifier}
                onChange={(event) => update("identifier", event.target.value)}
                autoComplete="username"
                required
              />
            </label>
          )}

          <label>
            Password
            <input
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength="6"
              required
            />
          </label>

          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? "Please wait..." : isRegister ? "Create account" : "Login"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New shop owner?"}{" "}
          <a href={isRegister ? "/login" : "/register"}>
            {isRegister ? "Login" : "Register"}
          </a>
        </p>
      </section>
    </main>
  );
}

export default OwnerAuth;
