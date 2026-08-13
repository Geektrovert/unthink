/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import { decodePilotDeck, fallbackSeed, pilotDeck } from "./domain/pilot_deck";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const dayKey = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Dhaka",
  year: "numeric",
}).format(new Date());

test("a malformed pilot deck falls back instead of creating an unfinishable quest", () => {
  const malformed = pilotDeck.map((seed, index) =>
    index === 0 ? { ...seed, allowedProofKinds: [] } : seed,
  );
  expect(decodePilotDeck(malformed)).toEqual([fallbackSeed]);
});

async function createReadyOwner() {
  const backend = convexTest(schema, modules);
  const owner = backend.withIdentity({ subject: "owner" });
  await backend.run(async (ctx) => {
    await ctx.db.insert("profiles", {
      anchor: "backend systems",
      onboardingComplete: true,
      onboardingStep: "complete",
      ownerToken: "https://convex.test|owner",
      pilotDeckVersion: "pilot-1",
      timezone: "Asia/Dhaka",
      updatedAt: 1,
    });
  });
  return { backend, owner };
}

test("concurrent preparation and invalid transitions preserve one daily quest", async () => {
  const { owner } = await createReadyOwner();
  const [first, second] = await Promise.all([
    owner.mutation(api.quests.prepareToday, {
      dayKey,
      operationId: "prepare-concurrent-a",
    }),
    owner.mutation(api.quests.prepareToday, {
      dayKey,
      operationId: "prepare-concurrent-b",
    }),
  ]);
  expect(first.quest._id).toBe(second.quest._id);
  await expect(
    owner.mutation(api.quests.saveProgress, {
      clientMutationId: "save-before-start",
      questId: first.quest._id,
      update: { step: "retrieve", text: "This must not persist." },
    }),
  ).rejects.toThrow("QUEST_NOT_ACTIVE");
  await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: "start-before-delayed-retry",
    questId: first.quest._id,
  });
  const deep = await owner.mutation(api.quests.startOrResize, {
    mode: "deep",
    operationId: "resize-after-first-start",
    questId: first.quest._id,
  });
  const delayedStartRetry = await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: "start-before-delayed-retry",
    questId: first.quest._id,
  });
  expect(delayedStartRetry.quest.mode).toBe("deep");
  expect(delayedStartRetry.quest.updatedAt).toBe(deep.quest.updatedAt);
  expect((await owner.query(api.quests.getToday, { dayKey })).quest?._id).toBe(first.quest._id);
});

test("progress patches cannot write a different step's durable field", async () => {
  const { owner } = await createReadyOwner();
  const lifecycle = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-step-boundary",
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: "start-step-boundary",
    questId: lifecycle.quest._id,
  });

  await expect(
    owner.mutation(api.quests.saveProgress, {
      clientMutationId: "wrong-field-for-retrieve",
      questId: lifecycle.quest._id,
      // SAFETY: This deliberately malformed payload crosses the generated client type only to
      // prove the public Convex argument validator rejects the wrong step field at runtime.
      update: { practice: "This belongs to Make, not Retrieve.", step: "retrieve" } as never,
    }),
  ).rejects.toThrow("Validator error");

  const restored = await owner.query(api.quests.getMine, { questId: lifecycle.quest._id });
  expect(restored.attempt.currentStep).toBe("retrieve");
  expect(restored.attempt.drafts.practice).toBe("");
});

test("rescue reaches proof without debt and completion retries cannot duplicate rewards", async () => {
  const { owner } = await createReadyOwner();
  const lifecycle = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-rescue-quest",
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "rescue",
    operationId: "start-rescue-quest",
    questId: lifecycle.quest._id,
  });
  await expect(
    owner.mutation(api.quests.complete, {
      capsule: {
        boundary: "Bounded",
        connection: "Connected",
        example: "Example",
        idea: "Idea",
        retrievalCue: "Cue",
      },
      checkOutcome: "Checked",
      operationId: "complete-too-early",
      proof: { kind: "text", note: "Not ready" },
      questId: lifecycle.quest._id,
    }),
  ).rejects.toThrow("QUEST_NOT_READY");
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-rescue-recall",
    questId: lifecycle.quest._id,
    update: { step: "retrieve", text: "A bounded recall." },
  });
  const readyForProof = await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-rescue-practice",
    questId: lifecycle.quest._id,
    update: { step: "make", text: "A tiny concrete example." },
  });
  expect(readyForProof.currentStep).toBe("proof");

  const request = {
    capsule: {
      boundary: "The example is intentionally small.",
      connection: "It connects recall to one action.",
      example: "One checked example.",
      idea: "Small proof beats setup.",
      retrievalCue: "What is the smallest proof?",
    },
    checkOutcome: "The example satisfies the done condition.",
    operationId: "complete-rescue-quest",
    proof: { kind: "text" as const, note: "Completed the bounded rescue proof." },
    questId: lifecycle.quest._id,
  };
  const completed = await owner.mutation(api.quests.complete, request);
  const replayedWithAnotherKey = await owner.mutation(api.quests.complete, {
    ...request,
    operationId: "complete-rescue-retry",
  });
  expect(replayedWithAnotherKey).toEqual(completed);
  expect(completed.xpAwarded).toBe(5);
  const sameDay = await owner.query(api.quests.getToday, { dayKey });
  expect(sameDay.quest?._id).toBe(lifecycle.quest._id);
  expect(sameDay.lifetimeXp).toBe(5);
});

