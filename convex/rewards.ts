import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { assertDayKey, nextLocalDayKey } from "./domain/calendar";
import { eligibleQuestFamilies } from "./domain/reward_policy";
import { requireOwnerToken } from "./model/auth";
import { withoutOwner } from "./model/documents";
import { readLifetimeXp } from "./model/reward_totals";
import { questFamilyValidator, rewardLedgerFields, rewardRedemptionFields } from "./schema";

const CATALOGUE_VERSION = 1;
const catalogue = [
  {
    category: "choice",
    description: "Choose among the next day’s already eligible reviewed quest intents.",
    rewardKey: "choose-next-intent",
    threshold: 15,
    title: "Choose the next intent",
  },
  {
    category: "creative",
    description: "Mark one pre-agreed 30-minute offline creative session as used.",
    rewardKey: "protected-studio-session",
    threshold: 25,
    title: "Protected studio session",
  },
] as const;

const rewardStateValidator = v.union(
  v.literal("locked"),
  v.literal("available"),
  v.literal("claimed"),
  v.literal("applied"),
  v.literal("used"),
);
const availableRewardValidator = v.object({
  catalogueVersion: v.number(),
  description: v.string(),
  rewardKey: v.string(),
  state: rewardStateValidator,
  threshold: v.number(),
  title: v.string(),
});
const redemptionResult = rewardRedemptionFields.omit("ownerToken").extend({
  _creationTime: v.number(),
  _id: v.id("rewardRedemptions"),
});
const ledgerResult = v.object({
  lifetimeXp: v.number(),
  rows: v.array(rewardLedgerFields.pick("amount", "awardKind", "createdAt", "operationId")),
});

function fail(code: string): never {
  throw new ConvexError(code);
}

function boundedKey(value: string, code: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 120) fail(code);
  return key;
}

async function eligibleIntents(
  ctx: Parameters<typeof requireOwnerToken>[0],
  ownerToken: string,
  profile: { establishedDomainKeys?: string[]; northStar?: string; revival?: string },
) {
  const hasProof =
    (
      await ctx.db
        .query("evidence")
        .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
        .take(1)
    ).length > 0;
  return [...eligibleQuestFamilies(profile, hasProof)];
}

export const getEligibleIntents = query({
  args: {},
  returns: v.array(questFamilyValidator),
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile === null) fail("ONBOARDING_REQUIRED");
    return await eligibleIntents(ctx, ownerToken, profile);
  },
});

export const getSummary = query({
  args: { dayKey: v.string() },
  returns: v.object({ dayXp: v.number(), lifetimeXp: v.number() }),
  handler: async (ctx, args) => {
    assertDayKey(args.dayKey);
    const ownerToken = await requireOwnerToken(ctx);
    const dayRows = await ctx.db
      .query("rewardLedger")
      .withIndex("by_ownerToken_and_localDay", (q) =>
        q.eq("ownerToken", ownerToken).eq("localDay", args.dayKey),
      )
      .take(20);
    return {
      dayXp: dayRows.reduce((total, row) => total + row.amount, 0),
      lifetimeXp: await readLifetimeXp(ctx, ownerToken),
    };
  },
});

export const listAvailable = query({
  args: {},
  returns: v.array(availableRewardValidator),
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const [xp, redemptions, profile] = await Promise.all([
      readLifetimeXp(ctx, ownerToken),
      ctx.db
        .query("rewardRedemptions")
        .withIndex("by_ownerToken_and_redeemedAt", (q) => q.eq("ownerToken", ownerToken))
        .order("desc")
        .take(20),
      ctx.db
        .query("profiles")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .unique(),
    ]);
    if (profile?.rewardPreferences?.rewardSuggestions !== true) return [];
    const enabledCategories = profile.rewardPreferences.rewardCategories ?? ["creative", "choice"];
    return catalogue
      .filter((reward) => enabledCategories.includes(reward.category))
      .map((reward) => {
        const redemption = redemptions.find(
          (row) => row.catalogueVersion === CATALOGUE_VERSION && row.rewardKey === reward.rewardKey,
        );
        const state: "locked" | "available" | "claimed" | "applied" | "used" =
          redemption?.state ?? (xp >= reward.threshold ? "available" : "locked");
        return {
          catalogueVersion: CATALOGUE_VERSION,
          description: reward.description,
          rewardKey: reward.rewardKey,
          state,
          threshold: reward.threshold,
          title: reward.title,
        };
      });
  },
});

