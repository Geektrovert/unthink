import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { env, mutation, query } from "./_generated/server";
import { assertDayKey, localDayKey } from "./domain/calendar";
import { decodePilotDeck, pilotDeck, selectPilotSeed } from "./domain/pilot_deck";
import { eligibleQuestFamilies } from "./domain/reward_policy";
import { requireOwnedQuest, requireOwnerToken } from "./model/auth";
import { withoutOwner } from "./model/documents";
import { readLifetimeXp, writeLifetimeXp } from "./model/reward_totals";
import { captureBackendOperation } from "./posthog";
import {
  capsuleValidator,
  modeValidator,
  proofKindValidator,
  proofDraftValidator,
  questAttemptFields,
  questFields,
  questStepValidator,
} from "./schema";

type EvidenceInsert = Omit<Doc<"evidence">, "_creationTime" | "_id">;
type StoredProofDraft = NonNullable<Doc<"questAttempts">["drafts"]["proof"]>;

const questResult = questFields.omit("ownerToken").extend({
  _creationTime: v.number(),
  _id: v.id("quests"),
});
const attemptResult = questAttemptFields.omit("ownerToken").extend({
  _creationTime: v.number(),
  _id: v.id("questAttempts"),
});
const lifecycleResult = v.object({
  attempt: attemptResult,
  quest: questResult,
});
const todayResult = v.object({
  attempt: v.union(v.null(), attemptResult),
  dayXp: v.number(),
  lifetimeXp: v.number(),
  quest: v.union(v.null(), questResult),
  weeklyMomentum: v.object({ completedQuests: v.number() }),
});
const completionResult = v.object({
  evidenceId: v.union(v.id("evidence"), v.null()),
  operationId: v.string(),
  questId: v.id("quests"),
  xpAwarded: v.number(),
});
const lifecycleWithReceiptResult = lifecycleResult.extend({
  completionReceipt: v.optional(completionResult),
});

const progressUpdateValidator = v.union(
  v.object({ step: v.literal("retrieve"), text: v.string() }),
  v.object({ step: v.literal("make"), text: v.string() }),
  v.object({ step: v.literal("connect"), text: v.string() }),
  v.object({ step: v.literal("feedback"), text: v.string() }),
  v.object({ proof: proofDraftValidator, step: v.literal("proof") }),
);

const helpChoiceValidator = v.union(
  v.literal("clarify"),
  v.literal("hint"),
  v.literal("shrink"),
  v.literal("park"),
);

const proofInputValidator = v.object({
  kind: proofKindValidator,
  note: v.string(),
  referenceUrl: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
});

function fail(code: string): never {
  throw new ConvexError(code);
}

async function requireCurrentDay(
  ctx: QueryCtx | MutationCtx,
  ownerToken: string,
  suppliedDayKey: string,
) {
  assertDayKey(suppliedDayKey);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
    .unique();
  if (profile?.onboardingComplete !== true || profile.timezone === undefined) {
    fail("ONBOARDING_REQUIRED");
  }
  if (localDayKey(profile.timezone, Date.now()) !== suppliedDayKey) fail("DAY_KEY_NOT_CURRENT");
  return profile;
}

function bounded(value: string, code: string, minimum = 1, maximum = 4_000) {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) fail(code);
  return normalized;
}

function operationId(value: string) {
  return bounded(value, "OPERATION_ID_INVALID", 8, 120);
}

function rememberOperation(existing: string[] | undefined, value: string) {
  return [...(existing ?? []), value].slice(-100);
}

async function getAttempt(ctx: QueryCtx | MutationCtx, questId: Id<"quests">) {
  return await ctx.db
    .query("questAttempts")
    .withIndex("by_questId", (q) => q.eq("questId", questId))
    .unique();
}

async function dayXp(ctx: QueryCtx | MutationCtx, ownerToken: string, dayKey: string) {
  const rows = await ctx.db
    .query("rewardLedger")
    .withIndex("by_ownerToken_and_localDay", (q) =>
      q.eq("ownerToken", ownerToken).eq("localDay", dayKey),
    )
    .take(20);
  return rows.reduce((total, row) => total + row.amount, 0);
}

