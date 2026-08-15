import { v } from "convex/values";

import { env, query } from "./_generated/server";
import { isBootstrapEnabled } from "./domain/auth_policy";

const bootstrapStatusValidator = v.object({
  enabled: v.boolean(),
});

/** Exposes only whether the supervised owner-creation window is currently open. */
export const getBootstrapStatus = query({
  args: {},
  returns: bootstrapStatusValidator,
  handler: async () => ({
    enabled: isBootstrapEnabled(env.AUTH_BOOTSTRAP_ENABLED),
  }),
});
