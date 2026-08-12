/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createOwnerPrivacyBoundary() {
  const backend = convexTest(schema, modules);
  const authSessionCreatedAt = Date.now();
  const owner = backend.withIdentity({ authSessionCreatedAt, subject: "owner" });
  const stranger = backend.withIdentity({ authSessionCreatedAt, subject: "stranger" });
  const ownerToken = "https://convex.test|owner";
  const proofId = await backend.run(async (ctx) => {
    await ctx.db.insert("profiles", {
      onboardingComplete: true,
      onboardingStep: "complete",
      ownerToken,
      updatedAt: 1,
    });
    const questId = await ctx.db.insert("quests", {
      activeStep: "proof",
      allowedProofKinds: ["text", "reference", "file"],
      capacityVariants: { deep: "Done deeply", rescue: "Done small", standard: "Done" },
      checkMethod: "Inspect",
      completedAt: 1,
      createdOperationId: "prepare-privacy-fixture",
      dayKey: "2026-08-13",
      domainKeys: ["privacy"],
      doneCondition: "Done",
      evidenceLabels: ["product-hypothesis"],
      family: "review",
      helpLevel: 0,
      mode: "standard",
      objective: "Test privacy",
      ownerToken,
      possibleXpTags: ["proof"],
      seedKey: "privacy-fixture",
      seedVersion: 1,
      status: "completed",
      stepSpec: { connect: "c", feedback: "f", make: "m", proof: "p", retrieve: "r" },
      title: "Privacy fixture",
      updatedAt: 1,
      whyNow: "Fixture",
    });
    await ctx.db.insert("questAttempts", {
      currentStep: "proof",
      drafts: {
        connection: "c",
        feedback: "f",
        practice: "p",
        proofNote: "proof",
        recall: "r",
        referenceUrl: "",
      },
      helpLevel: 0,
      ownerToken,
      questId,
      revision: 4,
      savedAt: 1,
    });
    const storageId = await ctx.storage.store(
      new Blob(["private proof fixture"], { type: "text/plain" }),
    );
    return await ctx.db.insert("evidence", {
      capsule: {
        boundary: "Boundary",
        connection: "Connection",
        example: "Example",
        idea: "Idea",
        retrievalCue: "Cue",
      },
      checkOutcome: "Checked",
      completionOperationId: "complete-privacy-fixture",
      createdAt: 1,
      domainKeys: ["privacy"],
      family: "review",
      note: "Private proof",
      ownerToken,
      proofKind: "file",
      questId,
      storageContentType: "text/plain",
      storageId,
      storageSize: 21,
    });
  });
  return { backend, owner, proofId, stranger };
}

test("the owner exports a reconciled versioned snapshot before deleting one proof", async () => {
  const { backend, owner, proofId, stranger } = await createOwnerPrivacyBoundary();
  await expect(
    stranger.query(api.privacy.preview, { kind: "delete_proof", proofId }),
  ).rejects.toThrow("NOT_FOUND");

  const exportReceipt = await owner.action(api.privacy.prepareExport, {
    idempotencyKey: "export-privacy-fixture-1",
    operationId: "export-operation-1",
  });
  expect(exportReceipt.schemaVersion).toBe(1);
  expect(exportReceipt.counts.rows).toBeGreaterThanOrEqual(3);
  expect(exportReceipt.checksum).toMatch(/^[a-f0-9]{64}$/);
  const archiveText = await backend.run(async (ctx) => {
    const archive = await ctx.storage.get(exportReceipt.storageId);
    return archive === null ? null : await archive.text();
  });
  expect(archiveText).not.toBeNull();
  const exported = JSON.parse(archiveText!) as {
    storageManifest: Array<{ sha256: string; size: number }>;
  };
  expect(exported.storageManifest[0]?.sha256).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  expect(exported.storageManifest[0]?.size).toBeGreaterThan(0);

  const preview = await owner.query(api.privacy.preview, { kind: "delete_proof", proofId });
  await expect(
    owner.action(api.privacy.confirmDelete, {
      confirmation: "DELETE PROOF",
      consequenceHash: "stale-hash",
      idempotencyKey: "delete-proof-fixture-1",
      kind: "delete_proof",
      operationId: "delete-proof-operation-1",
      proofId,
    }),
  ).rejects.toThrow("PREVIEW_STALE");

  const deleted = await owner.action(api.privacy.confirmDelete, {
    confirmation: "DELETE PROOF",
    consequenceHash: preview.consequenceHash,
    idempotencyKey: "delete-proof-fixture-1",
    kind: "delete_proof",
    operationId: "delete-proof-operation-1",
    proofId,
  });
  expect(deleted.state).toBe("completed");
  await expect(owner.query(api.evidence.getMine, { proofId })).rejects.toThrow("NOT_FOUND");
});

test("all-learning deletion requires recent auth and replays one truthful receipt", async () => {
  const { backend, owner, proofId } = await createOwnerPrivacyBoundary();
  const staleOwner = backend.withIdentity({
    authSessionCreatedAt: Date.now() - 6 * 60 * 1_000,
    subject: "owner",
  });
  await owner.action(api.privacy.prepareExport, {
    idempotencyKey: "export-before-delete-all-1",
    operationId: "export-before-delete-all-operation",
  });
  const preview = await owner.query(api.privacy.preview, { kind: "delete_learning" });
  await backend.run(async (ctx) => {
    const quest = await ctx.db
      .query("quests")
      .withIndex("by_ownerToken_and_dayKey", (q) => q.eq("ownerToken", "https://convex.test|owner"))
      .unique();
    if (quest !== null) await ctx.db.patch(quest._id, { updatedAt: 2 });
  });
  const request = {
    confirmation: "DELETE ALL LEARNING",
    consequenceHash: preview.consequenceHash,
    idempotencyKey: "delete-learning-fixture-1",
    kind: "delete_learning" as const,
    operationId: "delete-learning-operation-1",
  };
  await expect(staleOwner.action(api.privacy.confirmDelete, request)).rejects.toThrow(
    "RECENT_AUTH_REQUIRED",
  );
  await expect(owner.action(api.privacy.confirmDelete, request)).rejects.toThrow("PREVIEW_STALE");

  const refreshedPreview = await owner.query(api.privacy.preview, { kind: "delete_learning" });
  const refreshedRequest = { ...request, consequenceHash: refreshedPreview.consequenceHash };
  const deleted = await owner.action(api.privacy.confirmDelete, refreshedRequest);
  const replayed = await owner.action(api.privacy.confirmDelete, refreshedRequest);
  expect(replayed).toEqual(deleted);
  expect(deleted.kind).toBe("delete_learning");
  expect(deleted.state).toBe("completed");
  expect(await owner.query(api.profile.get, {})).toBeNull();
  await expect(owner.query(api.evidence.getMine, { proofId })).rejects.toThrow("NOT_FOUND");
});

test("account closure dry run stops before destructive confirmation", async () => {
  const { owner } = await createOwnerPrivacyBoundary();
  const preview = await owner.query(api.privacy.preview, { kind: "close_account" });
  expect(preview.confirmation).toBe("CLOSE ACCOUNT");
  expect(preview.counts.rows).toBeGreaterThan(0);
  await expect(
    owner.action(api.privacy.closeAccount, {
      confirmation: "STOP BEFORE CONFIRMATION",
      consequenceHash: preview.consequenceHash,
      idempotencyKey: "close-account-dry-run-1",
      operationId: "close-account-operation-1",
    }),
  ).rejects.toThrow("CONFIRMATION_INVALID");
  expect((await owner.query(api.profile.get, {}))?.onboardingComplete).toBe(true);
});
