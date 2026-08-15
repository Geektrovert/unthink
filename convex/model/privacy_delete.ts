import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { authComponent, createAuth } from "../auth";
import {
  consequenceForRows,
  expectedConfirmation,
  snapshotCounts,
  stableHash,
} from "../domain/privacy_policy";
import {
  boundedKey,
  deletionKindValidator,
  fail,
  operationResult,
  previewResult,
  privacyKindValidator,
  reconcileStorage,
  requireRecentIdentity,
  toOperationResult,
  type DeletionExecution,
  type PreviewData,
  type PublicOperation,
} from "./privacy_contract";
import { readBoundedOwnerRows } from "./privacy_snapshot";
import { captureBackendOperation } from "../posthog";

const receiptKindValidator = v.union(
  v.literal("delete_proof"),
  v.literal("delete_learning"),
  v.literal("close_account"),
);

type DeletionReceiptBase = {
  consequenceHash: string;
  consequenceVersion: number;
  counts: PreviewData["counts"];
  idempotencyKey: string;
  operationId: string;
  ownerToken: string;
  pendingStorageIds?: Id<"_storage">[];
  requestedAt: number;
  state: "running";
  updatedAt: number;
};
type DeletionReceiptDocument = DeletionReceiptBase & {
  kind: "delete_proof" | "delete_learning";
  requestedObjectId?: string;
};
type FinishDeletePatch = {
  authDeletionStartedAt?: number;
  authUserId?: string;
  failureClass?: string;
  ownerToken?: string;
  pendingStorageIds?: Id<"_storage">[];
  state: "completed" | "failed";
  updatedAt: number;
};

function pendingStorageIds(operation: Doc<"privacyOperations">) {
  return operation.kind === "export" ? [] : (operation.pendingStorageIds ?? []);
}

const executeDelete = internalMutation({
  args: {
    consequenceHash: v.string(),
    idempotencyKey: v.string(),
    kind: deletionKindValidator,
    operationId: v.string(),
    ownerToken: v.string(),
    proofId: v.optional(v.id("evidence")),
    receiptKind: receiptKindValidator,
  },
  returns: v.object({ operation: operationResult, storageIds: v.array(v.id("_storage")) }),
  handler: async (ctx, args): Promise<DeletionExecution> => {
    const existing = await ctx.db
      .query("privacyOperations")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing !== null) {
      if (existing.ownerToken !== args.ownerToken || existing.kind !== args.receiptKind) {
        fail("NOT_FOUND");
      }
      return {
        operation: toOperationResult(existing),
        storageIds: pendingStorageIds(existing),
      };
    }
    const now = Date.now();
    let counts = { files: 0, rows: 0 };
    const storageIds: Id<"_storage">[] = [];
    if (args.kind === "delete_proof") {
      if (args.proofId === undefined) fail("PROOF_ID_REQUIRED");
      const proof = await ctx.db.get("evidence", args.proofId);
      if (proof === null || proof.ownerToken !== args.ownerToken) fail("NOT_FOUND");
      const run = await ctx.db
        .query("runs")
        .withIndex("by_questId", (q) => q.eq("questId", proof.questId))
        .unique();
      if (run === null || run.ownerToken !== args.ownerToken) fail("COMPLETION_RECEIPT_INVALID");
      if (proof.storageId !== undefined) storageIds.push(proof.storageId);
      counts = { files: storageIds.length, rows: 1 };
      await ctx.db.patch("runs", run._id, { evidenceId: undefined, proofDeletedAt: now });
      await ctx.db.delete("evidence", proof._id);
    } else {
      const rows = await readBoundedOwnerRows(ctx, args.ownerToken);
      const transactionHash = consequenceForRows(args.receiptKind, rows);
      if (transactionHash !== args.consequenceHash) fail("PREVIEW_STALE");
      storageIds.push(
        ...rows.evidence.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
        ...rows.uploads.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
        ...rows.operations.flatMap((row) =>
          row.kind !== "export" || row.archiveStorageId === undefined ? [] : [row.archiveStorageId],
        ),
      );
      counts = { ...snapshotCounts(rows), files: storageIds.length };
      for (const row of rows.attempts) await ctx.db.delete("questAttempts", row._id);
      for (const row of rows.evidence) await ctx.db.delete("evidence", row._id);
      for (const row of rows.uploads) await ctx.db.delete("pendingUploads", row._id);
      for (const row of rows.ledger) await ctx.db.delete("rewardLedger", row._id);
      for (const row of rows.redemptions) await ctx.db.delete("rewardRedemptions", row._id);
      for (const row of rows.runs) await ctx.db.delete("runs", row._id);
      for (const row of rows.quests) await ctx.db.delete("quests", row._id);
      for (const row of rows.operations) await ctx.db.delete("privacyOperations", row._id);
      if (rows.profile !== null) await ctx.db.delete("profiles", rows.profile._id);
    }
    const receipt: DeletionReceiptBase = {
      consequenceHash: args.consequenceHash,
      consequenceVersion: 1,
      counts,
      idempotencyKey: args.idempotencyKey,
      operationId: args.operationId,
      ownerToken: args.ownerToken,
      requestedAt: now,
      state: "running",
      updatedAt: now,
    };
    if (storageIds.length > 0) receipt.pendingStorageIds = storageIds;
    let id: Id<"privacyOperations">;
    if (args.receiptKind === "close_account") {
      id = await ctx.db.insert("privacyOperations", { ...receipt, kind: "close_account" });
    } else {
      const deletionReceipt: DeletionReceiptDocument = {
        ...receipt,
        kind: args.receiptKind,
      };
      if (args.proofId !== undefined) deletionReceipt.requestedObjectId = args.proofId;
      id = await ctx.db.insert("privacyOperations", deletionReceipt);
    }
    const operation = await ctx.db.get("privacyOperations", id);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    return { operation: toOperationResult(operation), storageIds };
  },
});

