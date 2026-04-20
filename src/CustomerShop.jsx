import React, { useEffect, useState } from "react";
import { API_BASE_URL, assetUrl } from "./api.js";
import { createCustomerNotificationToken } from "./notifications.js";

function getSlugFromPath() {
  const match = window.location.pathname.match(/^\/(?:shop|s)\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
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

function CustomerShop() {
  const [slug] = useState(getSlugFromPath);
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
          <button className="ghost-button" type="button" onClick={() => setOrder(null)}>
            Place another order
          </button>
        </section>
      </main>
    );
  }

  const groupedProducts = groupByCategory(products);

  return (
    <main className="page">
      <header className="hero shop-hero">
        {shop.logoUrl ? <img className="shop-logo" src={assetUrl(shop.logoUrl)} alt={`${shop.name} logo`} /> : null}
        <p className="eyebrow">Scan. Select. Order.</p>
        <h1>{shop.name}</h1>
        {shop.description ? <p>{shop.description}</p> : null}
        {shop.address ? <p>{shop.address}</p> : null}
      </header>

      {error ? <div className="inline-error">{error}</div> : null}

      <section className="layout">
        <div className="menu">
          {Object.entries(groupedProducts).map(([category, items]) => (
            <section className="category" key={category}>
              <h2>{category}</h2>
              <div className="product-grid">
                {items.map((product) => (
                  <article className="product-card" key={product._id}>
                    {product.imageUrl ? (
                      <img className="product-thumb" src={assetUrl(product.imageUrl)} alt={product.name} />
                    ) : null}
                    <div className="product-copy">
                      <h3>{product.name}</h3>
                      {product.description ? <p>{product.description}</p> : null}
                      <strong>Rs. {product.price}</strong>
                    </div>
                    <div className="quantity-control">
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

        <form className="cart-card checkout-card" onSubmit={submitOrder}>
          <p className="eyebrow">Your cart</p>
          {cartItems.length ? (
            <div className="cart-items">
              {cartItems.map((item) => (
                <div className="cart-row" key={item._id}>
                  <span>
                    {item.quantity} x {item.name}
                  </span>
                  <strong>Rs. {item.price * item.quantity}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-cart">Add items from the menu.</p>
          )}

          <div className="total-strip">
            <span>Final total</span>
            <strong>Rs. {totalAmount}</strong>
          </div>
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

          <div className="checkout-fields">
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

          <p className="location-note">{locationStatus}</p>

          <section className="payment-box">
            <div>
              <p className="eyebrow">Payment</p>
              <h3>Pay before placing order</h3>
            </div>
            {paymentConfigured ? (
              <>
                {shop.payment?.qrCodeUrl ? (
                  <img className="payment-qr" src={assetUrl(shop.payment.qrCodeUrl)} alt="Payment QR code" />
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

          <button className="submit-button" type="submit" disabled={submitting || !cartItems.length}>
            {submitting ? "Placing order..." : "Place order"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default CustomerShop;