function emptyDrafts() {
  return {
    connection: "",
    feedback: "",
    practice: "",
    proofNote: "",
    recall: "",
    referenceUrl: "",
  };
}

async function readLifecycle(ctx: QueryCtx | MutationCtx, quest: Doc<"quests">) {
  const attempt = await getAttempt(ctx, quest._id);
  if (attempt === null) fail("ATTEMPT_NOT_FOUND");
  return { attempt: withoutOwner(attempt), quest: withoutOwner(quest) };
}

export const getToday = query({
  args: { dayKey: v.string() },
  returns: todayResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    assertDayKey(args.dayKey);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .unique();
    if (profile?.onboardingComplete !== true) fail("ONBOARDING_REQUIRED");
    const quest = await ctx.db
      .query("quests")
      .withIndex("by_ownerToken_and_dayKey", (q) =>
        q.eq("ownerToken", ownerToken).eq("dayKey", args.dayKey),
      )
      .unique();
    const attempt = quest === null ? null : await getAttempt(ctx, quest._id);
    const start = new Date(`${args.dayKey}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    const weekStart = start.toISOString().slice(0, 10);
    const completed = await ctx.db
      .query("quests")
      .withIndex("by_ownerToken_and_status_and_dayKey", (q) =>
        q
          .eq("ownerToken", ownerToken)
          .eq("status", "completed")
          .gte("dayKey", weekStart)
          .lte("dayKey", args.dayKey),
      )
      .take(7);
    return {
      attempt: attempt === null ? null : withoutOwner(attempt),
      dayXp: await dayXp(ctx, ownerToken, args.dayKey),
      lifetimeXp: await readLifetimeXp(ctx, ownerToken),
      quest: quest === null ? null : withoutOwner(quest),
      weeklyMomentum: {
        completedQuests: completed.length,
      },
    };
  },
});

export const getMine = query({
  args: { questId: v.id("quests") },
  returns: lifecycleWithReceiptResult,
  handler: async (ctx, args) => {
    const quest = await requireOwnedQuest(ctx, await ctx.db.get(args.questId));
    const lifecycle = await readLifecycle(ctx, quest);
    if (quest.status !== "completed") return lifecycle;
    const proof = await ctx.db
      .query("evidence")
      .withIndex("by_questId", (q) => q.eq("questId", quest._id))
      .unique();
    const run =
      proof === null
        ? await ctx.db
            .query("runs")
            .withIndex("by_questId", (q) => q.eq("questId", quest._id))
            .unique()
        : await ctx.db
            .query("runs")
            .withIndex("by_operationId", (q) => q.eq("operationId", proof.completionOperationId))
            .unique();
    if (run === null || run.ownerToken !== quest.ownerToken) fail("COMPLETION_RECEIPT_INVALID");
    if (proof === null && run.proofDeletedAt === undefined) fail("COMPLETION_RECEIPT_INVALID");
    return { ...lifecycle, completionReceipt: completionFromRun(run) };
  },
});

export const prepareToday = mutation({
  args: { dayKey: v.string(), operationId: v.string() },
  returns: lifecycleResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const profile = await requireCurrentDay(ctx, ownerToken, args.dayKey);
    const createOperationId = operationId(args.operationId);
    const existing = await ctx.db
      .query("quests")
      .withIndex("by_ownerToken_and_dayKey", (q) =>
        q.eq("ownerToken", ownerToken).eq("dayKey", args.dayKey),
      )
      .unique();
    if (existing !== null) return await readLifecycle(ctx, existing);

    const pendingChoices = await ctx.db
      .query("rewardRedemptions")
      .withIndex("by_ownerToken_and_redeemedAt", (q) => q.eq("ownerToken", ownerToken))
      .order("desc")
      .take(10);
    const claimedChoices = pendingChoices.filter(
      (receipt) => receipt.rewardKey === "choose-next-intent" && receipt.state === "claimed",
    );
    const pendingChoice = claimedChoices.find((receipt) => receipt.targetDayKey === args.dayKey);
    const missedChoice = claimedChoices.find(
      (receipt) => receipt.targetDayKey !== undefined && receipt.targetDayKey < args.dayKey,
    );
    const hasProof =
      (
        await ctx.db
          .query("evidence")
          .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
          .take(1)
      ).length > 0;
    const eligibleFamilies = eligibleQuestFamilies(profile, hasProof);
    const chosenFamily = [...eligibleFamilies].find(
      (family) => family === pendingChoice?.choiceKey,
    );
    const claimedSeed =
      chosenFamily === undefined
        ? undefined
        : decodePilotDeck(pilotDeck).find(({ family }) => family === chosenFamily);
    const seed = claimedSeed ?? selectPilotSeed(args.dayKey, eligibleFamilies);
    const now = Date.now();
    const questId = await ctx.db.insert("quests", {
      appliedLifecycleOperationIds: [createOperationId],
      allowedProofKinds: seed.allowedProofKinds,
      capacityVariants: seed.capacityVariants,
      checkMethod: seed.checkMethod,
      createdOperationId: createOperationId,
      dayKey: args.dayKey,
      domainKeys: seed.domainKeys,
      doneCondition: seed.doneCondition,
      evidenceLabels: seed.evidenceLabels,
      family: seed.family,
      helpLevel: 0,
      mode: "standard",
      objective: seed.objective,
      ownerToken,
      possibleXpTags: seed.possibleXpTags,
      seedKey: seed.key,
      seedVersion: seed.version,
      status: "ready",
      stepSpec: seed.stepSpec,
      title: seed.title,
      updatedAt: now,
      whyNow: seed.whyNow,
    });
    await ctx.db.insert("questAttempts", {
      currentStep: "retrieve",
      drafts: emptyDrafts(),
      helpLevel: 0,
      ownerToken,
      questId,
      revision: 0,
      savedAt: now,
    });
    if (pendingChoice !== undefined) {
      if (claimedSeed === undefined) {
        await ctx.db.patch(pendingChoice._id, {
          appliedSeedKey: seed.key,
          fallbackReason: "INTENT_NO_LONGER_ELIGIBLE",
          state: "applied",
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(pendingChoice._id, {
          appliedSeedKey: seed.key,
          state: "applied",
          updatedAt: now,
        });
      }
    } else if (missedChoice !== undefined) {
      await ctx.db.patch(missedChoice._id, {
        appliedSeedKey: seed.key,
        fallbackReason: "TARGET_DAY_MISSED",
        state: "applied",
        updatedAt: now,
      });
    }
    const quest = await ctx.db.get(questId);
    if (quest === null) fail("QUEST_WRITE_FAILED");
    return await readLifecycle(ctx, quest);
  },
});

export const startOrResize = mutation({
  args: { mode: modeValidator, operationId: v.string(), questId: v.id("quests") },
  returns: lifecycleResult,
  handler: async (ctx, args) => {
    const telemetryStartedAt = Date.now();
    const lifecycleOperationId = operationId(args.operationId);
    const quest = await requireOwnedQuest(ctx, await ctx.db.get(args.questId));
    if (quest.appliedLifecycleOperationIds?.includes(lifecycleOperationId)) {
      const lifecycle = await readLifecycle(ctx, quest);
      await captureBackendOperation(ctx, {
        durationMs: Date.now() - telemetryStartedAt,
        family: quest.family,
        idempotentReplay: true,
        journey: "start_quest",
        mode: quest.mode,
        operationId: lifecycleOperationId,
        questId: quest._id,
      });
      return lifecycle;
    }
    if (quest.status === "completed") fail("QUEST_COMPLETED");
    const now = Date.now();
    await ctx.db.patch(quest._id, {
      appliedLifecycleOperationIds: rememberOperation(
        quest.appliedLifecycleOperationIds,
        lifecycleOperationId,
      ),
      doneCondition: quest.capacityVariants[args.mode],
      mode: args.mode,
      startedAt: quest.startedAt ?? now,
      status: "active",
      updatedAt: now,
    });
    const updated = await ctx.db.get(quest._id);
    if (updated === null) fail("QUEST_WRITE_FAILED");
    const lifecycle = await readLifecycle(ctx, updated);
    await captureBackendOperation(ctx, {
      durationMs: Date.now() - telemetryStartedAt,
      family: updated.family,
      journey: "start_quest",
      mode: updated.mode,
      operationId: lifecycleOperationId,
      questId: updated._id,
    });
    return lifecycle;
  },
});

export const saveProgress = mutation({
  args: {
    advance: v.optional(v.boolean()),
    clientMutationId: v.string(),
    questId: v.id("quests"),
    update: progressUpdateValidator,
  },
  returns: v.object({ currentStep: questStepValidator, revision: v.number(), synced: v.boolean() }),
  handler: async (ctx, args) => {
    const telemetryStartedAt = Date.now();
    const quest = await requireOwnedQuest(ctx, await ctx.db.get(args.questId));
    if (quest.status !== "active") fail("QUEST_NOT_ACTIVE");
    const attempt = await getAttempt(ctx, quest._id);
    if (attempt === null) fail("ATTEMPT_NOT_FOUND");
    const clientMutationId = bounded(args.clientMutationId, "MUTATION_ID_INVALID", 8, 120);
    if (attempt.appliedClientMutationIds?.includes(clientMutationId)) {
      if (args.advance !== false) {
        await captureBackendOperation(ctx, {
          durationMs: Date.now() - telemetryStartedAt,
          family: quest.family,
          idempotentReplay: true,
          journey: "advance_quest_step",
          mode: quest.mode,
          operationId: clientMutationId,
          questId: quest._id,
          questStep: attempt.currentStep,
        });
      }
      return { currentStep: attempt.currentStep, revision: attempt.revision, synced: true };
    }
    if (attempt.currentStep !== args.update.step) fail("STEP_CHANGED");
    const drafts = { ...attempt.drafts };
    switch (args.update.step) {
      case "retrieve":
        drafts.recall = bounded(args.update.text, "DRAFT_INVALID");
        break;
      case "make":
        drafts.practice = bounded(args.update.text, "DRAFT_INVALID");
        break;
      case "connect":
        drafts.connection = bounded(args.update.text, "DRAFT_INVALID");
        break;
      case "feedback":
        drafts.feedback = bounded(args.update.text, "DRAFT_INVALID");
        break;
      case "proof":
        {
          const incoming = args.update.proof;
          const proof: StoredProofDraft = {
            capsule: {
              boundary: incoming.capsule.boundary.trim().slice(0, 1_000),
              connection: incoming.capsule.connection.trim().slice(0, 1_000),
              example: incoming.capsule.example.trim().slice(0, 1_000),
              idea: incoming.capsule.idea.trim().slice(0, 1_000),
              retrievalCue: incoming.capsule.retrievalCue.trim().slice(0, 1_000),
            },
            checkOutcome: incoming.checkOutcome.trim().slice(0, 1_000),
            proofKind: incoming.proofKind,
            proofNote: incoming.proofNote.trim().slice(0, 4_000),
            referenceUrl: incoming.referenceUrl.trim().slice(0, 2_048),
          };
          if (incoming.storageId !== undefined) proof.storageId = incoming.storageId;
          drafts.proof = proof;
        }
        drafts.proofNote = drafts.proof.proofNote;
        drafts.referenceUrl = drafts.proof.referenceUrl;
        break;
    }

    const stepOrder = ["retrieve", "make", "connect", "feedback", "proof"] as const;
    const currentIndex = stepOrder.indexOf(args.update.step);
    const currentStep =
      args.advance === false
        ? args.update.step
        : quest.mode === "rescue" && args.update.step === "make"
          ? "proof"
          : (stepOrder[currentIndex + 1] ?? "proof");
    const now = Date.now();
    const revision = attempt.revision + 1;
    await ctx.db.patch(attempt._id, {
      appliedClientMutationIds: rememberOperation(
        attempt.appliedClientMutationIds,
        clientMutationId,
      ),
      currentStep,
      drafts,
      revision,
      savedAt: now,
    });
    if (args.advance !== false) {
      await captureBackendOperation(ctx, {
        durationMs: Date.now() - telemetryStartedAt,
        family: quest.family,
        journey: "advance_quest_step",
        mode: quest.mode,
        operationId: clientMutationId,
        questId: quest._id,
        questStep: currentStep,
      });
    }
    return { currentStep, revision, synced: true };
  },
});

export const requestHelp = mutation({
  args: { choice: helpChoiceValidator, operationId: v.string(), questId: v.id("quests") },
  returns: lifecycleResult,
  handler: async (ctx, args) => {
    const telemetryStartedAt = Date.now();
    const quest = await requireOwnedQuest(ctx, await ctx.db.get(args.questId));
    if (quest.status === "completed") fail("QUEST_COMPLETED");
    const attempt = await getAttempt(ctx, quest._id);
    if (attempt === null) fail("ATTEMPT_NOT_FOUND");
    const helpOperationId = operationId(args.operationId);
    if (attempt.appliedHelpOperationIds?.includes(helpOperationId)) {
      const lifecycle = await readLifecycle(ctx, quest);
      await captureBackendOperation(ctx, {
        durationMs: Date.now() - telemetryStartedAt,
        family: quest.family,
        helpChoice: args.choice,
        idempotentReplay: true,
        journey: "request_quest_help",
        mode: quest.mode,
        operationId: helpOperationId,
        questId: quest._id,
      });
      return lifecycle;
    }
    const now = Date.now();
    const helpLevel = Math.min(2, Math.max(quest.helpLevel, attempt.helpLevel) + 1);
    await ctx.db.patch(attempt._id, {
      appliedHelpOperationIds: rememberOperation(attempt.appliedHelpOperationIds, helpOperationId),
      helpLevel,
      savedAt: now,
    });
    await ctx.db.patch(quest._id, {
      helpLevel,
      ...(args.choice === "park"
        ? { parkedAt: now, status: "parked" as const }
        : args.choice === "shrink"
          ? { doneCondition: quest.capacityVariants.rescue, mode: "rescue" as const }
          : {}),
      updatedAt: now,
    });
    const updated = await ctx.db.get(quest._id);
    if (updated === null) fail("QUEST_WRITE_FAILED");
    const lifecycle = await readLifecycle(ctx, updated);
    await captureBackendOperation(ctx, {
      durationMs: Date.now() - telemetryStartedAt,
      family: updated.family,
      helpChoice: args.choice,
      journey: "request_quest_help",
      mode: updated.mode,
      operationId: helpOperationId,
      questId: updated._id,
    });
    return lifecycle;
  },
});

function completionFromRun(run: Doc<"runs">) {
  if (
    run.questId === undefined ||
    (run.evidenceId === undefined && run.proofDeletedAt === undefined)
  ) {
    fail("COMPLETION_RECEIPT_INVALID");
  }
  return {
    evidenceId: run.evidenceId ?? null,
    operationId: run.operationId,
    questId: run.questId,
    xpAwarded: run.xpAwarded,
  };
}

async function validateProof(
  ctx: MutationCtx,
  proof: {
    kind: "text" | "reference" | "file";
    note: string;
    referenceUrl?: string;
    storageId?: Id<"_storage">;
  },
  questId: Id<"quests">,
) {
  const note = bounded(proof.note, "PROOF_INVALID", 3, 4_000);
  let referenceUrl: string | undefined;
  if (proof.kind === "reference") {
    if (proof.referenceUrl === undefined) fail("PROOF_REFERENCE_REQUIRED");
    try {
      const url = new URL(proof.referenceUrl);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.toString().length > 2_048
      ) {
        fail("PROOF_REFERENCE_INVALID");
      }
      referenceUrl = url.toString();
    } catch {
      fail("PROOF_REFERENCE_INVALID");
    }
  }
  let storage: { id: Id<"_storage">; contentType: string; size: number } | undefined;
  if (proof.kind === "file") {
    if (proof.storageId === undefined) fail("PROOF_FILE_REQUIRED");
    const reservation = await ctx.db
      .query("pendingUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", proof.storageId!))
      .unique();
    const metadata = await ctx.db.system.get("_storage", proof.storageId);
    const allowedTypes = ["image/png", "image/jpeg", "application/pdf", "audio/mpeg", "text/plain"];
    if (
      reservation === null ||
      reservation.storageId !== proof.storageId ||
      reservation.ownerToken !== (await requireOwnerToken(ctx)) ||
      reservation.questId !== questId ||
      reservation.expiresAt < Date.now() ||
      metadata === null ||
      metadata.contentType === undefined ||
      !allowedTypes.includes(metadata.contentType) ||
      metadata.size > 10 * 1024 * 1024
    ) {
      fail("PROOF_FILE_INVALID");
    }
    storage = { contentType: metadata.contentType, id: proof.storageId, size: metadata.size };
  }
  return { note, referenceUrl, storage };
}

export const complete = mutation({
  args: {
    capsule: capsuleValidator,
    checkOutcome: v.string(),
    operationId: v.string(),
    proof: proofInputValidator,
    questId: v.id("quests"),
  },
  returns: completionResult,
  handler: async (ctx, args) => {
    const telemetryStartedAt = Date.now();
    const ownerToken = await requireOwnerToken(ctx);
    const normalizedOperationId = operationId(args.operationId);
    const existingRun = await ctx.db
      .query("runs")
      .withIndex("by_operationId", (q) => q.eq("operationId", normalizedOperationId))
      .unique();
    if (existingRun !== null) {
      if (existingRun.ownerToken !== ownerToken) fail("NOT_FOUND");
      return completionFromRun(existingRun);
    }
    const quest = await requireOwnedQuest(ctx, await ctx.db.get(args.questId));
    const existingEvidence = await ctx.db
      .query("evidence")
      .withIndex("by_questId", (q) => q.eq("questId", quest._id))
      .unique();
    if (existingEvidence !== null) {
      const originalRun = await ctx.db
        .query("runs")
        .withIndex("by_operationId", (q) =>
          q.eq("operationId", existingEvidence.completionOperationId),
        )
        .unique();
      if (originalRun === null) fail("COMPLETION_RECEIPT_INVALID");
      return completionFromRun(originalRun);
    }
    if (quest.status !== "active") fail("QUEST_NOT_READY");
    const attempt = await getAttempt(ctx, quest._id);
    if (attempt === null) fail("ATTEMPT_NOT_FOUND");
    if (attempt.currentStep !== "proof") fail("QUEST_NOT_READY");
    const required =
      quest.mode === "rescue"
        ? [attempt.drafts.recall, attempt.drafts.practice]
        : [
            attempt.drafts.recall,
            attempt.drafts.practice,
            attempt.drafts.connection,
            attempt.drafts.feedback,
          ];
    if (required.some((value) => value.trim().length < 3)) fail("QUEST_STEPS_INCOMPLETE");
    const capsule = {
      boundary: bounded(args.capsule.boundary, "CAPSULE_INVALID", 2, 1_000),
      connection: bounded(args.capsule.connection, "CAPSULE_INVALID", 2, 1_000),
      example: bounded(args.capsule.example, "CAPSULE_INVALID", 2, 1_000),
      idea: bounded(args.capsule.idea, "CAPSULE_INVALID", 2, 1_000),
      retrievalCue: bounded(args.capsule.retrievalCue, "CAPSULE_INVALID", 2, 1_000),
    };
    const checkOutcome = bounded(args.checkOutcome, "CHECK_OUTCOME_INVALID", 2, 1_000);
    if (!quest.allowedProofKinds.includes(args.proof.kind)) fail("PROOF_KIND_NOT_ALLOWED");
    const proof = await validateProof(ctx, args.proof, quest._id);
    const now = Date.now();
    const evidence: EvidenceInsert = {
      capsule,
      checkOutcome,
      completionOperationId: normalizedOperationId,
      createdAt: now,
      domainKeys: quest.domainKeys,
      family: quest.family,
      note: proof.note,
      ownerToken,
      proofKind: args.proof.kind,
      questId: quest._id,
    };
    if (proof.referenceUrl !== undefined) evidence.referenceUrl = proof.referenceUrl;
    if (proof.storage !== undefined) {
      evidence.storageContentType = proof.storage.contentType;
      evidence.storageId = proof.storage.id;
      evidence.storageSize = proof.storage.size;
    }
    const evidenceId = await ctx.db.insert("evidence", evidence);
    if (proof.storage !== undefined) {
      const storage = proof.storage;
      const reservation = await ctx.db
        .query("pendingUploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", storage.id))
        .unique();
      if (reservation !== null) await ctx.db.delete(reservation._id);
    }

    const [existingDayXp, existingLifetimeXp] = await Promise.all([
      dayXp(ctx, ownerToken, quest.dayKey),
      readLifetimeXp(ctx, ownerToken),
    ]);
    const awards: Array<{
      amount: number;
      kind: "proof" | "retrieval-check" | "bridge-or-contribution";
    }> = [{ amount: 5, kind: "proof" }];
    if (
      quest.family === "recall" &&
      attempt.drafts.recall.trim().length >= 3 &&
      checkOutcome.length >= 3
    ) {
      awards.push({ amount: 2, kind: "retrieval-check" });
    }
    if (
      (quest.family === "bridge" || quest.family === "teach" || quest.family === "revival") &&
      attempt.drafts.connection.trim().length >= 3 &&
      checkOutcome.length >= 3
    )
      awards.push({ amount: 3, kind: "bridge-or-contribution" });
    let awarded = 0;
    for (const award of awards) {
      if (existingDayXp + awarded + award.amount > 10) continue;
      await ctx.db.insert("rewardLedger", {
        amount: award.amount,
        awardIdempotencyKey: `${normalizedOperationId}:${award.kind}`,
        awardKind: award.kind,
        createdAt: now,
        localDay: quest.dayKey,
        operationId: normalizedOperationId,
        ownerToken,
        questId: quest._id,
      });
      awarded += award.amount;
    }
    await writeLifetimeXp(ctx, ownerToken, existingLifetimeXp + awarded);
    await ctx.db.patch(quest._id, { completedAt: now, status: "completed", updatedAt: now });
    await ctx.db.insert("runs", {
      durationMs: Math.max(0, now - (quest.startedAt ?? now)),
      endedAt: now,
      environment: env.APP_ENVIRONMENT ?? "local",
      evidenceId,
      operationId: normalizedOperationId,
      operationName: "complete_quest",
      outcome: "succeeded",
      ownerToken,
      questId: quest._id,
      redactionVersion: 1,
      release: env.APP_RELEASE ?? "local",
      retryCount: 0,
      startedAt: quest.startedAt ?? now,
      xpAwarded: awarded,
    });
    await captureBackendOperation(ctx, {
      durationMs: Date.now() - telemetryStartedAt,
      family: quest.family,
      journey: "complete_quest",
      mode: quest.mode,
      operationId: normalizedOperationId,
      proofKind: args.proof.kind,
      questId: quest._id,
      xpAwarded: awarded,
    });
    return {
      evidenceId,
      operationId: normalizedOperationId,
      questId: quest._id,
      xpAwarded: awarded,
    };
  },
});
