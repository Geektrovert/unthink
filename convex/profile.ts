import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireOwnerToken } from "./model/auth";
import {
  calibrationObservationValidator,
  frictionValidator,
  learningPreferencesValidator,
  profileFields,
  rewardPreferencesValidator,
  supportValidator,
} from "./schema";

const profileResult = profileFields.omit("ownerToken").extend({
  _creationTime: v.number(),
  _id: v.id("profiles"),
});

const onboardingPayloadValidator = v.union(
  v.object({ accepted: v.boolean() }),
  v.object({
    anchor: v.string(),
    establishedDomainKeys: v.array(v.string()),
    northStar: v.string(),
    revival: v.optional(v.string()),
  }),
  v.object({ friction: frictionValidator, supports: v.array(supportValidator) }),
  v.object(rewardPreferencesValidator.fields),
  v.object({ observations: v.array(calibrationObservationValidator) }),
);

const onboardingStepInputValidator = v.union(
  v.literal("promise"),
  v.literal("goals"),
  v.literal("supports"),
  v.literal("rewards"),
  v.literal("calibration"),
);

const stepOrder = ["promise", "goals", "supports", "rewards", "calibration", "complete"] as const;
const calibrationTaskKeys = ["recall", "apply", "bridge", "teach", "stop"] as const;

function assertBoundedText(value: string, code: string, maximum = 120) {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ConvexError(code);
  }
  return normalized;
}

function stripOwner<T extends { ownerToken: string }>(profile: T) {
  const { ownerToken: _ownerToken, ...result } = profile;
  return result;
}

function boundedUnique<T>(values: T[], maximum: number, code: string) {
  const unique = [...new Set(values)];
  if (values.length > maximum * 2 || unique.length > maximum) throw new ConvexError(code);
  return unique;
}

function assertCalibrationComplete(
  observations: Array<{ correction: string; observation: string; taskKey: string }> | undefined,
) {
  if (observations?.length !== calibrationTaskKeys.length) {
    throw new ConvexError("CALIBRATION_INCOMPLETE");
  }
  const taskKeys = new Set(observations.map(({ taskKey }) => taskKey));
  if (
    taskKeys.size !== calibrationTaskKeys.length ||
    calibrationTaskKeys.some((taskKey) => !taskKeys.has(taskKey))
  ) {
    throw new ConvexError("CALIBRATION_INCOMPLETE");
  }
  return observations.map((item) => ({
    ...item,
    correction: item.correction.trim().slice(0, 1_000),
    observation: assertBoundedText(item.observation, "CALIBRATION_OBSERVATION_INVALID", 1_000),
  }));
}

export const get = query({
  args: {},
  returns: v.union(v.null(), profileResult),
  handler: async (ctx) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    return profile === null ? null : stripOwner(profile);
  },
});

export const saveOnboardingStep = mutation({
  args: { payload: onboardingPayloadValidator, step: onboardingStepInputValidator },
  returns: profileResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (existing?.onboardingComplete === true) throw new ConvexError("ONBOARDING_ALREADY_COMPLETE");
    const updatedAt = Date.now();
    const currentStepIndex = existing === null ? 0 : stepOrder.indexOf(existing.onboardingStep);
    const savedStepIndex = stepOrder.indexOf(args.step);
    if (savedStepIndex > currentStepIndex) throw new ConvexError("ONBOARDING_STEP_OUT_OF_ORDER");
    const onboardingStep =
      savedStepIndex === currentStepIndex
        ? (stepOrder[savedStepIndex + 1] ?? "complete")
        : (existing?.onboardingStep ?? "promise");

    let patch: Record<string, unknown>;
    switch (args.step) {
      case "promise": {
        if (!("accepted" in args.payload) || !args.payload.accepted) {
          throw new ConvexError("PROMISE_REQUIRED");
        }
        patch = { promiseAccepted: true };
        break;
      }
      case "goals": {
        if (!("anchor" in args.payload)) throw new ConvexError("ONBOARDING_PAYLOAD_INVALID");
        const domains = [...new Set(args.payload.establishedDomainKeys.map((key) => key.trim()))];
        if (
          domains.length === 0 ||
          domains.length > 12 ||
          domains.some((key) => key.length === 0)
        ) {
          throw new ConvexError("ESTABLISHED_DOMAINS_INVALID");
        }
        patch = {
          anchor: assertBoundedText(args.payload.anchor, "ANCHOR_INVALID"),
          establishedDomainKeys: domains,
          northStar: assertBoundedText(args.payload.northStar, "NORTH_STAR_INVALID"),
          ...(args.payload.revival === undefined || args.payload.revival.trim().length === 0
            ? {}
            : { revival: assertBoundedText(args.payload.revival, "REVIVAL_INVALID") }),
        };
        break;
      }
      case "supports": {
        if (!("friction" in args.payload)) throw new ConvexError("ONBOARDING_PAYLOAD_INVALID");
        patch = {
          friction: args.payload.friction,
          supports: boundedUnique(args.payload.supports, 4, "SUPPORTS_INVALID"),
        };
        break;
      }
      case "rewards": {
        if (!("showXp" in args.payload)) throw new ConvexError("ONBOARDING_PAYLOAD_INVALID");
        patch = {
          rewardPreferences: {
            ...args.payload,
            rewardCategories: boundedUnique(
              args.payload.rewardCategories ?? [],
              2,
              "REWARD_CATEGORIES_INVALID",
            ),
          },
        };
        break;
      }
      case "calibration": {
        if (!("observations" in args.payload)) throw new ConvexError("ONBOARDING_PAYLOAD_INVALID");
        patch = {
          calibration: assertCalibrationComplete(args.payload.observations),
          calibrationDraft: undefined,
        };
        break;
      }
    }

    if (existing === null) {
      const profileId = await ctx.db.insert("profiles", {
        onboardingComplete: false,
        onboardingStep,
        ownerToken,
        updatedAt,
        ...patch,
      });
      const created = await ctx.db.get(profileId);
      if (created === null) throw new ConvexError("PROFILE_WRITE_FAILED");
      return stripOwner(created);
    }

    await ctx.db.patch(existing._id, { onboardingStep, updatedAt, ...patch });
    const updated = await ctx.db.get(existing._id);
    if (updated === null) throw new ConvexError("PROFILE_WRITE_FAILED");
    return stripOwner(updated);
  },
});

