import betterAuth from "@convex-dev/better-auth/convex.config";
import posthog from "@posthog/convex/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AUTH_ALLOWED_EMAILS: v.string(),
    AUTH_BOOTSTRAP_ENABLED: v.optional(v.string()),
    APP_ENVIRONMENT: v.optional(v.string()),
    APP_RELEASE: v.optional(v.string()),
    BETTER_AUTH_SECRET: v.string(),
    CONVEX_SITE_URL: v.optional(v.string()),
    POSTHOG_HOST: v.optional(v.string()),
    POSTHOG_PROJECT_TOKEN: v.string(),
    SITE_URL: v.optional(v.string()),
  },
});

app.use(betterAuth);
app.use(posthog, {
  env: {
    POSTHOG_HOST: app.env.POSTHOG_HOST,
    POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
  },
});

export default app;
