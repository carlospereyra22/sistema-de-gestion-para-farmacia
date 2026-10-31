import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app";
import "./index.css";
import { localAppUrl } from "./lib/local-app-url";
import { pwaInstall } from "./lib/pwa-install";

pwaInstall.start(
  window,
  () => window.matchMedia("(display-mode: standalone)").matches,
);

const canonicalUrl = localAppUrl(
  window.location.href,
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1",
  import.meta.env.DEV,
);
if (canonicalUrl) window.location.replace(canonicalUrl);
else
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
