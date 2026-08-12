import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

function requireSetting(name: string, value: string | undefined) {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required Convex setting: ${name}`);
  }
  return value;
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  const convexSiteUrl = requireSetting("CONVEX_SITE_URL", env.CONVEX_SITE_URL);

  return betterAuth({
    baseURL: convexSiteUrl,
    database: authComponent.adapter(ctx),
    secret: requireSetting("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET),
    trustedOrigins: [convexSiteUrl],
    plugins: [convex({ authConfig })],
    telemetry: { enabled: false },
  });
}
