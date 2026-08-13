import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { PrivacyKind } from "../domain/privacy_policy";
import {
  privacyClosureOperationFields,
  privacyCountsValidator,
  privacyDeletionOperationFields,
  privacyExportOperationFields,
  privacyKindValidator,
  privacyOperationBaseFields,
} from "../schema";

export const deletionKindValidator = v.union(
  v.literal("delete_proof"),
  v.literal("delete_learning"),
);
export const countsValidator = privacyCountsValidator;
export const operationResult = v.object({
  ...privacyOperationBaseFields,
  _creationTime: v.number(),
  _id: v.id("privacyOperations"),
  kind: privacyKindValidator,
  requestedObjectId: v.optional(v.string()),
});
const systemFields = { _creationTime: v.number(), _id: v.id("privacyOperations") } as const;
export const internalOperationResult = v.union(
  privacyExportOperationFields.extend(systemFields),
  privacyDeletionOperationFields.extend(systemFields),
  privacyClosureOperationFields.extend(systemFields),
);
export const previewResult = v.object({
  confirmation: v.string(),
  consequenceHash: v.string(),
  consequenceVersion: v.number(),
  counts: countsValidator,
});
export const snapshotResult = v.object({
  counts: countsValidator,
  json: v.string(),
  storageIds: v.array(v.id("_storage")),
});
export const exportResult = v.object({
  checksum: v.string(),
  counts: countsValidator,
  expiresAt: v.number(),
  operationId: v.string(),
  schemaVersion: v.number(),
  storageId: v.id("_storage"),
});

export type PublicOperation = ReturnType<typeof toOperationResult>;
export type ExportReceipt = {
  checksum: string;
  counts: { files: number; rows: number };
  expiresAt: number;
  operationId: string;
  schemaVersion: number;
  storageId: Id<"_storage">;
};
export type PreviewData = {
  confirmation: string;
  consequenceHash: string;
  consequenceVersion: number;
  counts: { files: number; rows: number };
};
export type DeletionExecution = { operation: PublicOperation; storageIds: Id<"_storage">[] };

export function fail(code: string): never {
  throw new ConvexError(code);
}

export function boundedKey(value: string, code: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 120) fail(code);
  return key;
}

export function toOperationResult(value: {
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

export async function requireRecentIdentity(ctx: ActionCtx) {
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
  return identity;
}

export async function digestHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reconcileStorage(
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

export { privacyKindValidator };
