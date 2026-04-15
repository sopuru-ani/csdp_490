import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

function getServiceWorkerUrl() {
  return import.meta.env.DEV ? "/src/sw.js" : "/sw.js";
}

function getServiceWorkerScope() {
  return import.meta.env.DEV ? "/src/" : "/";
}

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(getServiceWorkerUrl(), {
        type: "module",
        scope: getServiceWorkerScope(),
      })
      .then((registration) => {
        console.log("[App] SW registered:", registration.scope);
      })
      .catch((err) => {
        console.error("[App] SW registration failed:", err);
      });
  });
}
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
