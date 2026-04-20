import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL, apiFetch, assetUrl, clearToken, getToken } from "./api.js";
import { registerOwnerNotifications, showForegroundOrderAlert } from "./notifications.js";

const tabs = [
  { id: "orders", label: "Orders" },
  { id: "products", label: "Products" },
  { id: "profile", label: "Shop" },
  { id: "qr", label: "QR Code" }
];

const orderUpdateSuggestions = [
  "Your order is accepted ✅",
  "Your order is being prepared 👨‍🍳",
  "Your order is out for delivery 🚚",
  "Your order is ready for pickup 📦",
  "Your order is delayed ⏳",
  "Please call for confirmation 📞"
];

const emptyProductForm = {
  id: "",
  name: "",
  price: "",
  category: "General",
  description: "",
  isAvailable: true,
  image: null
};

const NOTIFICATIONS_ENABLED_KEY = "qrmart_notifications_enabled";

function ShopPlaceholderIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
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

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function OwnerDashboard() {
  const [token] = useState(getToken);
  const [activeTab, setActiveTab] = useState("orders");
  const [owner, setOwner] = useState(null);
  const [shop, setShop] = useState(null);
  const [profileForm, setProfileForm] = useState({});
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [qr, setQr] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => sessionStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "true"
  );
  const [enablingNotifications, setEnablingNotifications] = useState(false);

  useEffect(() => {
    if (!token) {
      window.location.href = "/login";
      return;
    }

    async function loadDashboard() {
      try {
        const me = await apiFetch("/api/v1/auth/me");
        const [productData, orderData, qrData] = await Promise.all([
          apiFetch("/api/v1/owner/products"),
          apiFetch("/api/v1/owner/orders"),
          apiFetch("/api/v1/owner/qr")
        ]);

        setOwner(me.owner);
        setShop(me.shop);
        setProfileForm({
          name: me.shop?.name || "",
          ownerName: me.shop?.ownerName || "",
          phone: me.shop?.phone || "",
          whatsappNumber: me.shop?.whatsappNumber || "",
          address: me.shop?.address || "",
          description: me.shop?.description || "",
          deliveryCharge: me.shop?.settings?.deliveryCharge || 0,
          upiId: me.shop?.payment?.upiId || ""
        });
        setProducts(productData);
        setOrders(orderData);
        setQr(qrData);
      } catch (err) {
        if (err.message.toLowerCase().includes("token")) {
          clearToken();
          window.location.href = "/login";
          return;
        }

        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    socket.on("order:new", (order) => {
      setOrders((current) => [order, ...current.filter((item) => item._id !== order._id)]);
      setToast(`New order ${order.orderNumber}`);
      showForegroundOrderAlert(order);
      setActiveTab("orders");
    });

    socket.on("order:updated", (order) => {
      setOrders((current) => current.map((item) => (item._id === order._id ? order : item)));
    });

    socket.on("connect_error", () => {
      setToast("Real-time connection paused. Refresh if orders look stale.");
    });

    return () => socket.disconnect();
  }, [token]);

  function logout() {
    clearToken();
    window.location.href = "/login";
  }

  function disableNotifications() {
    sessionStorage.removeItem(NOTIFICATIONS_ENABLED_KEY);
    setNotificationsEnabled(false);
    setNotificationStatus("Order alerts disabled for this browser session.");
    setToast("Order alerts disabled for this session.");
  }

  async function enableNotifications() {
    if (enablingNotifications) {
      return;
    }

    if (notificationsEnabled) {
      disableNotifications();
      return;
    }

    setEnablingNotifications(true);
    setNotificationStatus("Enabling notifications...");
    setError("");

    try {
      const result = await registerOwnerNotifications(apiFetch);
      setNotificationStatus(result.message);

      if (result.ok) {
        setNotificationsEnabled(true);
        sessionStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "true");
        setToast(result.message);
      }
    } catch (err) {
      setNotificationStatus("");
      setError(err.message);
    } finally {
      setEnablingNotifications(false);
    }
  }

  function updateProfile(field, value) {
    setProfileForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const updatedShop = await apiFetch("/api/v1/owner/profile", {
        method: "PATCH",
        body: JSON.stringify(profileForm)
      });
      setShop(updatedShop);
      setToast("Shop profile saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    try {
      const updatedShop = await apiFetch("/api/v1/owner/profile/logo", {
        method: "POST",
        body: formData
      });
      setShop(updatedShop);
      setToast("Logo uploaded");
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadPaymentQr(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("paymentQr", file);

    try {
      const updatedShop = await apiFetch("/api/v1/owner/profile/payment-qr", {
        method: "POST",
        body: formData
      });
      setShop(updatedShop);
      setToast("Payment QR uploaded");
    } catch (err) {
      setError(err.message);
    }
  }

  function updateProductForm(field, value) {
    setProductForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function editProduct(product) {
    setProductForm({
      id: product._id,
      name: product.name,
      price: product.price,
      category: product.category || "General",
      description: product.description || "",
      isAvailable: product.isAvailable,
      image: null
    });
    setActiveTab("products");
  }

  async function saveProduct(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData();
    formData.append("name", productForm.name);
    formData.append("price", productForm.price);
    formData.append("category", productForm.category);
    formData.append("description", productForm.description);
    formData.append("isAvailable", String(productForm.isAvailable));

    if (productForm.image) {
      formData.append("image", productForm.image);
    }

    try {
      const savedProduct = await apiFetch(
        productForm.id ? `/api/v1/owner/products/${productForm.id}` : "/api/v1/owner/products",
        {
          method: productForm.id ? "PATCH" : "POST",
          body: formData
        }
      );

      setProducts((current) => {
        if (productForm.id) {
          return current.map((product) => (product._id === savedProduct._id ? savedProduct : product));
        }

        return [savedProduct, ...current];
      });
      setProductForm(emptyProductForm);
      setToast(productForm.id ? "Product updated" : "Product added");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(productId) {
    if (!window.confirm("Delete this product?")) {
      return;
    }

    try {
      await apiFetch(`/api/v1/owner/products/${productId}`, {
        method: "DELETE"
      });
      setProducts((current) => current.filter((product) => product._id !== productId));
      setToast("Product deleted");
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      const updatedOrder = await apiFetch(`/api/v1/owner/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setOrders((current) => current.map((order) => (order._id === orderId ? updatedOrder : order)));
      setToast(`Order ${statusLabel(status)}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendOrderNotification(order, message) {
    const result = await apiFetch("/api/v1/owner/send-notification", {
      method: "POST",
      body: JSON.stringify({
        orderId: order._id,
        message,
        status: order.status
      })
    });

    if (result.sent) {
      setToast("Notification sent to customer.");
      return result;
    }

    setToast(result.message || "Customer push notification is not enabled. Use WhatsApp fallback.");
    return result;
  }

  if (loading) {
    return (
      <main className="page page-center">
        <div className="loader-card">Loading owner panel...</div>
      </main>
    );
  }

  const newOrders = orders.filter((order) => ["placed", "seen"].includes(order.status));
  const historyOrders = orders.filter((order) => !["placed", "seen"].includes(order.status));

  return (
    <main className="owner-shell">
      <header className="owner-topbar">
        <div className="brand-row">
          {shop?.logoUrl ? (
            <img className="owner-logo" src={assetUrl(shop.logoUrl)} alt="" />
          ) : (
            <div className="owner-logo-placeholder">
              <ShopPlaceholderIcon />
            </div>
          )}
          <div>
            <p className="eyebrow">Owner panel</p>
            <h1>{shop?.name || "Your shop"}</h1>
            <p className="muted">Logged in as {owner?.name}</p>
          </div>
        </div>
        <button className="ghost-button compact-button" type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <section className="notification-card">
        <div>
          <strong>Order alerts</strong>
          <p className="muted">
            {notificationStatus ||
              (notificationsEnabled
                ? "Order notifications enabled on this browser."
                : "Enable browser/FCM alerts so new orders are harder to miss.")}
          </p>
        </div>
        <button
          className={`submit-button compact-button ${notificationsEnabled ? "enabled-button" : ""}`}
          type="button"
          onClick={enableNotifications}
          disabled={enablingNotifications}
        >
          {notificationsEnabled ? "Disable alerts" : enablingNotifications ? "Enabling..." : "Enable alerts"}
        </button>
      </section>

      {toast ? (
        <button className="toast" type="button" onClick={() => setToast("")}>
          {toast}
        </button>
      ) : null}

      {error ? <div className="inline-error">{error}</div> : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span>New orders</span>
          <strong>{newOrders.length}</strong>
        </article>
        <article className="metric-card">
          <span>Products</span>
          <strong>{products.length}</strong>
        </article>
        <article className="metric-card">
          <span>QR link</span>
          <strong>{shop?.slug ? "Ready" : "Pending"}</strong>
        </article>
      </section>

      <nav className="owner-tabs" aria-label="Owner dashboard tabs">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "orders" ? (
        <section className="owner-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live orders</p>
              <h2>New orders</h2>
            </div>
            <span className="pill">{newOrders.length} waiting</span>
          </div>
          <OrderList
            orders={newOrders}
            shopName={shop?.name || "Shop"}
            onStatus={updateOrderStatus}
            onSendNotification={sendOrderNotification}
            emptyText="No new orders right now."
          />

          <div className="panel-heading history-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Past orders</h2>
            </div>
          </div>
          <OrderList
            orders={historyOrders}
            shopName={shop?.name || "Shop"}
            onStatus={updateOrderStatus}
            onSendNotification={sendOrderNotification}
            emptyText="Order history will appear here."
          />
        </section>
      ) : null}

      {activeTab === "products" ? (
        <section className="owner-grid">
          <form className="owner-panel stack-form" onSubmit={saveProduct}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{productForm.id ? "Edit product" : "Add product"}</p>
                <h2>{productForm.id ? productForm.name : "New product"}</h2>
              </div>
            </div>
            <label>
              Product name
              <input value={productForm.name} onChange={(event) => updateProductForm("name", event.target.value)} required />
            </label>
            <label>
              Price
              <input
                value={productForm.price}
                onChange={(event) => updateProductForm("price", event.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            <label>
              Category
              <input value={productForm.category} onChange={(event) => updateProductForm("category", event.target.value)} />
            </label>
            <label>
              Description optional
              <textarea
                value={productForm.description}
                onChange={(event) => updateProductForm("description", event.target.value)}
                rows="3"
              />
            </label>
            <label>
              Product image optional
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => updateProductForm("image", event.target.files?.[0] || null)} />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={productForm.isAvailable}
                onChange={(event) => updateProductForm("isAvailable", event.target.checked)}
              />
              Available for ordering
            </label>
            <button className="submit-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : productForm.id ? "Update product" : "Add product"}
            </button>
            {productForm.id ? (
              <button className="ghost-button" type="button" onClick={() => setProductForm(emptyProductForm)}>
                Cancel edit
              </button>
            ) : null}
          </form>

          <section className="owner-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Menu</p>
                <h2>Product list</h2>
              </div>
            </div>
            <div className="owner-list">
              {products.map((product) => (
                <article className="owner-list-card" key={product._id}>
                  {product.imageUrl ? <img className="owner-product-image" src={assetUrl(product.imageUrl)} alt="" /> : null}
                  <div>
                    <h3>{product.name}</h3>
                    <p className="muted">
                      Rs. {product.price} - {product.category || "General"} - {product.isAvailable ? "Available" : "Hidden"}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => editProduct(product)}>
                      Edit
                    </button>
                    <button type="button" className="danger-button" onClick={() => deleteProduct(product._id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {!products.length ? <p className="empty-cart">Add your first product to start taking orders.</p> : null}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "profile" ? (
        <section className="owner-grid">
          <form className="owner-panel stack-form" onSubmit={saveProfile}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Shop profile</p>
                <h2>Basic details</h2>
              </div>
            </div>
            <label>
              Shop name
              <input value={profileForm.name || ""} onChange={(event) => updateProfile("name", event.target.value)} required />
            </label>
            <label>
              Owner name
              <input value={profileForm.ownerName || ""} onChange={(event) => updateProfile("ownerName", event.target.value)} />
            </label>
            <label>
              Phone
              <input value={profileForm.phone || ""} onChange={(event) => updateProfile("phone", event.target.value)} inputMode="tel" />
            </label>
            <label>
              WhatsApp number
              <input
                value={profileForm.whatsappNumber || ""}
                onChange={(event) => updateProfile("whatsappNumber", event.target.value)}
                inputMode="tel"
              />
            </label>
            <label>
              Address
              <input value={profileForm.address || ""} onChange={(event) => updateProfile("address", event.target.value)} />
            </label>
            <label>
              Short description
              <textarea
                value={profileForm.description || ""}
                onChange={(event) => updateProfile("description", event.target.value)}
                rows="3"
              />
            </label>
            <label>
              Delivery charge
              <input
                value={profileForm.deliveryCharge ?? 0}
                onChange={(event) => updateProfile("deliveryCharge", event.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <label>
              UPI ID
              <input
                value={profileForm.upiId || ""}
                onChange={(event) => updateProfile("upiId", event.target.value)}
                placeholder="yourname@upi"
              />
            </label>
            <button className="submit-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save shop"}
            </button>
          </form>

          <section className="owner-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Logo</p>
                <h2>Shop logo</h2>
              </div>
            </div>
            <div className="logo-preview">
              {shop?.logoUrl ? <img src={assetUrl(shop.logoUrl)} alt={`${shop.name} logo`} /> : <span>No logo yet</span>}
            </div>
            <label>
              Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} />
            </label>
            <div className="panel-heading payment-heading">
              <div>
                <p className="eyebrow">Payment</p>
                <h2>Payment QR</h2>
              </div>
            </div>
            <div className="logo-preview payment-preview">
              {shop?.payment?.qrCodeUrl ? (
                <img src={assetUrl(shop.payment.qrCodeUrl)} alt="Payment QR code" />
              ) : (
                <span>No payment QR yet</span>
              )}
            </div>
            <label>
              Upload payment QR
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPaymentQr} />
            </label>
          </section>
        </section>
      ) : null}

      {activeTab === "qr" ? (
        <section className="owner-panel qr-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">QR code</p>
              <h2>Print this for your shop</h2>
            </div>
          </div>
          {qr ? (
            <>
              <img className="qr-image" src={qr.qrDataUrl} alt="Shop QR code" />
              <p className="muted">{qr.qrUrl}</p>
              <div className="qr-actions">
                <a className="submit-button" href={qr.qrDataUrl} download={`${shop?.slug || "shop"}-qr.png`}>
                  Download QR
                </a>
                <a className="ghost-button" href={qr.qrUrl} target="_blank" rel="noreferrer">
                  Open shop page
                </a>
              </div>
            </>
          ) : (
            <p className="empty-cart">QR code is loading.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}

function buildOrderUpdateWhatsAppUrl(order, shopName, message) {
  const phone = normalizeWhatsAppPhone(order.customer?.phone);

  if (!phone || !message.trim()) {
    return "";
  }

  const text = [
    message.trim(),
    "",
    `Order ID: ${order.orderNumber}`,
    `Shop: ${shopName}`
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function OrderUpdateComposer({ order, shopName, onSendNotification }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState("");
  const whatsappUrl = buildOrderUpdateWhatsAppUrl(order, shopName, message);

  async function sendNotification() {
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setLocalError("Message should not be empty.");
      return;
    }

    setSending(true);
    setLocalError("");

    try {
      await onSendNotification(order, cleanMessage);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="order-update-box">
      <div>
        <p className="eyebrow">Send update to customer</p>
        <h4>Custom message</h4>
      </div>
      <div className="suggestion-chips">
        {orderUpdateSuggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => setMessage(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Type update message for customer"
        rows="3"
      />
      {localError ? <p className="field-error">{localError}</p> : null}
      <div className="order-update-actions">
        <button type="button" onClick={sendNotification} disabled={sending}>
          {sending ? "Sending..." : "Send Notification"}
        </button>
        <a
          className={whatsappUrl ? "" : "disabled-link"}
          href={whatsappUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!whatsappUrl}
        >
          Send via WhatsApp
        </a>
      </div>
    </section>
  );
}

function OrderList({ orders, shopName, onStatus, onSendNotification, emptyText }) {
  if (!orders.length) {
    return <p className="empty-cart">{emptyText}</p>;
  }

  return (
    <div className="owner-list">
      {orders.map((order) => (
        <article className="order-card" key={order._id}>
          <div className="order-card-head">
            <div>
              <h3>{order.orderNumber}</h3>
              <p className="muted">
                {formatDate(order.createdAt)} - {order.customer?.name || "Customer"}
              </p>
            </div>
            <span className={`status-pill status-${order.status}`}>{statusLabel(order.status)}</span>
          </div>
          <div className="order-items">
            {order.items.map((item) => (
              <div className="cart-row" key={`${order._id}-${item.productId}`}>
                <span>
                  {item.quantity} x {item.name}
                </span>
                <strong>Rs. {item.subtotal}</strong>
              </div>
            ))}
          </div>
          <div className="total-strip">
            <span>Total</span>
            <strong>Rs. {order.totalAmount}</strong>
          </div>
          <div className="order-meta-grid">
            <span>Items</span>
            <strong>Rs. {order.pricing?.itemTotal ?? order.totalAmount}</strong>
            <span>Delivery</span>
            <strong>Rs. {order.pricing?.deliveryCharge ?? 0}</strong>
            <span>Payment</span>
            <strong>{order.payment?.declaredPaid ? "Marked paid" : "Pending/unknown"}</strong>
          </div>
          {order.customer?.phone || order.customer?.address || order.customer?.note ? (
            <p className="muted">
              {order.customer?.phone ? `Phone: ${order.customer.phone}` : ""}
              {order.customer?.address ? ` Address: ${order.customer.address}` : ""}
              {order.customer?.note ? ` Note: ${order.customer.note}` : ""}
            </p>
          ) : null}
          <div className="row-actions">
            {order.status === "placed" || order.status === "seen" ? (
              <>
                <button type="button" onClick={() => onStatus(order._id, "accepted")}>
                  Accept
                </button>
                <button type="button" className="danger-button" onClick={() => onStatus(order._id, "rejected")}>
                  Reject
                </button>
              </>
            ) : null}
            {order.status === "accepted" ? (
              <button type="button" onClick={() => onStatus(order._id, "preparing")}>
                Mark preparing
              </button>
            ) : null}
            {order.status === "preparing" ? (
              <button type="button" onClick={() => onStatus(order._id, "ready")}>
                Mark ready
              </button>
            ) : null}
            {order.status === "ready" ? (
              <button type="button" onClick={() => onStatus(order._id, "completed")}>
                Complete
              </button>
            ) : null}
          </div>
          <OrderUpdateComposer order={order} shopName={shopName} onSendNotification={onSendNotification} />
        </article>
      ))}
    </div>
  );
}

export default OwnerDashboard;