export const completeOnboarding = mutation({
  args: { timezone: v.string() },
  returns: profileResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (
      profile === null ||
      profile.onboardingStep !== "complete" ||
      profile.promiseAccepted !== true ||
      profile.anchor === undefined ||
      (profile.establishedDomainKeys?.length ?? 0) === 0 ||
      profile.northStar === undefined ||
      profile.friction === undefined ||
      profile.rewardPreferences === undefined
    ) {
      throw new ConvexError("ONBOARDING_INCOMPLETE");
    }
    assertCalibrationComplete(profile.calibration);
    try {
      new Intl.DateTimeFormat("en", { timeZone: args.timezone }).format(0);
    } catch {
      throw new ConvexError("TIMEZONE_INVALID");
    }
    if (!profile.onboardingComplete) {
      await ctx.db.patch(profile._id, {
        learningPreferences: profile.learningPreferences ?? {
          defaultMode: "standard",
          lowStimulation: profile.supports?.includes("low-stimulation") ?? false,
          timerVisible: profile.supports?.includes("optional-timer") ?? false,
        },
        onboardingComplete: true,
        onboardingStep: "complete",
        calibrationDraft: undefined,
        pilotDeckVersion: "pilot-1",
        timezone: args.timezone,
        updatedAt: Date.now(),
      });
    }
    const completed = await ctx.db.get(profile._id);
    if (completed === null) throw new ConvexError("PROFILE_WRITE_FAILED");
    return stripOwner(completed);
  },
});

export const saveOnboardingDraft = mutation({
  args: {
    anchor: v.string(),
    calibration: v.array(calibrationObservationValidator),
    friction: frictionValidator,
    northStar: v.string(),
    revival: v.optional(v.string()),
    rewardPreferences: rewardPreferencesValidator,
    supports: v.array(supportValidator),
  },
  returns: profileResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile === null || profile.promiseAccepted !== true || profile.onboardingComplete) {
      throw new ConvexError("ONBOARDING_DRAFT_UNAVAILABLE");
    }
    const calibrationTaskKeys = args.calibration.map(({ taskKey }) => taskKey);
    if (
      calibrationTaskKeys.length > 5 ||
      new Set(calibrationTaskKeys).size !== calibrationTaskKeys.length
    ) {
      throw new ConvexError("CALIBRATION_DRAFT_INVALID");
    }
    const supports = boundedUnique(args.supports, 4, "SUPPORTS_INVALID");
    const rewardCategories = boundedUnique(
      args.rewardPreferences.rewardCategories ?? [],
      2,
      "REWARD_CATEGORIES_INVALID",
    );
    const draft = {
      anchor: args.anchor.trim().slice(0, 120) || undefined,
      calibrationDraft: args.calibration.map((item) => ({
        correction: item.correction.trim().slice(0, 1_000),
        observation: item.observation.trim().slice(0, 1_000),
        taskKey: item.taskKey,
      })),
      friction: args.friction,
      northStar: args.northStar.trim().slice(0, 120) || undefined,
      revival: args.revival?.trim().slice(0, 120) || undefined,
      rewardPreferences: {
        ...args.rewardPreferences,
        rewardCategories,
      },
      supports,
      updatedAt: Date.now(),
    };
    await ctx.db.patch(profile._id, draft);
    const updated = await ctx.db.get(profile._id);
    if (updated === null) throw new ConvexError("PROFILE_WRITE_FAILED");
    return stripOwner(updated);
  },
});

export const updateLearningSettings = mutation({
  args: {
    anchor: v.string(),
    learningPreferences: learningPreferencesValidator,
    northStar: v.string(),
    revival: v.optional(v.string()),
    supports: v.array(supportValidator),
  },
  returns: profileResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile?.onboardingComplete !== true) throw new ConvexError("ONBOARDING_REQUIRED");
    await ctx.db.patch(profile._id, {
      anchor: assertBoundedText(args.anchor, "ANCHOR_INVALID"),
      learningPreferences: args.learningPreferences,
      northStar: assertBoundedText(args.northStar, "NORTH_STAR_INVALID"),
      ...(args.revival === undefined || args.revival.trim().length === 0
        ? { revival: undefined }
        : { revival: assertBoundedText(args.revival, "REVIVAL_INVALID") }),
      supports: boundedUnique(args.supports, 4, "SUPPORTS_INVALID"),
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(profile._id);
    if (updated === null) throw new ConvexError("PROFILE_WRITE_FAILED");
    return stripOwner(updated);
  },
});

export const updateRewardSettings = mutation({
  args: { preferences: rewardPreferencesValidator },
  returns: profileResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile?.onboardingComplete !== true) throw new ConvexError("ONBOARDING_REQUIRED");
    await ctx.db.patch(profile._id, {
      rewardPreferences: {
        ...args.preferences,
        rewardCategories: boundedUnique(
          args.preferences.rewardCategories ?? [],
          2,
          "REWARD_CATEGORIES_INVALID",
        ),
      },
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(profile._id);
    if (updated === null) throw new ConvexError("PROFILE_WRITE_FAILED");
    return stripOwner(updated);
  },
});
