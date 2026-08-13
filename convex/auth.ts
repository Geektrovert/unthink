import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import authConfig from "./auth.config";
import { isBootstrapEnabled, parseAllowedEmails, resolveAuthPolicy } from "./domain/auth_policy";

export const authComponent = createClient<DataModel>(components.betterAuth);

function requireSetting(name: string, value: string | undefined) {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required Convex setting: ${name}`);
  }
  return value;
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  const convexSiteUrl = requireSetting("CONVEX_SITE_URL", env.CONVEX_SITE_URL);
  const policy = resolveAuthPolicy({
    appEnvironment: requireSetting("APP_ENVIRONMENT", env.APP_ENVIRONMENT),
    convexSiteUrl,
    siteUrl: env.SITE_URL,
  });
  const allowedEmails = parseAllowedEmails(
    requireSetting("AUTH_ALLOWED_EMAILS", env.AUTH_ALLOWED_EMAILS),
  );
  const bootstrapEnabled = isBootstrapEnabled(env.AUTH_BOOTSTRAP_ENABLED);

  return betterAuth({
    baseURL: policy.appOrigin,
    database: authComponent.adapter(ctx),
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (context === null) return false;
            const user = await context.context.internalAdapter.findUserById(session.userId);
            return user !== null && allowedEmails.has(user.email.trim().toLowerCase());
          },
        },
      },
      user: {
        create: {
          before: async (user) => allowedEmails.has(user.email.trim().toLowerCase()),
        },
        update: {
          before: async (user) =>
            user.email === undefined || allowedEmails.has(user.email.trim().toLowerCase()),
        },
      },
    },
    emailAndPassword: {
      autoSignIn: false,
      disableSignUp: !bootstrapEnabled,
      enabled: true,
      minPasswordLength: 12,
    },
    secret: requireSetting("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET),
    trustedOrigins: [policy.appOrigin],
    plugins: [
      convex({
        authConfig,
        jwt: {
          definePayload: ({ session }) => ({
            authSessionCreatedAt: new Date(session.createdAt).getTime(),
          }),
        },
      }),
    ],
    telemetry: { enabled: false },
    session: { freshAge: 5 * 60 },
    user: {
      deleteUser: { enabled: true },
    },
  });
}
