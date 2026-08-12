import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function requirePublicSetting(name: string, value: string | undefined) {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing public setting: ${name}`);
  }
  return value;
}

export const convexSiteUrl = requirePublicSetting(
  "VITE_CONVEX_SITE_URL",
  import.meta.env.VITE_CONVEX_SITE_URL,
);

const crossDomain =
  typeof window !== "undefined" && window.location.origin !== new URL(convexSiteUrl).origin;

export const authClient = crossDomain
  ? createAuthClient({
      baseURL: `${convexSiteUrl}/api/auth`,
      plugins: [convexClient(), crossDomainClient()],
    })
  : createAuthClient({
      baseURL: `${convexSiteUrl}/api/auth`,
      plugins: [convexClient()],
    });
