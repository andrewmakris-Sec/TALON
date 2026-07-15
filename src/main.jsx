import React from "react";
import ReactDOM from "react-dom/client";
import HUD from "./talon-hud.jsx";

/* talon-hud.jsx expects a `window.storage` key-value API (get/set) for
   persisting widget history. Polyfill it with localStorage so the
   dashboard's history features work in a plain browser. */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(key);
      return raw === null ? null : { value: raw };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HUD />
  </React.StrictMode>
);
