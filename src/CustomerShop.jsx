import React, { useEffect, useState } from "react";
import { API_BASE_URL, assetUrl } from "./api.js";
import { createCustomerNotificationToken } from "./notifications.js";

const customerSteps = [
  { id: "menu", label: "Menu" },
  { id: "cart", label: "Cart" },
  { id: "checkout", label: "Details" },
  { id: "payment", label: "Payment" }
];

const stepIds = customerSteps.map((step) => step.id);

function getShopPathInfo() {
  const match = window.location.pathname.match(/^\/(shop|s)\/([^/]+)(?:\/([^/]+))?/);

  if (!match) {
    return { slug: "", basePath: "", step: "menu" };
  }

  const step = stepIds.includes(match[3]) ? match[3] : "menu";
  return {
    slug: decodeURIComponent(match[2]),
    basePath: `/${match[1]}/${match[2]}`,
    step
  };
}

function groupByCategory(products) {
  return products.reduce((groups, product) => {
    const category = product.category || "General";
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

function CustomerShop() {
  const [pathInfo] = useState(getShopPathInfo);
  const [slug] = useState(pathInfo.slug);
  const [activeStep, setActiveStep] = useState(pathInfo.step);
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", note: "" });
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Detecting location...");
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [customerNotificationStatus, setCustomerNotificationStatus] = useState("");
  const [enablingOrderUpdates, setEnablingOrderUpdates] = useState(false);

  useEffect(() => {
    function syncStepFromUrl() {
      setActiveStep(getShopPathInfo().step);
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

    async function loadShop() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/public/shops/${slug}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Unable to load shop.");
        }

        setShop(result.data.shop);
        setProducts(result.data.products);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadShop();
  }, [slug]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("Location is not supported on this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setLocationStatus("Location attached for WhatsApp backup.");
      },
      () => {
        setLocationStatus("Location permission not granted. You can still place the order.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000
      }
    );
  }, []);

  const cartItems = products
    .map((product) => ({
      ...product,
      quantity: cart[product._id] || 0
    }))
    .filter((item) => item.quantity > 0);

  const itemTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryCharge = Number(shop?.settings?.deliveryCharge || 0);
  const totalAmount = itemTotal + deliveryCharge;
  const paymentConfigured = Boolean(shop?.payment?.upiId || shop?.payment?.qrCodeUrl);
  const upiLink = buildUpiLink(shop, totalAmount);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (!cartItems.length && ["checkout", "payment"].includes(activeStep)) {
      navigateStep("menu", true);
    }
  }, [activeStep, cartItems.length]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  function navigateStep(step, replace = false) {
    const nextPath = step === "menu" ? pathInfo.basePath : `${pathInfo.basePath}/${step}`;

    if (nextPath && window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({ customerStep: step }, "", nextPath);
    }

    setActiveStep(step);
  }

  function goToStep(step) {
    setError("");

    if (["checkout", "payment"].includes(step) && !cartItems.length) {
      setError("Please add at least one item first.");
      navigateStep("menu");
      return;
    }

    if (step === "payment" && !customer.address.trim()) {
      setError("Delivery address is required before payment.");
      navigateStep("checkout");
      return;
    }

    navigateStep(step);
  }

  function continueToCheckout() {
    if (!cartItems.length) {
      setError("Please add at least one item first.");
      navigateStep("menu");
      return;
    }

    setError("");
    navigateStep("checkout");
  }

  function continueToPayment() {
    if (!cartItems.length) {
      setError("Please add at least one item first.");
      navigateStep("menu");
      return;
    }

    if (!customer.address.trim()) {
      setError("Delivery address is required.");
      return;
    }

    setError("");
    navigateStep("payment");
  }

  function placeAnotherOrder() {
    setOrder(null);
    setCustomerNotificationStatus("");
    navigateStep("menu", true);
  }

  function changeQuantity(productId, direction) {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[productId] || 0) + direction);
      return {
        ...current,
        [productId]: nextQuantity
      };
    });
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError("");

    if (!cartItems.length) {
      setError("Please add at least one item.");
      return;
    }

    if (!customer.address.trim()) {
      setError("Delivery address is required.");
      return;
    }

    if (paymentConfigured && !paymentAcknowledged) {
      setError("Please complete payment and tick the payment confirmation before placing the order.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/shops/${slug}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customer: {
            ...customer,
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

      setOrder(result.data);
      setCart({});
      setPaymentAcknowledged(false);
    } catch (err) {
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
      setTimeout(() => setCopied(false), 1800);
    } catch (_error) {
      setError("Unable to copy UPI ID. Please copy it manually.");
    }
  }

  async function enableOrderUpdates() {
    if (!order?.orderId || enablingOrderUpdates) {
      return;
    }

    setEnablingOrderUpdates(true);
    setCustomerNotificationStatus("Enabling order updates...");

    try {
      const tokenResult = await createCustomerNotificationToken();

      if (!tokenResult.ok) {
        setCustomerNotificationStatus(tokenResult.message);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/public/orders/${order.orderId}/customer-token`, {
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

      setCustomerNotificationStatus("Order update notifications enabled for this order.");
    } catch (err) {
      setCustomerNotificationStatus(err.message);
    } finally {
      setEnablingOrderUpdates(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-center">
        <div className="loader-card">Loading shop...</div>
      </main>
    );
  }

  if (error && !shop) {
    return (
      <main className="page page-center">
        <div className="error-card">{error}</div>
      </main>
    );
  }

  if (order) {
    return (
      <main className="page">
        <section className="success-card">
          <p className="eyebrow">Order placed</p>
          <h1>{order.orderNumber}</h1>
          <p>Your order has been saved and sent to the shop owner.</p>
          <div className="total-strip">
            <span>Final total</span>
            <strong>Rs. {order.totalAmount}</strong>
          </div>
          <div className="price-breakdown">
            <div>
              <span>Item total</span>
              <strong>Rs. {order.pricing?.itemTotal ?? order.totalAmount}</strong>
            </div>
            <div>
              <span>Delivery charge</span>
              <strong>Rs. {order.pricing?.deliveryCharge ?? 0}</strong>
            </div>
          </div>
          {order.whatsappFallbackUrl ? (
            <a className="whatsapp-button" href={order.whatsappFallbackUrl} target="_blank" rel="noreferrer">
              Send WhatsApp backup
            </a>
          ) : null}
          <button className="ghost-button" type="button" onClick={enableOrderUpdates} disabled={enablingOrderUpdates}>
            {enablingOrderUpdates ? "Enabling updates..." : "Enable order update notifications"}
          </button>
          {customerNotificationStatus ? <p className="location-note">{customerNotificationStatus}</p> : null}
          <button className="ghost-button" type="button" onClick={placeAnotherOrder}>
            Place another order
          </button>
        </section>
      </main>
    );
  }

  const groupedProducts = groupByCategory(products);
  const categoryEntries = Object.entries(groupedProducts);
  const activeStepIndex = customerSteps.findIndex((step) => step.id === activeStep);
  const shopInitial = (shop.name || "S").charAt(0).toUpperCase();

  return (
    <main className={`page customer-page customer-step-${activeStep}`}>
      <header className="customer-shop-header">
        <div className="customer-shop-title">
          <SafeImage
            className="customer-shop-logo"
            src={assetUrl(shop.logoUrl)}
            alt={`${shop.name} logo`}
            fallback={
              <div className="customer-shop-logo customer-shop-logo-fallback" aria-hidden="true">
                {shopInitial}
              </div>
            }
          />
          <div>
            <p className="eyebrow">Scan. Select. Order.</p>
            <h1>{shop.name}</h1>
            {shop.description ? <p className="customer-shop-subline">{shop.description}</p> : null}
            {shop.address ? <p className="customer-shop-address">{shop.address}</p> : null}
          </div>
        </div>
        <button className="customer-cart-chip" type="button" onClick={() => goToStep("cart")}>
          <span>Cart</span>
          <strong>{cartCount}</strong>
        </button>
      </header>

      <nav className="customer-stepper" aria-label="Order steps">
        {customerSteps.map((step, index) => (
          <button
            className={`${activeStep === step.id ? "active" : ""} ${index < activeStepIndex ? "complete" : ""}`}
            type="button"
            key={step.id}
            onClick={() => goToStep(step.id)}
            aria-current={activeStep === step.id ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </nav>

      {error ? <div className="inline-error">{error}</div> : null}

      {activeStep === "menu" ? (
        <section className="customer-screen customer-menu-screen">
          <div className="customer-screen-head">
            <div>
              <p className="eyebrow">Product list</p>
              <h2>Choose your items</h2>
            </div>
            <span className="customer-count-pill">{products.length} items</span>
          </div>

          <div className="customer-category-list">
            {categoryEntries.map(([category, items]) => (
              <section className="customer-category" key={category}>
                <h3>{category}</h3>
                <div className="customer-product-list">
                  {items.map((product) => (
                    <article
                      className={`customer-product-card ${cart[product._id] ? "is-selected" : ""}`}
                      key={product._id}
                    >
                    {product.imageUrl ? (
                        <SafeImage className="customer-product-thumb" src={assetUrl(product.imageUrl)} alt={product.name} />
                      ) : (
                        <div className="customer-product-thumb customer-product-placeholder" aria-hidden="true">
                          {(product.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="customer-product-copy">
                      <h3>{product.name}</h3>
                      {product.description ? <p>{product.description}</p> : null}
                      <strong>Rs. {product.price}</strong>
                    </div>
                      <div className="quantity-control customer-quantity">
                      <button type="button" onClick={() => changeQuantity(product._id, -1)} aria-label="Decrease">
                        -
                      </button>
                      <span>{cart[product._id] || 0}</span>
                      <button type="button" onClick={() => changeQuantity(product._id, 1)} aria-label="Increase">
                        +
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          </div>
        </section>
      ) : null}

      {activeStep === "cart" ? (
        <section className="customer-screen customer-cart-screen">
          <div className="customer-screen-head">
            <div>
              <p className="eyebrow">Your cart</p>
              <h2>Review items</h2>
            </div>
            <span className="customer-count-pill">{cartCount} selected</span>
          </div>

          {cartItems.length ? (
            <div className="customer-cart-list">
              {cartItems.map((item) => (
                <article className="customer-cart-item" key={item._id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p className="muted">Rs. {item.price} each</p>
                  </div>
                  <div className="quantity-control customer-quantity">
                    <button type="button" onClick={() => changeQuantity(item._id, -1)} aria-label="Decrease">
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(item._id, 1)} aria-label="Increase">
                      +
                    </button>
                  </div>
                  <strong>Rs. {item.price * item.quantity}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="customer-empty-state">
              <p className="empty-cart">Your cart is empty.</p>
              <button className="ghost-button" type="button" onClick={() => goToStep("menu")}>
                Browse menu
              </button>
            </div>
          )}

          <section className="customer-total-card">
            <div className="price-breakdown">
              <div>
                <span>Item total</span>
                <strong>Rs. {itemTotal}</strong>
              </div>
              <div>
                <span>Delivery charge</span>
                <strong>Rs. {deliveryCharge}</strong>
              </div>
            </div>
            <div className="total-strip">
              <span>Final total</span>
              <strong>Rs. {totalAmount}</strong>
            </div>
          </section>

          <div className="customer-screen-actions">
            <button className="ghost-button" type="button" onClick={() => goToStep("menu")}>
              Add more items
            </button>
            <button className="submit-button" type="button" onClick={continueToCheckout} disabled={!cartItems.length}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === "checkout" ? (
        <section className="customer-screen customer-checkout-screen">
          <div className="customer-screen-head">
            <div>
              <p className="eyebrow">Delivery details</p>
              <h2>Where should we send it?</h2>
            </div>
          </div>

          <div className="checkout-fields customer-fields">
            <label>
              Name
              <input
                value={customer.name}
                onChange={(event) => setCustomer({ ...customer, name: event.target.value })}
                placeholder="Your name"
              />
            </label>

            <label>
              Phone
              <input
                value={customer.phone}
                onChange={(event) => setCustomer({ ...customer, phone: event.target.value })}
                placeholder="Your phone"
                inputMode="tel"
              />
            </label>

            <label className="full-field">
              <span>
                Address <strong className="required-mark">*</strong>
              </span>
              <textarea
                value={customer.address}
                onChange={(event) => setCustomer({ ...customer, address: event.target.value })}
                placeholder="House/shop number, street, landmark"
                rows="3"
                required
              />
            </label>

            <label className="full-field">
              Note
              <textarea
                value={customer.note}
                onChange={(event) => setCustomer({ ...customer, note: event.target.value })}
                placeholder="Less spicy, pickup time, etc."
                rows="3"
              />
            </label>
          </div>

          <p className="location-note customer-location-note">{locationStatus}</p>

          <section className="customer-total-card customer-mini-total">
            <div className="total-strip">
              <span>Final total</span>
              <strong>Rs. {totalAmount}</strong>
            </div>
          </section>

          <div className="customer-screen-actions">
            <button className="ghost-button" type="button" onClick={() => goToStep("cart")}>
              Back to cart
            </button>
            <button className="submit-button" type="button" onClick={continueToPayment}>
              Continue to payment
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === "payment" ? (
        <form id="customer-payment-form" className="customer-screen customer-payment-screen" onSubmit={submitOrder}>
          <div className="customer-screen-head">
            <div>
              <p className="eyebrow">Payment</p>
              <h2>Pay and place order</h2>
            </div>
          </div>

          <section className="customer-total-card">
            <div className="price-breakdown">
              <div>
                <span>Item total</span>
                <strong>Rs. {itemTotal}</strong>
              </div>
              <div>
                <span>Delivery charge</span>
                <strong>Rs. {deliveryCharge}</strong>
              </div>
            </div>
            <div className="total-strip">
              <span>Final total</span>
              <strong>Rs. {totalAmount}</strong>
            </div>
          </section>

          <section className="payment-box customer-payment-box">
            {paymentConfigured ? (
              <>
                {shop.payment?.qrCodeUrl ? (
                  <SafeImage className="payment-qr" src={assetUrl(shop.payment.qrCodeUrl)} alt="Payment QR code" />
                ) : null}
                {shop.payment?.upiId ? (
                  <div className="upi-row">
                    <span>{shop.payment.upiId}</span>
                    <button type="button" onClick={copyUpiId}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
                {upiLink ? (
                  <a className="pay-now-button" href={upiLink}>
                    Pay Now
                  </a>
                ) : null}
                <label className="checkbox-row payment-confirm">
                  <input
                    type="checkbox"
                    checked={paymentAcknowledged}
                    onChange={(event) => setPaymentAcknowledged(event.target.checked)}
                  />
                  I have completed the payment
                </label>
              </>
            ) : (
              <p className="empty-cart">This shop has not added UPI payment details yet.</p>
            )}
          </section>

          <div className="customer-screen-actions">
            <button className="ghost-button" type="button" onClick={() => goToStep("checkout")}>
              Back to details
            </button>
            <button className="submit-button" type="submit" disabled={submitting || !cartItems.length}>
              {submitting ? "Placing order..." : "Place order"}
            </button>
          </div>
        </form>
      ) : null}

      <aside className="customer-bottom-bar" aria-label="Order summary">
        <div>
          <span>{cartCount ? `${cartCount} item${cartCount > 1 ? "s" : ""}` : "No items"}</span>
          <strong>Rs. {totalAmount}</strong>
        </div>
        {activeStep === "menu" ? (
          <button type="button" onClick={() => goToStep("cart")} disabled={!cartItems.length}>
            View cart
          </button>
        ) : null}
        {activeStep === "cart" ? (
          <button type="button" onClick={continueToCheckout} disabled={!cartItems.length}>
            Details
          </button>
        ) : null}
        {activeStep === "checkout" ? (
          <button type="button" onClick={continueToPayment}>
            Payment
          </button>
        ) : null}
        {activeStep === "payment" ? (
          <button type="submit" form="customer-payment-form" disabled={submitting || !cartItems.length}>
            {submitting ? "Placing..." : "Place order"}
          </button>
        ) : null}
      </aside>
    </main>
  );
}

export default CustomerShop;
