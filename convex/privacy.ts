import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireOwnedDocument, requireOwnerToken } from "./model/auth";

const privacyKindValidator = v.union(
  v.literal("export"),
  v.literal("delete_proof"),
  v.literal("delete_learning"),
  v.literal("close_account"),
);
const deletionKindValidator = v.union(v.literal("delete_proof"), v.literal("delete_learning"));
const countsValidator = v.object({ files: v.number(), rows: v.number() });
const operationResult = v.object({
  _creationTime: v.number(),
  _id: v.id("privacyOperations"),
  consequenceHash: v.string(),
  consequenceVersion: v.number(),
  counts: countsValidator,
  failureClass: v.optional(v.string()),
  idempotencyKey: v.string(),
  kind: privacyKindValidator,
  operationId: v.string(),
  requestedObjectId: v.optional(v.string()),
  requestedAt: v.number(),
  state: v.union(
    v.literal("prepared"),
    v.literal("confirmed"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  updatedAt: v.number(),
});
const internalOperationResult = operationResult.extend({
  archiveChecksum: v.optional(v.string()),
  archiveExpiresAt: v.optional(v.number()),
  archiveStorageId: v.optional(v.id("_storage")),
  ownerToken: v.optional(v.string()),
  pendingStorageIds: v.optional(v.array(v.id("_storage"))),
});
const previewResult = v.object({
  confirmation: v.string(),
  consequenceHash: v.string(),
  consequenceVersion: v.number(),
  counts: countsValidator,
});
const snapshotResult = v.object({
  counts: countsValidator,
  json: v.string(),
  storageIds: v.array(v.id("_storage")),
});
const exportResult = v.object({
  checksum: v.string(),
  counts: countsValidator,
  expiresAt: v.number(),
  operationId: v.string(),
  schemaVersion: v.number(),
  storageId: v.id("_storage"),
});

type PrivacyKind = "export" | "delete_proof" | "delete_learning" | "close_account";
type PublicOperation = ReturnType<typeof toOperationResult>;
type ExportReceipt = {
  checksum: string;
  counts: { files: number; rows: number };
  expiresAt: number;
  operationId: string;
  schemaVersion: number;
  storageId: Id<"_storage">;
};
type PreviewData = {
  confirmation: string;
  consequenceHash: string;
  consequenceVersion: number;
  counts: { files: number; rows: number };
};
type DeletionExecution = { operation: PublicOperation; storageIds: Id<"_storage">[] };

function fail(code: string): never {
  throw new ConvexError(code);
}

function boundedKey(value: string, code: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 120) fail(code);
  return key;
}

function toOperationResult(value: {
  _creationTime: number;
  _id: Id<"privacyOperations">;
  consequenceHash: string;
  consequenceVersion: number;
  counts: { files: number; rows: number };
  failureClass?: string;
  idempotencyKey: string;
  kind: PrivacyKind;
  operationId: string;
  requestedObjectId?: string;
  requestedAt: number;
  state: "prepared" | "confirmed" | "running" | "completed" | "failed";
  updatedAt: number;
}) {
  return {
    _creationTime: value._creationTime,
    _id: value._id,
    consequenceHash: value.consequenceHash,
    consequenceVersion: value.consequenceVersion,
    counts: value.counts,
    ...(value.failureClass === undefined ? {} : { failureClass: value.failureClass }),
    idempotencyKey: value.idempotencyKey,
    kind: value.kind,
    operationId: value.operationId,
    ...(value.requestedObjectId === undefined
      ? {}
      : { requestedObjectId: value.requestedObjectId }),
    requestedAt: value.requestedAt,
    state: value.state,
    updatedAt: value.updatedAt,
  };
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function rowManifest(rows: Awaited<ReturnType<typeof readBoundedOwnerRows>>) {
  const entries = [
    ...(rows.profile === null ? [] : [`profiles:${rows.profile._id}:${rows.profile.updatedAt}`]),
    ...rows.quests.map((row) => `quests:${row._id}:${row.updatedAt}`),
    ...rows.attempts.map((row) => `questAttempts:${row._id}:${row.savedAt}`),
    ...rows.evidence.map((row) => `evidence:${row._id}:${row.createdAt}`),
    ...rows.uploads.map((row) => `pendingUploads:${row._id}:${row.expiresAt}`),
    ...rows.ledger.map((row) => `rewardLedger:${row._id}:${row.createdAt}`),
    ...rows.redemptions.map((row) => `rewardRedemptions:${row._id}:${row.updatedAt}`),
    ...rows.runs.map((row) => `runs:${row._id}:${row.endedAt}`),
    ...rows.operations.map((row) => `privacyOperations:${row._id}:${row.updatedAt}`),
  ];
  return stableHash(entries.sort().join("|"));
}

function consequenceForRows(
  kind: PrivacyKind,
  rows: Awaited<ReturnType<typeof readBoundedOwnerRows>>,
) {
  const counts = snapshotCounts(rows);
  return stableHash(`${kind}:all:${counts.rows}:${counts.files}:${rowManifest(rows)}`);
}

async function readBoundedOwnerRows(ctx: QueryCtx | MutationCtx, ownerToken: string) {
  const maximum = 500;
  const [profile, quests, attempts, evidence, uploads, ledger, redemptions, runs, operations] =
    await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .unique(),
      ctx.db
        .query("quests")
        .withIndex("by_ownerToken_and_dayKey", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("questAttempts")
        .withIndex("by_ownerToken_and_savedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("evidence")
        .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("pendingUploads")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("rewardLedger")
        .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("rewardRedemptions")
        .withIndex("by_ownerToken_and_redeemedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("runs")
        .withIndex("by_ownerToken_and_startedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
      ctx.db
        .query("privacyOperations")
        .withIndex("by_ownerToken_and_requestedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximum + 1),
    ]);
  const groups = [quests, attempts, evidence, uploads, ledger, redemptions, runs, operations];
  if (groups.some((rows) => rows.length > maximum)) fail("PRIVACY_OPERATION_TOO_LARGE");
  return { attempts, evidence, ledger, operations, profile, quests, redemptions, runs, uploads };
}

function snapshotCounts(rows: Awaited<ReturnType<typeof readBoundedOwnerRows>>) {
  const groups = [
    rows.quests,
    rows.attempts,
    rows.evidence,
    rows.uploads,
    rows.ledger,
    rows.redemptions,
    rows.runs,
    rows.operations,
  ];
  return {
    files:
      rows.evidence.filter(({ storageId }) => storageId !== undefined).length +
      rows.uploads.filter(({ storageId }) => storageId !== undefined).length +
      rows.operations.filter(({ archiveStorageId }) => archiveStorageId !== undefined).length,
    rows:
      (rows.profile === null ? 0 : 1) + groups.reduce((total, group) => total + group.length, 0),
  };
}

function expectedConfirmation(kind: PrivacyKind) {
  switch (kind) {
    case "export":
      return "EXPORT MY DATA";
    case "delete_proof":
      return "DELETE PROOF";
    case "delete_learning":
      return "DELETE ALL LEARNING";
    case "close_account":
      return "CLOSE ACCOUNT";
  }
}

async function requireRecentOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) fail("UNAUTHENTICATED");
  const createdAt = identity.authSessionCreatedAt;
  if (
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    createdAt > Date.now() + 5_000 ||
    Date.now() - createdAt > 5 * 60 * 1_000
  ) {
    fail("RECENT_AUTH_REQUIRED");
  }
  return identity.tokenIdentifier;
}

async function digestHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reconcileStorage(
  ctx: ActionCtx,
  operationId: Id<"privacyOperations">,
  storageIds: Id<"_storage">[],
) {
  let failed = false;
  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
      await ctx.runMutation(internal.privacy.markStorageReconciled, { operationId, storageId });
    } catch {
      failed = true;
    }
  }
  return failed;
}

export const preview = query({
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

export const readSnapshot = internalQuery({
  args: { exportedAt: v.number(), ownerToken: v.string() },
  returns: snapshotResult,
  handler: async (ctx, args) => {
    const rows = await readBoundedOwnerRows(ctx, args.ownerToken);
    const storageIds = [
      ...rows.evidence.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
      ...rows.uploads.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
      ...rows.operations.flatMap(({ archiveStorageId }) =>
        archiveStorageId === undefined ? [] : [archiveStorageId],
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

export const findOperation = internalQuery({
  args: { idempotencyKey: v.string() },
  returns: v.union(v.null(), internalOperationResult),
  handler: async (ctx, args) =>
    await ctx.db
      .query("privacyOperations")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique(),
});

export const recordExport = internalMutation({
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

export const expireExport = internalMutation({
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

export const prepareExport = action({
  args: { idempotencyKey: v.string(), operationId: v.string() },
  returns: exportResult,
  handler: async (ctx, args): Promise<ExportReceipt> => {
    const ownerToken = await requireRecentOwner(ctx);
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
          winner?.archiveStorageId === undefined ||
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

export const exportDownload = action({
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
    const exportOperation = operation.find(({ operationId }) => operationId === args.operationId);
    if (
      exportOperation?.archiveStorageId === undefined ||
      exportOperation.archiveExpiresAt === undefined ||
      Date.now() > exportOperation.archiveExpiresAt
    ) {
      return null;
    }
    return await ctx.storage.getUrl(exportOperation.archiveStorageId);
  },
});

export const listRecentOperations = internalQuery({
  args: { ownerToken: v.string() },
  returns: v.array(internalOperationResult),
  handler: async (ctx, args) =>
    await ctx.db
      .query("privacyOperations")
      .withIndex("by_ownerToken_and_requestedAt", (q) => q.eq("ownerToken", args.ownerToken))
      .order("desc")
      .take(50),
});

export const executeDelete = internalMutation({
  args: {
    consequenceHash: v.string(),
    idempotencyKey: v.string(),
    kind: deletionKindValidator,
    operationId: v.string(),
    ownerToken: v.string(),
    proofId: v.optional(v.id("evidence")),
    receiptKind: privacyKindValidator,
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
        storageIds: existing.pendingStorageIds ?? [],
      };
    }
    const now = Date.now();
    let counts = { files: 0, rows: 0 };
    const storageIds: Id<"_storage">[] = [];
    if (args.kind === "delete_proof") {
      if (args.proofId === undefined) fail("PROOF_ID_REQUIRED");
      const proof = await ctx.db.get(args.proofId);
      if (proof === null || proof.ownerToken !== args.ownerToken) fail("NOT_FOUND");
      if (proof.storageId !== undefined) storageIds.push(proof.storageId);
      counts = { files: storageIds.length, rows: 1 };
      await ctx.db.delete(proof._id);
    } else {
      const rows = await readBoundedOwnerRows(ctx, args.ownerToken);
      const transactionHash = consequenceForRows(args.receiptKind, rows);
      if (transactionHash !== args.consequenceHash) fail("PREVIEW_STALE");
      storageIds.push(
        ...rows.evidence.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
        ...rows.uploads.flatMap(({ storageId }) => (storageId === undefined ? [] : [storageId])),
        ...rows.operations.flatMap(({ archiveStorageId }) =>
          archiveStorageId === undefined ? [] : [archiveStorageId],
        ),
      );
      counts = { ...snapshotCounts(rows), files: storageIds.length };
      for (const row of rows.attempts) await ctx.db.delete(row._id);
      for (const row of rows.evidence) await ctx.db.delete(row._id);
      for (const row of rows.uploads) await ctx.db.delete(row._id);
      for (const row of rows.ledger) await ctx.db.delete(row._id);
      for (const row of rows.redemptions) await ctx.db.delete(row._id);
      for (const row of rows.runs) await ctx.db.delete(row._id);
      for (const row of rows.quests) await ctx.db.delete(row._id);
      for (const row of rows.operations) await ctx.db.delete(row._id);
      if (rows.profile !== null) await ctx.db.delete(rows.profile._id);
    }
    const id = await ctx.db.insert("privacyOperations", {
      consequenceHash: args.consequenceHash,
      consequenceVersion: 1,
      counts,
      idempotencyKey: args.idempotencyKey,
      kind: args.receiptKind,
      operationId: args.operationId,
      ownerToken: args.ownerToken,
      ...(storageIds.length === 0 ? {} : { pendingStorageIds: storageIds }),
      ...(args.proofId === undefined ? {} : { requestedObjectId: args.proofId }),
      requestedAt: now,
      state: "running",
      updatedAt: now,
    });
    const operation = await ctx.db.get(id);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    return { operation: toOperationResult(operation), storageIds };
  },
});

export const finishDelete = internalMutation({
  args: {
    failureClass: v.optional(v.string()),
    operationId: v.id("privacyOperations"),
  },
  returns: operationResult,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.operationId, {
      ...(args.failureClass === undefined
        ? { failureClass: undefined, pendingStorageIds: undefined }
        : args.failureClass === "AUTH_RECONCILIATION_FAILED"
          ? { failureClass: args.failureClass, pendingStorageIds: undefined }
          : { failureClass: args.failureClass }),
      state: args.failureClass === undefined ? "completed" : "failed",
      updatedAt: Date.now(),
    });
    const operation = await ctx.db.get(args.operationId);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    return toOperationResult(operation);
  },
});

export const markStorageReconciled = internalMutation({
  args: { operationId: v.id("privacyOperations"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation === null) fail("PRIVACY_WRITE_FAILED");
    await ctx.db.patch(operation._id, {
      pendingStorageIds: operation.pendingStorageIds?.filter((id) => id !== args.storageId),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const confirmDelete = action({
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
    const ownerToken = await requireRecentOwner(ctx);
    const idempotencyKey = boundedKey(args.idempotencyKey, "IDEMPOTENCY_KEY_INVALID");
    const existing: Doc<"privacyOperations"> | null = await ctx.runQuery(
      internal.privacy.findOperation,
      { idempotencyKey },
    );
    if (existing !== null) {
      if (existing.ownerToken !== ownerToken || existing.kind !== args.kind) fail("NOT_FOUND");
      if (existing.state === "completed") return toOperationResult(existing);
      const storageFailed = await reconcileStorage(
        ctx,
        existing._id,
        existing.pendingStorageIds ?? [],
      );
      return await ctx.runMutation(internal.privacy.finishDelete, {
        ...(storageFailed ? { failureClass: "STORAGE_RECONCILIATION_FAILED" } : {}),
        operationId: existing._id,
      });
    }
    if (args.confirmation !== expectedConfirmation(args.kind)) fail("CONFIRMATION_INVALID");
    const previewData: {
      confirmation: string;
      consequenceHash: string;
      consequenceVersion: number;
      counts: { files: number; rows: number };
    } =
      args.kind === "delete_proof"
        ? await ctx.runQuery(internal.privacy.previewForAction, {
            kind: args.kind,
            ownerToken,
            proofId: args.proofId,
          })
        : await ctx.runQuery(internal.privacy.previewForAction, { kind: args.kind, ownerToken });
    if (previewData.consequenceHash !== args.consequenceHash) fail("PREVIEW_STALE");
    const deletion: { operation: PublicOperation; storageIds: Id<"_storage">[] } =
      await ctx.runMutation(internal.privacy.executeDelete, {
        consequenceHash: args.consequenceHash,
        idempotencyKey,
        kind: args.kind,
        operationId: boundedKey(args.operationId, "OPERATION_ID_INVALID"),
        ownerToken,
        receiptKind: args.kind,
        ...(args.proofId === undefined ? {} : { proofId: args.proofId }),
      });
    const failed = await reconcileStorage(ctx, deletion.operation._id, deletion.storageIds);
    const result: PublicOperation = await ctx.runMutation(internal.privacy.finishDelete, {
      ...(failed ? { failureClass: "STORAGE_RECONCILIATION_FAILED" } : {}),
      operationId: deletion.operation._id,
    });
    return result;
  },
});

export const previewForAction = internalQuery({
  args: {
    kind: privacyKindValidator,
    ownerToken: v.string(),
    proofId: v.optional(v.id("evidence")),
  },
  returns: previewResult,
  handler: async (ctx, args): Promise<PreviewData> => {
    let counts: { files: number; rows: number };
    let objectKey = "all";
    let ownerRows: Awaited<ReturnType<typeof readBoundedOwnerRows>> | undefined;
    if (args.kind === "delete_proof") {
      if (args.proofId === undefined) fail("PROOF_ID_REQUIRED");
      const proof = await ctx.db.get(args.proofId);
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

export const closeAccount = action({
  args: {
    confirmation: v.string(),
    consequenceHash: v.string(),
    idempotencyKey: v.string(),
    operationId: v.string(),
  },
  returns: operationResult,
  handler: async (ctx, args): Promise<PublicOperation> => {
    const ownerToken = await requireRecentOwner(ctx);
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
      try {
        const headers = await authComponent.getHeaders(ctx);
        await createAuth(ctx).api.deleteUser({ body: {}, headers });
      } catch {
        authFailed = true;
      }
    }
    const result: PublicOperation = await ctx.runMutation(internal.privacy.finishDelete, {
      ...(storageFailed || authFailed
        ? {
            failureClass: storageFailed
              ? "STORAGE_RECONCILIATION_FAILED"
              : "AUTH_RECONCILIATION_FAILED",
          }
        : {}),
      operationId: deletion.operation._id,
    });
    return result;
  },
});
