import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { modeValidator, questFields } from "./schema";

const questResult = questFields.omit("ownerToken").extend({ _id: v.id("quests") });

const todayResult = v.object({
  quest: v.union(v.null(), questResult),
  xp: v.number(),
});

const advanceableStep = v.union(v.literal(0), v.literal(1), v.literal(2));

async function requireOwnerToken(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Unauthenticated");
  }
  return identity.tokenIdentifier;
}

function validateDayKey(dayKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new ConvexError("Invalid day key");
  }
}

function toQuestResult(quest: Doc<"quests">) {
  return {
    _id: quest._id,
    dayKey: quest.dayKey,
    mode: quest.mode,
    proof: quest.proof,
    questKey: quest.questKey,
    status: quest.status,
    stepIndex: quest.stepIndex,
  };
}

async function requireOwnedQuest(ctx: MutationCtx, questId: Id<"quests">) {
  const ownerToken = await requireOwnerToken(ctx);
  const quest = await ctx.db.get(questId);
  if (quest === null) {
    throw new ConvexError("Quest not found");
  }
  if (quest.ownerToken !== ownerToken) {
    throw new ConvexError("Quest not found");
  }
  return { ownerToken, quest };
}

export const today = query({
  args: { dayKey: v.string() },
  returns: todayResult,
  handler: async (ctx, args) => {
    validateDayKey(args.dayKey);
    const ownerToken = await requireOwnerToken(ctx);
    const [learner, quest] = await Promise.all([
      ctx.db
        .query("learners")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .unique(),
      ctx.db
        .query("quests")
        .withIndex("by_ownerToken_and_dayKey", (q) =>
          q.eq("ownerToken", ownerToken).eq("dayKey", args.dayKey),
        )
        .unique(),
    ]);

    return { quest: quest === null ? null : toQuestResult(quest), xp: learner?.xp ?? 0 };
  },
});

export const startToday = mutation({
  args: { dayKey: v.string(), mode: modeValidator },
  returns: v.id("quests"),
  handler: async (ctx, args) => {
    validateDayKey(args.dayKey);
    const ownerToken = await requireOwnerToken(ctx);
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_ownerToken_and_dayKey", (q) =>
        q.eq("ownerToken", ownerToken).eq("dayKey", args.dayKey),
      )
      .unique();

    if (existing !== null) {
      return existing._id;
    }

    const learner = await ctx.db
      .query("learners")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();

    if (learner === null) {
      await ctx.db.insert("learners", { ownerToken, xp: 0 });
    }

    return await ctx.db.insert("quests", {
      dayKey: args.dayKey,
      mode: args.mode,
      ownerToken,
      questKey: "cooperative-cancellation",
      status: "active",
      stepIndex: 0,
    });
  },
});

export const advance = mutation({
  args: { expectedStepIndex: advanceableStep, questId: v.id("quests") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { quest } = await requireOwnedQuest(ctx, args.questId);
    if (quest.stepIndex === args.expectedStepIndex + 1) {
      return quest.stepIndex;
    }
    if (quest.status === "proven" || quest.stepIndex !== args.expectedStepIndex) {
      throw new ConvexError("Quest state changed; refresh and try again");
    }

    const stepIndex = args.expectedStepIndex + 1;
    await ctx.db.patch(quest._id, { stepIndex });
    return stepIndex;
  },
});

export const submitProof = mutation({
  args: {
    questId: v.id("quests"),
    text: v.string(),
    url: v.optional(v.string()),
  },
  returns: v.object({ awarded: v.boolean(), xp: v.number() }),
  handler: async (ctx, args) => {
    const { ownerToken, quest } = await requireOwnedQuest(ctx, args.questId);
    const learner = await ctx.db
      .query("learners")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();

    if (learner === null) {
      throw new ConvexError("Learner state not found");
    }
    if (quest.status === "proven") {
      return { awarded: false, xp: learner.xp };
    }
    if (quest.stepIndex !== 3) {
      throw new ConvexError("Finish the current steps before submitting proof");
    }

    const text = args.text.trim();
    if (text.length < 3 || text.length > 2_000) {
      throw new ConvexError("Proof must be between 3 and 2,000 characters");
    }

    const url = args.url?.trim();
    if (url !== undefined && url.length > 2_048) {
      throw new ConvexError("Proof link must be 2,048 characters or fewer");
    }
    if (url !== undefined && url.length > 0) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("Unsupported protocol");
        }
      } catch {
        throw new ConvexError("Proof link must be a valid http(s) URL");
      }
    }

    const xp = learner.xp + 5;
    await ctx.db.patch(quest._id, {
      proof: {
        text,
        ...(url === undefined || url.length === 0 ? {} : { url }),
        submittedAt: Date.now(),
      },
      status: "proven",
    });
    await ctx.db.patch(learner._id, { xp });

    return { awarded: true, xp };
  },
});