export const getLedger = query({
  args: {},
  returns: ledgerResult,
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const rows = await ctx.db
      .query("rewardLedger")
      .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
      .order("desc")
      .take(50);
    return {
      lifetimeXp: await readLifetimeXp(ctx, ownerToken),
      rows: rows.map(({ amount, awardKind, createdAt, operationId }) => ({
        amount,
        awardKind,
        createdAt,
        operationId,
      })),
    };
  },
});

export const listRedemptions = query({
  args: {},
  returns: v.array(redemptionResult),
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const rows = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_ownerToken_and_redeemedAt", (q) => q.eq("ownerToken", ownerToken))
      .order("desc")
      .take(20);
    return rows.map(withoutOwner);
  },
});

export const redeem = mutation({
  args: {
    catalogueVersion: v.number(),
    choiceKey: v.optional(v.string()),
    idempotencyKey: v.string(),
    operationId: v.string(),
    rewardKey: v.string(),
  },
  returns: redemptionResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const idempotencyKey = boundedKey(args.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");
    const existingByKey = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_redemptionIdempotencyKey", (q) =>
        q.eq("redemptionIdempotencyKey", idempotencyKey),
      )
      .unique();
    if (existingByKey !== null) {
      if (existingByKey.ownerToken !== ownerToken) fail("NOT_FOUND");
      if (
        existingByKey.catalogueVersion !== args.catalogueVersion ||
        existingByKey.choiceKey !== args.choiceKey ||
        existingByKey.rewardKey !== args.rewardKey ||
        existingByKey.operationId !== args.operationId
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      return withoutOwner(existingByKey);
    }
    if (args.catalogueVersion !== CATALOGUE_VERSION) fail("REWARD_CATALOGUE_STALE");
    const reward = catalogue.find(({ rewardKey }) => rewardKey === args.rewardKey);
    if (reward === undefined) fail("REWARD_UNKNOWN");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile?.rewardPreferences?.rewardSuggestions !== true) fail("REWARD_HIDDEN");
    const enabledCategories = profile.rewardPreferences.rewardCategories ?? ["creative", "choice"];
    if (!enabledCategories.includes(reward.category)) fail("REWARD_CATEGORY_HIDDEN");
    const existingReward = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_ownerToken_and_catalogueVersion_and_rewardKey", (q) =>
        q
          .eq("ownerToken", ownerToken)
          .eq("catalogueVersion", CATALOGUE_VERSION)
          .eq("rewardKey", reward.rewardKey),
      )
      .unique();
    if (existingReward !== null) fail("REWARD_ALREADY_REDEEMED");
    if ((await readLifetimeXp(ctx, ownerToken)) < reward.threshold) fail("REWARD_LOCKED");
    let choiceKey: string | undefined;
    if (reward.rewardKey === "choose-next-intent") {
      const allowedChoices = await eligibleIntents(ctx, ownerToken, profile);
      if (
        args.choiceKey === undefined ||
        !allowedChoices.some((choice) => choice === args.choiceKey)
      ) {
        fail("REWARD_CHOICE_INVALID");
      }
      choiceKey = args.choiceKey;
    } else if (args.choiceKey !== undefined) {
      fail("REWARD_CHOICE_INVALID");
    }
    const now = Date.now();
    const targetDayKey =
      reward.rewardKey === "choose-next-intent"
        ? nextLocalDayKey(profile.timezone ?? fail("TIMEZONE_REQUIRED"), Date.now())
        : undefined;
    const id = await ctx.db.insert("rewardRedemptions", {
      catalogueVersion: CATALOGUE_VERSION,
      ...(choiceKey === undefined ? {} : { choiceKey }),
      operationId: boundedKey(args.operationId, "OPERATION_ID_INVALID"),
      ownerToken,
      redeemedAt: now,
      redemptionIdempotencyKey: idempotencyKey,
      rewardKey: reward.rewardKey,
      state: reward.rewardKey === "choose-next-intent" ? "claimed" : "used",
      ...(targetDayKey === undefined ? {} : { targetDayKey }),
      unlockThreshold: reward.threshold,
      updatedAt: now,
    });
    const receipt = await ctx.db.get(id);
    if (receipt === null) fail("REWARD_WRITE_FAILED");
    return withoutOwner(receipt);
  },
});