const markAuthDeletionPending = internalMutation({
  args: {
    authUserId: v.string(),
    operationId: v.id("privacyOperations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get("privacyOperations", args.operationId);
    if (operation === null || operation.kind !== "close_account") fail("PRIVACY_WRITE_FAILED");
    const now = Date.now();
    await ctx.db.patch("privacyOperations", operation._id, {
      authDeletionStartedAt: now,
      authUserId: args.authUserId,
      failureClass: undefined,
      state: "running",
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(5_000, internal.privacy.reconcileAccountClosure, {
      operationId: operation._id,
    });
    return null;
  },
});

const finishDelete = internalMutation({
  args: {
    failureClass: v.optional(v.string()),
    operationId: v.id("privacyOperations"),
  },
  returns: operationResult,
  handler: async (ctx, args) => {
    const current = await ctx.db.get("privacyOperations", args.operationId);
    if (current === null) fail("PRIVACY_WRITE_FAILED");
    const completedClosure = args.failureClass === undefined && current.kind === "close_account";
    const patch: FinishDeletePatch = {
      state: args.failureClass === undefined ? "completed" : "failed",
      updatedAt: Date.now(),
    };
    if (args.failureClass === undefined) {
      patch.failureClass = undefined;
      patch.pendingStorageIds = undefined;
    } else {
      patch.failureClass = args.failureClass;
      if (args.failureClass === "AUTH_RECONCILIATION_FAILED") {
        patch.pendingStorageIds = undefined;
      }
    }
    if (completedClosure) {
      patch.authDeletionStartedAt = undefined;
      patch.authUserId = undefined;
      patch.ownerToken = undefined;
    }
    await ctx.db.patch("privacyOperations", args.operationId, patch);
    const operation = await ctx.db.get("privacyOperations", args.operationId);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    return toOperationResult(operation);
  },
});

const reconcileAccountClosure = internalAction({
  args: { operationId: v.id("privacyOperations") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const operation: Doc<"privacyOperations"> | null = await ctx.runQuery(
      internal.privacy.getOperation,
      args,
    );
    if (
      operation === null ||
      operation.kind !== "close_account" ||
      operation.state !== "running" ||
      operation.authUserId === undefined ||
      operation.authDeletionStartedAt === undefined
    ) {
      return null;
    }
    const authUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: operation.authUserId }],
    });
    if (authUser === null) {
      await ctx.runMutation(internal.privacy.finishDelete, { operationId: operation._id });
      return null;
    }
    const elapsed = Date.now() - operation.authDeletionStartedAt;
    if (elapsed < 2 * 60 * 1_000) {
      await ctx.scheduler.runAfter(5_000, internal.privacy.reconcileAccountClosure, args);
      return null;
    }
    await ctx.runMutation(internal.privacy.finishDelete, {
      failureClass: "AUTH_RECONCILIATION_FAILED",
      operationId: operation._id,
    });
    return null;
  },
});

