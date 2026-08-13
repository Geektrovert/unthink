import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { providerAuthClient } from "./auth-client";
import { captureUnexpectedError, initializeTelemetry } from "./posthog";
import { router } from "./router";
import "./styles.css";

const root = document.getElementById("root");
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (root === null) {
  throw new Error("Missing #root element");
}
if (convexUrl === undefined || convexUrl.length === 0) {
  throw new Error("Missing public setting: VITE_CONVEX_URL");
}

const convex = new ConvexReactClient(convexUrl);
initializeTelemetry();
window.addEventListener("error", (event) => {
  captureUnexpectedError(event.error, `browser-error-${crypto.randomUUID()}`);
});
window.addEventListener("unhandledrejection", (event) => {
  captureUnexpectedError(event.reason, `browser-rejection-${crypto.randomUUID()}`);
});

createRoot(root).render(
  <StrictMode>
    <ConvexBetterAuthProvider authClient={providerAuthClient} client={convex}>
      <RouterProvider router={router} />
    </ConvexBetterAuthProvider>
  </StrictMode>,
);
