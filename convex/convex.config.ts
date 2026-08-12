import betterAuth from "@convex-dev/better-auth/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.string(),
    CONVEX_SITE_URL: v.optional(v.string()),
  },
});

app.use(betterAuth);
app.use(staticHosting);

export default app;
