import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";

async function requireProfile(ctx: QueryCtx | MutationCtx, ownerToken: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
    .unique();
  if (profile === null) throw new ConvexError("ONBOARDING_REQUIRED");
  return profile;
}

export async function readLifetimeXp(ctx: QueryCtx | MutationCtx, ownerToken: string) {
  const profile = await requireProfile(ctx, ownerToken);
  if (profile.lifetimeXp !== undefined) return profile.lifetimeXp;
  const legacyAward = await ctx.db
    .query("rewardLedger")
    .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
    .first();
  if (legacyAward !== null) throw new ConvexError("REWARD_TOTAL_MIGRATION_REQUIRED");
  return 0;
}

export async function writeLifetimeXp(ctx: MutationCtx, ownerToken: string, lifetimeXp: number) {
  const profile = await requireProfile(ctx, ownerToken);
  await ctx.db.patch("profiles", profile._id, { lifetimeXp, updatedAt: Date.now() });
}
