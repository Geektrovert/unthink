import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { AuthClient } from "@convex-dev/better-auth/react";

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
  "window" in globalThis && globalThis.window.location.origin !== new URL(convexSiteUrl).origin;

function normalizeAuthClient<Client>(client: Client): AuthClient {
  // SAFETY: createAuthClient returns the package's runtime AuthClient contract. The package's
  // exported union loses the shared useSession result only when conditional plugin lists are
  // inferred, so this adapter restores that declared contract at the package boundary.
  return client as AuthClient;
}

export const authClient = crossDomain
  ? createAuthClient({
      baseURL: `${convexSiteUrl}/api/auth`,
      plugins: [convexClient(), crossDomainClient()],
    })
  : createAuthClient({
      baseURL: `${convexSiteUrl}/api/auth`,
      plugins: [convexClient()],
    });

export const providerAuthClient = normalizeAuthClient(authClient);
