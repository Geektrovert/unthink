import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const modeValidator = v.union(v.literal("rescue"), v.literal("standard"), v.literal("deep"));
const statusValidator = v.union(v.literal("active"), v.literal("proven"));

const learnerFields = v.object({
  ownerToken: v.string(),
  xp: v.number(),
});

export const questFields = v.object({
  ownerToken: v.string(),
  dayKey: v.string(),
  questKey: v.string(),
  mode: modeValidator,
  status: statusValidator,
  stepIndex: v.number(),
  proof: v.optional(
    v.object({
      text: v.string(),
      url: v.optional(v.string()),
      submittedAt: v.number(),
    }),
  ),
});

export default defineSchema({
  learners: defineTable(learnerFields.fields).index("by_ownerToken", ["ownerToken"]),

  quests: defineTable(questFields.fields).index("by_ownerToken_and_dayKey", [
    "ownerToken",
    "dayKey",
  ]),
});