const markStorageReconciled = internalMutation({
  args: { operationId: v.id("privacyOperations"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get("privacyOperations", args.operationId);
    if (operation === null || operation.kind === "export") fail("PRIVACY_WRITE_FAILED");
    await ctx.db.patch("privacyOperations", operation._id, {
      pendingStorageIds: operation.pendingStorageIds?.filter((id) => id !== args.storageId),
      updatedAt: Date.now(),
    });
    return null;
  },
});

const confirmDelete = action({
  args: {
    confirmation: v.string(),
    consequenceHash: v.string(),
    idempotencyKey: v.string(),
    kind: deletionKindValidator,
    operationId: v.string(),
    proofId: v.optional(v.id("evidence")),
  },
  returns: operationResult,
  handler: async (ctx, args): Promise<PublicOperation> => {
    const telemetryStartedAt = Date.now();
    const ownerToken = (await requireRecentIdentity(ctx)).tokenIdentifier;
    const idempotencyKey = boundedKey(args.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");
    const operationId = boundedKey(args.operationId, "OPERATION_ID_INVALID");
    const journey = args.kind === "delete_proof" ? "delete_proof" : "delete_learning_data";

    async function withTelemetry(result: PublicOperation, idempotentReplay: boolean) {
      await captureBackendOperation(ctx, {
        durationMs: Date.now() - telemetryStartedAt,
        failureClass: result.failureClass,
        fileCount: result.counts.files,
        idempotentReplay,
        journey,
        operationId,
        outcome: result.state === "completed" ? "succeeded" : "expected_failure",
        rowCount: result.counts.rows,
      });
      return result;
    }

    const existing: Doc<"privacyOperations"> | null = await ctx.runQuery(
      internal.privacy.findOperation,
      { idempotencyKey },
    );
    if (existing !== null) {
      if (existing.ownerToken !== ownerToken || existing.kind !== args.kind) fail("NOT_FOUND");
      if (existing.state === "completed") {
        return await withTelemetry(toOperationResult(existing), true);
      }
      const storageFailed = await reconcileStorage(
        ctx,
        existing._id,
        existing.pendingStorageIds ?? [],
      );
      const result = storageFailed
        ? await ctx.runMutation(internal.privacy.finishDelete, {
            failureClass: "STORAGE_RECONCILIATION_FAILED",
            operationId: existing._id,
          })
        : await ctx.runMutation(internal.privacy.finishDelete, {
            operationId: existing._id,
          });
      return await withTelemetry(result, true);
    }
    if (args.confirmation !== expectedConfirmation(args.kind)) fail("CONFIRMATION_INVALID");
    const previewData: PreviewData =
      args.kind === "delete_proof"
        ? await ctx.runQuery(internal.privacy.previewForAction, {
            kind: args.kind,
            ownerToken,
            proofId: args.proofId,
          })
        : await ctx.runQuery(internal.privacy.previewForAction, { kind: args.kind, ownerToken });
    if (previewData.consequenceHash !== args.consequenceHash) fail("PREVIEW_STALE");
    const deletion: DeletionExecution = await ctx.runMutation(
      internal.privacy.executeDelete,
      args.proofId === undefined
        ? {
            consequenceHash: args.consequenceHash,
            idempotencyKey,
            kind: args.kind,
            operationId,
            ownerToken,
            receiptKind: args.kind,
          }
        : {
            consequenceHash: args.consequenceHash,
            idempotencyKey,
            kind: args.kind,
            operationId,
            ownerToken,
            receiptKind: args.kind,
            proofId: args.proofId,
          },
    );
    const failed = await reconcileStorage(ctx, deletion.operation._id, deletion.storageIds);
    const result: PublicOperation = failed
      ? await ctx.runMutation(internal.privacy.finishDelete, {
          failureClass: "STORAGE_RECONCILIATION_FAILED",
          operationId: deletion.operation._id,
        })
      : await ctx.runMutation(internal.privacy.finishDelete, {
          operationId: deletion.operation._id,
        });
    return await withTelemetry(result, false);
  },
});

const previewForAction = internalQuery({
  args: {
    kind: privacyKindValidator,
    ownerToken: v.string(),
    proofId: v.optional(v.id("evidence")),
  },
  returns: previewResult,
  handler: async (ctx, args): Promise<PreviewData> => {
    let counts: PreviewData["counts"];
    let objectKey = "all";
    let ownerRows: Awaited<ReturnType<typeof readBoundedOwnerRows>> | undefined;
    if (args.kind === "delete_proof") {
      if (args.proofId === undefined) fail("PROOF_ID_REQUIRED");
      const proof = await ctx.db.get("evidence", args.proofId);
      if (proof === null || proof.ownerToken !== args.ownerToken) fail("NOT_FOUND");
      counts = { files: proof.storageId === undefined ? 0 : 1, rows: 1 };
      objectKey = proof._id;
    } else {
      ownerRows = await readBoundedOwnerRows(ctx, args.ownerToken);
      counts = snapshotCounts(ownerRows);
    }
    return {
      confirmation: expectedConfirmation(args.kind),
      consequenceHash:
        args.kind === "delete_proof"
          ? stableHash(`${args.kind}:${objectKey}:${counts.rows}:${counts.files}`)
          : consequenceForRows(args.kind, ownerRows!),
      consequenceVersion: 1,
      counts,
    };
  },
});

const closeAccount = action({
  args: {
    confirmation: v.string(),
    consequenceHash: v.string(),
    idempotencyKey: v.string(),
    operationId: v.string(),
  },
  returns: operationResult,
  handler: async (ctx, args): Promise<PublicOperation> => {
    const identity = await requireRecentIdentity(ctx);
    const ownerToken = identity.tokenIdentifier;
    const authUserId = identity.subject;
    const idempotencyKey = boundedKey(args.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");
    const existing: Doc<"privacyOperations"> | null = await ctx.runQuery(
      internal.privacy.findOperation,
      { idempotencyKey },
    );
    if (existing !== null) {
      if (existing.ownerToken !== ownerToken || existing.kind !== "close_account")
        fail("NOT_FOUND");
      if (existing.state === "completed") return toOperationResult(existing);
      const storageFailed = await reconcileStorage(
        ctx,
        existing._id,
        existing.pendingStorageIds ?? [],
      );
      if (storageFailed) {
        return await ctx.runMutation(internal.privacy.finishDelete, {
          failureClass: "STORAGE_RECONCILIATION_FAILED",
          operationId: existing._id,
        });
      }
      await ctx.runMutation(internal.privacy.markAuthDeletionPending, {
        authUserId,
        operationId: existing._id,
      });
      try {
        const headers = await authComponent.getHeaders(ctx);
        await createAuth(ctx).api.deleteUser({ body: {}, headers });
      } catch {
        return await ctx.runMutation(internal.privacy.finishDelete, {
          failureClass: "AUTH_RECONCILIATION_FAILED",
          operationId: existing._id,
        });
      }
      return await ctx.runMutation(internal.privacy.finishDelete, {
        operationId: existing._id,
      });
    }
    if (args.confirmation !== "CLOSE ACCOUNT") fail("CONFIRMATION_INVALID");
    const previewData: PreviewData = await ctx.runQuery(internal.privacy.previewForAction, {
      kind: "close_account",
      ownerToken,
    });
    if (previewData.consequenceHash !== args.consequenceHash) fail("PREVIEW_STALE");
    const deletion: { operation: PublicOperation; storageIds: Id<"_storage">[] } =
      await ctx.runMutation(internal.privacy.executeDelete, {
        consequenceHash: args.consequenceHash,
        idempotencyKey,
        kind: "delete_learning",
        operationId: boundedKey(args.operationId, "OPERATION_ID_INVALID"),
        ownerToken,
        receiptKind: "close_account",
      });
    const storageFailed = await reconcileStorage(ctx, deletion.operation._id, deletion.storageIds);
    let authFailed = false;
    if (!storageFailed) {
      await ctx.runMutation(internal.privacy.markAuthDeletionPending, {
        authUserId,
        operationId: deletion.operation._id,
      });
      try {
        const headers = await authComponent.getHeaders(ctx);
        await createAuth(ctx).api.deleteUser({ body: {}, headers });
      } catch {
        authFailed = true;
      }
    }
    const failureClass = storageFailed
      ? "STORAGE_RECONCILIATION_FAILED"
      : authFailed
        ? "AUTH_RECONCILIATION_FAILED"
        : null;
    const result: PublicOperation =
      failureClass === null
        ? await ctx.runMutation(internal.privacy.finishDelete, {
            operationId: deletion.operation._id,
          })
        : await ctx.runMutation(internal.privacy.finishDelete, {
            failureClass,
            operationId: deletion.operation._id,
          });
    return result;
  },
});

export default {
  closeAccount,
  confirmDelete,
  executeDelete,
  finishDelete,
  markAuthDeletionPending,
  markStorageReconciled,
  previewForAction,
  reconcileAccountClosure,
};
