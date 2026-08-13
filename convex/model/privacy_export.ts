import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, query } from "../_generated/server";
import {
  expectedConfirmation,
  snapshotCounts,
  stableHash,
  consequenceForRows,
} from "../domain/privacy_policy";
import { requireOwnedDocument, requireOwnerToken } from "./auth";
import {
  boundedKey,
  countsValidator,
  digestHex,
  exportResult,
  fail,
  internalOperationResult,
  operationResult,
  previewResult,
  privacyKindValidator,
  requireRecentIdentity,
  snapshotResult,
  toOperationResult,
  type ExportReceipt,
} from "./privacy_contract";
import { readBoundedOwnerRows } from "./privacy_snapshot";

const preview = query({
  args: { kind: privacyKindValidator, proofId: v.optional(v.id("evidence")) },
  returns: previewResult,
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    let counts: { files: number; rows: number };
    let objectKey = "all";
    let ownerRows: Awaited<ReturnType<typeof readBoundedOwnerRows>> | undefined;
    if (args.kind === "delete_proof") {
      if (args.proofId === undefined) fail("PROOF_ID_REQUIRED");
      const proof = await requireOwnedDocument(ctx, await ctx.db.get(args.proofId));
      counts = { files: proof.storageId === undefined ? 0 : 1, rows: 1 };
      objectKey = proof._id;
    } else {
      ownerRows = await readBoundedOwnerRows(ctx, ownerToken);
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

const readSnapshot = internalQuery({
  args: { exportedAt: v.number(), ownerToken: v.string() },
  returns: snapshotResult,
  handler: async (ctx, args) => {
    const rows = await readBoundedOwnerRows(ctx, args.ownerToken);
    const storageIds = [
      ...rows.evidence.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
      ...rows.uploads.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
      ...rows.operations.flatMap((row) =>
        row.kind !== "export" || row.archiveStorageId === undefined ? [] : [row.archiveStorageId],
      ),
    ];
    const storageManifest = await Promise.all(
      storageIds.map(async (storageId) => {
        const metadata = await ctx.db.system.get("_storage", storageId);
        if (metadata === null) fail("STORAGE_MANIFEST_INCOMPLETE");
        return {
          contentType: metadata.contentType ?? "application/octet-stream",
          sha256: metadata.sha256,
          size: metadata.size,
          storageId,
        };
      }),
    );
    return {
      counts: snapshotCounts(rows),
      json: JSON.stringify({
        exportedAt: args.exportedAt,
        owner: {
          evidence: rows.evidence,
          pendingUploads: rows.uploads,
          privacyOperations: rows.operations,
          profile: rows.profile,
          questAttempts: rows.attempts,
          quests: rows.quests,
          rewardLedger: rows.ledger,
          rewardRedemptions: rows.redemptions,
          runs: rows.runs,
        },
        schemaVersion: 1,
        storageManifest,
      }),
      storageIds,
    };
  },
});

const findOperation = internalQuery({
  args: { idempotencyKey: v.string() },
  returns: v.union(v.null(), internalOperationResult),
  handler: async (ctx, args) =>
    await ctx.db
      .query("privacyOperations")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique(),
});

const getOperation = internalQuery({
  args: { operationId: v.id("privacyOperations") },
  returns: v.union(v.null(), internalOperationResult),
  handler: async (ctx, args) => await ctx.db.get(args.operationId),
});

const recordExport = internalMutation({
  args: {
    checksum: v.string(),
    counts: countsValidator,
    expiresAt: v.number(),
    idempotencyKey: v.string(),
    operationId: v.string(),
    ownerToken: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.object({ adopted: v.boolean(), operation: operationResult }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("privacyOperations")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing !== null) {
      if (existing.ownerToken !== args.ownerToken || existing.kind !== "export") fail("NOT_FOUND");
      return { adopted: false, operation: toOperationResult(existing) };
    }
    const now = Date.now();
    const id = await ctx.db.insert("privacyOperations", {
      archiveChecksum: args.checksum,
      archiveExpiresAt: args.expiresAt,
      archiveStorageId: args.storageId,
      consequenceHash: stableHash(`export:all:${args.counts.rows}:${args.counts.files}`),
      consequenceVersion: 1,
      counts: args.counts,
      idempotencyKey: args.idempotencyKey,
      kind: "export",
      operationId: args.operationId,
      ownerToken: args.ownerToken,
      requestedAt: now,
      state: "completed",
      updatedAt: now,
    });
    const operation = await ctx.db.get(id);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    await ctx.scheduler.runAfter(Math.max(0, args.expiresAt - now), internal.privacy.expireExport, {
      operationId: id,
    });
    return { adopted: true, operation: toOperationResult(operation) };
  },
});

const expireExport = internalMutation({
  args: { operationId: v.id("privacyOperations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      operation === null ||
      operation.kind !== "export" ||
      operation.archiveStorageId === undefined
    ) {
      return null;
    }
    if (operation.archiveExpiresAt !== undefined && operation.archiveExpiresAt > Date.now()) {
      await ctx.scheduler.runAfter(
        operation.archiveExpiresAt - Date.now(),
        internal.privacy.expireExport,
        args,
      );
      return null;
    }
    await ctx.storage.delete(operation.archiveStorageId);
    await ctx.db.patch(operation._id, { archiveStorageId: undefined, updatedAt: Date.now() });
    return null;
  },
});

const prepareExport = action({
  args: { idempotencyKey: v.string(), operationId: v.string() },
  returns: exportResult,
  handler: async (ctx, args): Promise<ExportReceipt> => {
    const ownerToken = (await requireRecentIdentity(ctx)).tokenIdentifier;
    const idempotencyKey = boundedKey(args.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");
    const existing: Doc<"privacyOperations"> | null = await ctx.runQuery(
      internal.privacy.findOperation,
      { idempotencyKey },
    );
    if (existing !== null) {
      if (
        existing.ownerToken !== ownerToken ||
        existing.kind !== "export" ||
        existing.archiveStorageId === undefined ||
        existing.archiveChecksum === undefined ||
        existing.archiveExpiresAt === undefined
      ) {
        fail("NOT_FOUND");
      }
      return {
        checksum: existing.archiveChecksum,
        counts: existing.counts,
        expiresAt: existing.archiveExpiresAt,
        operationId: existing.operationId,
        schemaVersion: 1,
        storageId: existing.archiveStorageId,
      };
    }
    const now = Date.now();
    const snapshot: {
      counts: { files: number; rows: number };
      json: string;
      storageIds: Id<"_storage">[];
    } = await ctx.runQuery(internal.privacy.readSnapshot, { exportedAt: now, ownerToken });
    const checksum = await digestHex(snapshot.json);
    const storageId = await ctx.storage.store(
      new Blob([snapshot.json], { type: "application/json" }),
    );
    const expiresAt = now + 60 * 60 * 1_000;
    try {
      const recorded: { adopted: boolean } = await ctx.runMutation(internal.privacy.recordExport, {
        checksum,
        counts: snapshot.counts,
        expiresAt,
        idempotencyKey,
        operationId: boundedKey(args.operationId, "OPERATION_ID_INVALID"),
        ownerToken,
        storageId,
      });
      if (!recorded.adopted) {
        await ctx.storage.delete(storageId);
        const winner: Doc<"privacyOperations"> | null = await ctx.runQuery(
          internal.privacy.findOperation,
          { idempotencyKey },
        );
        if (
          winner?.kind !== "export" ||
          winner.archiveStorageId === undefined ||
          winner.archiveChecksum === undefined ||
          winner.archiveExpiresAt === undefined
        ) {
          fail("PRIVACY_WRITE_FAILED");
        }
        return {
          checksum: winner.archiveChecksum,
          counts: winner.counts,
          expiresAt: winner.archiveExpiresAt,
          operationId: winner.operationId,
          schemaVersion: 1,
          storageId: winner.archiveStorageId,
        };
      }
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
    return {
      checksum,
      counts: snapshot.counts,
      expiresAt,
      operationId: args.operationId,
      schemaVersion: 1,
      storageId,
    };
  },
});

const exportDownload = action({
  args: { operationId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args): Promise<string | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) fail("UNAUTHENTICATED");
    const ownerToken = identity.tokenIdentifier;
    const operation: Doc<"privacyOperations">[] = await ctx.runQuery(
      internal.privacy.listRecentOperations,
      { ownerToken },
    );
    const exportOperation = operation.find(
      (row) => row.kind === "export" && row.operationId === args.operationId,
    );
    if (
      exportOperation?.kind !== "export" ||
      exportOperation.archiveStorageId === undefined ||
      exportOperation.archiveExpiresAt === undefined ||
      Date.now() > exportOperation.archiveExpiresAt
    ) {
      return null;
    }
    return await ctx.storage.getUrl(exportOperation.archiveStorageId);
  },
});

const listRecentOperations = internalQuery({
  args: { ownerToken: v.string() },
  returns: v.array(internalOperationResult),
  handler: async (ctx, args) =>
    await ctx.db
      .query("privacyOperations")
      .withIndex("by_ownerToken_and_requestedAt", (q) => q.eq("ownerToken", args.ownerToken))
      .order("desc")
      .take(50),
});

export default {
  expireExport,
  exportDownload,
  findOperation,
  getOperation,
  listRecentOperations,
  prepareExport,
  preview,
  readSnapshot,
  recordExport,
};
