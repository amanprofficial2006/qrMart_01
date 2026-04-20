import React from "react";
import { getToken } from "./api.js";

const features = [
  {
    icon: "qr",
    title: "QR-based ordering",
    text: "Customers scan once, browse your live menu, and order from their own phone."
  },
  {
    icon: "bell",
    title: "Real-time notifications",
    text: "New orders appear instantly in your dashboard so your team does not miss them."
  },
  {
    icon: "shop",
    title: "Simple shop management",
    text: "Update products, prices, shop details, and your QR code without technical work."
  },
  {
    icon: "spark",
    title: "No technical skills required",
    text: "Built for busy shop owners with a clean interface and only the controls you need."
  }
];

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

function LandingPage() {
  const dashboardHref = getToken() ? "/dashboard" : "/login";

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <a className="landing-brand" href="/">
          <span>qr</span>Mart
        </a>
        <div className="landing-nav-actions">
          <a className="nav-link" href="/login">
            Login
          </a>
          <a className="nav-button" href="/register">
            Register
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Smart ordering for small shops</p>
          <h1>Turn Your Shop Into a Smart QR-Based Ordering System</h1>
          <p className="landing-description">
            Let customers scan a QR code, browse your products, and place orders instantly. No apps required for
            customers.
          </p>
          <div className="landing-actions">
            <a className="primary-cta" href="/register">
              Register
            </a>
            <a className="secondary-cta" href={dashboardHref}>
              Login
            </a>
          </div>
        </div>

        <div className="landing-preview" aria-label="Dashboard preview">
          <div className="preview-phone">
            <div className="preview-shop">
              <span className="preview-logo" />
              <div>
                <strong>Aman General Store</strong>
                <p>3 new orders</p>
              </div>
            </div>
            <div className="preview-order">
              <span>2 x Tea</span>
              <strong>Rs. 20</strong>
            </div>
            <div className="preview-order">
              <span>1 x Samosa</span>
              <strong>Rs. 15</strong>
            </div>
            <button type="button">Accept order</button>
          </div>
          <div className="preview-qr">
            <span />
            <span />
            <span />
            <span />
            <p>Scan to order</p>
          </div>
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
        <p className="eyebrow">Get started in 2 minutes</p>
        <h2>Create your QR shop page today</h2>
        <a className="primary-cta" href="/register">
          Register your shop
        </a>
      </section>
    </main>
  );
}

export default LandingPage;
