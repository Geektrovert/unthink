import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireOwnerToken } from "./model/auth";

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
const intentValidator = v.union(
  v.literal("anchor"),
  v.literal("recall"),
  v.literal("bridge"),
  v.literal("teach"),
  v.literal("revival"),
  v.literal("north-star"),
  v.literal("review"),
);
const availableRewardValidator = v.object({
  catalogueVersion: v.number(),
  description: v.string(),
  rewardKey: v.string(),
  state: rewardStateValidator,
  threshold: v.number(),
  title: v.string(),
});
const redemptionResult = v.object({
  _creationTime: v.number(),
  _id: v.id("rewardRedemptions"),
  appliedSeedKey: v.optional(v.string()),
  catalogueVersion: v.number(),
  choiceKey: v.optional(v.string()),
  fallbackReason: v.optional(v.string()),
  operationId: v.string(),
  redeemedAt: v.number(),
  redemptionIdempotencyKey: v.string(),
  rewardKey: v.string(),
  state: v.union(v.literal("claimed"), v.literal("applied"), v.literal("used")),
  targetDayKey: v.optional(v.string()),
  unlockThreshold: v.number(),
  updatedAt: v.number(),
});
const ledgerResult = v.object({
  lifetimeXp: v.number(),
  rows: v.array(
    v.object({
      amount: v.number(),
      awardKind: v.union(
        v.literal("proof"),
        v.literal("retrieval-check"),
        v.literal("bridge-or-contribution"),
      ),
      createdAt: v.number(),
      operationId: v.string(),
    }),
  ),
});

function fail(code: string): never {
  throw new ConvexError(code);
}

function boundedKey(value: string, code: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 120) fail(code);
  return key;
}

async function getLifetimeXp(ctx: QueryCtx | MutationCtx, ownerToken: string) {
  const rows = await ctx.db
    .query("rewardLedger")
    .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
    .take(501);
  if (rows.length > 500) throw new ConvexError("PILOT_LEDGER_LIMIT_REACHED");
  return rows.reduce((total, row) => total + row.amount, 0);
}

function stripOwner<T extends { ownerToken: string }>(value: T) {
  const { ownerToken: _ownerToken, ...result } = value;
  return result;
}

function nextLocalDayKey(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(Date.now());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const current = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}

async function eligibleIntents(
  ctx: QueryCtx | MutationCtx,
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
  return [
    "anchor" as const,
    ...(hasProof ? (["recall", "teach"] as const) : []),
    ...((profile.establishedDomainKeys?.length ?? 0) >= 2 ? (["bridge"] as const) : []),
    ...(profile.revival?.trim() ? (["revival"] as const) : []),
    ...(profile.northStar?.trim() ? (["north-star"] as const) : []),
    "review" as const,
  ];
}

export const getEligibleIntents = query({
  args: {},
  returns: v.array(intentValidator),
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dayKey)) fail("DAY_KEY_INVALID");
    const ownerToken = await requireOwnerToken(ctx);
    const dayRows = await ctx.db
      .query("rewardLedger")
      .withIndex("by_ownerToken_and_localDay", (q) =>
        q.eq("ownerToken", ownerToken).eq("localDay", args.dayKey),
      )
      .take(20);
    return {
      dayXp: dayRows.reduce((total, row) => total + row.amount, 0),
      lifetimeXp: await getLifetimeXp(ctx, ownerToken),
    };
  },
});

export const listAvailable = query({
  args: {},
  returns: v.array(availableRewardValidator),
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const [xp, redemptions, profile] = await Promise.all([
      getLifetimeXp(ctx, ownerToken),
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
      lifetimeXp: await getLifetimeXp(ctx, ownerToken),
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
    return rows.map(stripOwner);
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
        existingByKey.rewardKey !== args.rewardKey ||
        existingByKey.operationId !== args.operationId
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      return stripOwner(existingByKey);
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
    if ((await getLifetimeXp(ctx, ownerToken)) < reward.threshold) fail("REWARD_LOCKED");
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
        ? nextLocalDayKey(profile.timezone ?? fail("TIMEZONE_REQUIRED"))
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
    return stripOwner(receipt);
  },
});