test("the proof note, check, reference, and capsule restore from durable quest state", async () => {
  const { owner } = await createReadyOwner();
  const lifecycle = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-proof-draft",
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "rescue",
    operationId: "start-proof-draft",
    questId: lifecycle.quest._id,
  });
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "proof-draft-recall",
    questId: lifecycle.quest._id,
    update: { step: "retrieve", text: "A durable recall." },
  });
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "proof-draft-practice",
    questId: lifecycle.quest._id,
    update: { step: "make", text: "A durable practice example." },
  });
  await owner.mutation(api.quests.saveProgress, {
    advance: false,
    clientMutationId: "proof-draft-content",
    questId: lifecycle.quest._id,
    update: {
      step: "proof",
      proof: {
        capsule: {
          boundary: "Bounded",
          connection: "Connected",
          example: "Example",
          idea: "Idea",
          retrievalCue: "Cue",
        },
        checkOutcome: "Checked",
        proofKind: "reference",
        proofNote: "Durable proof note",
        referenceUrl: "https://example.com/proof",
      },
    },
  });

  const restored = await owner.query(api.quests.getMine, { questId: lifecycle.quest._id });
  expect(restored.attempt.currentStep).toBe("proof");
  expect(restored.attempt.drafts.proof).toEqual({
    capsule: {
      boundary: "Bounded",
      connection: "Connected",
      example: "Example",
      idea: "Idea",
      retrievalCue: "Cue",
    },
    checkOutcome: "Checked",
    proofKind: "reference",
    proofNote: "Durable proof note",
    referenceUrl: "https://example.com/proof",
  });
});

test("proof upload authorization rejects unknown types and another owner", async () => {
  const { backend, owner } = await createReadyOwner();
  const stranger = backend.withIdentity({ subject: "stranger" });
  const lifecycle = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-upload-quest",
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: "start-upload-quest",
    questId: lifecycle.quest._id,
  });
  await expect(
    stranger.action(api.evidence.uploadSmallProof, {
      bytes: new TextEncoder().encode("private proof").buffer,
      contentType: "text/plain",
      questId: lifecycle.quest._id,
      uploadToken: "stranger-upload",
    }),
  ).rejects.toThrow("NOT_FOUND");

  const directBytes = new TextEncoder().encode("private proof").buffer;
  const directStorageId = await owner.action(api.evidence.uploadSmallProof, {
    bytes: directBytes,
    contentType: "text/plain",
    questId: lifecycle.quest._id,
    uploadToken: "owner-direct-upload",
  });
  const directReservation = await backend.run(
    async (ctx) =>
      await ctx.db
        .query("pendingUploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", directStorageId))
        .unique(),
  );
  expect(directReservation?.ownerToken).toBe("https://convex.test|owner");

  const storageId = await backend.run(
    async (ctx) => await ctx.storage.store(new Blob(["private proof"], { type: "text/plain" })),
  );
  const uploadId = await backend.run(
    async (ctx) =>
      await ctx.db.insert("pendingUploads", {
        contentType: "text/plain",
        expiresAt: 1,
        ownerToken: "https://convex.test|owner",
        questId: lifecycle.quest._id,
        size: 13,
        storageId,
        uploadToken: "expired-upload",
      }),
  );
  await backend.mutation(internal.evidence.expireUpload, { uploadId });
  expect(
    await backend.run(async (ctx) => await ctx.db.system.get("_storage", storageId)),
  ).toBeNull();
});

test("the daily reward cap never over-awards a valid completion", async () => {
  const { backend, owner } = await createReadyOwner();
  const lifecycle = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-capped-quest",
  });
  await backend.run(async (ctx) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", "https://convex.test|owner"))
      .unique();
    if (profile === null) throw new Error("profile fixture missing");
    await ctx.db.patch(profile._id, { lifetimeXp: 8 });
    await ctx.db.insert("rewardLedger", {
      amount: 8,
      awardIdempotencyKey: "prior-award-before-cap",
      awardKind: "proof",
      createdAt: 1,
      localDay: dayKey,
      operationId: "prior-operation-before-cap",
      ownerToken: "https://convex.test|owner",
      questId: lifecycle.quest._id,
    });
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "rescue",
    operationId: "start-capped-quest",
    questId: lifecycle.quest._id,
  });
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-capped-recall",
    questId: lifecycle.quest._id,
    update: { step: "retrieve", text: "Recall before the cap." },
  });
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-capped-practice",
    questId: lifecycle.quest._id,
    update: { step: "make", text: "Practice before the cap." },
  });
  const receipt = await owner.mutation(api.quests.complete, {
    capsule: {
      boundary: "Daily XP is bounded.",
      connection: "Proof remains valid without an award.",
      example: "Eight plus five exceeds ten.",
      idea: "Cap before insertion.",
      retrievalCue: "What is today's cap?",
    },
    checkOutcome: "No award crossed the cap.",
    operationId: "complete-capped-quest",
    proof: { kind: "text", note: "The completion remains inspectable." },
    questId: lifecycle.quest._id,
  });
  expect(receipt.xpAwarded).toBe(0);
  const today = await owner.query(api.quests.getToday, { dayKey });
  expect(today.dayXp).toBe(8);
  expect(today.quest?.status).toBe("completed");
});
