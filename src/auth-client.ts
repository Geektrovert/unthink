import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { AuthClient } from "@convex-dev/better-auth/react";

function normalizeAuthClient<Client>(client: Client): AuthClient {
  // SAFETY: createAuthClient returns the package's runtime AuthClient contract. The package's
  // exported union loses the shared useSession result only when conditional plugin lists are
  // inferred, so this adapter restores that declared contract at the package boundary.
  return client as AuthClient;
}

export const authClient = createAuthClient({
  plugins: [convexClient()],
});

export const providerAuthClient = normalizeAuthClient(authClient);
