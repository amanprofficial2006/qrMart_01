import React from "react";
import LandingPage from "./LandingPage.jsx";
import CustomerShop from "./CustomerShop.jsx";
import OwnerAuth from "./OwnerAuth.jsx";
import OwnerDashboard from "./OwnerDashboard.jsx";
import { getToken } from "./api.js";

function App() {
  const path = window.location.pathname;

  if (path === "/" || path === "") {
    return <LandingPage />;
  }

  if (path.startsWith("/register") || path.startsWith("/owner/register")) {
    return <OwnerAuth mode="register" />;
  }

  if (path.startsWith("/login") || path.startsWith("/owner/login")) {
    return <OwnerAuth mode="login" />;
  }

  if (path.startsWith("/dashboard") || path.startsWith("/owner/dashboard")) {
    return <OwnerDashboard />;
  }

  if (path === "/owner" || path === "/owner/") {
    window.location.href = getToken() ? "/dashboard" : "/login";
    return null;
  }

  if (path.startsWith("/shop/") || path.startsWith("/s/")) {
    return <CustomerShop />;
  }

  return <LandingPage />;
}

export default App;
