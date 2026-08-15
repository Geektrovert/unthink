import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { requireOwnedDocument, requireOwnedQuest, requireOwnerToken } from "./model/auth";
import { withoutOwner } from "./model/documents";
import { captureBackendException } from "./posthog";
import { evidenceFields } from "./schema";

const evidenceResult = evidenceFields.omit("ownerToken").extend({
  _creationTime: v.number(),
  _id: v.id("evidence"),
});
const evidenceDetailResult = evidenceResult.extend({
  quest: v.object({
    doneCondition: v.string(),
    mode: v.union(v.literal("rescue"), v.literal("standard"), v.literal("deep")),
    objective: v.string(),
    title: v.string(),
  }),
  reward: v.array(
    v.object({
      amount: v.number(),
      awardKind: v.union(
        v.literal("proof"),
        v.literal("retrieval-check"),
        v.literal("bridge-or-contribution"),
      ),
    }),
  ),
  signedStorageUrl: v.union(v.null(), v.string()),
});

export const prepareDirectUpload = internalMutation({
  args: {
    expectedContentType: v.string(),
    expectedSize: v.number(),
    questId: v.id("quests"),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const quest = await requireOwnedQuest(ctx, await ctx.db.get("quests", args.questId));
    const allowedTypes = ["image/png", "image/jpeg", "application/pdf", "audio/mpeg", "text/plain"];
    if (
      quest.status !== "active" ||
      !allowedTypes.includes(args.expectedContentType) ||
      !Number.isInteger(args.expectedSize) ||
      args.expectedSize <= 0 ||
      args.expectedSize > 10 * 1024 * 1024
    ) {
      throw new ConvexError("UPLOAD_NOT_ALLOWED");
    }
    const uploadToken = args.uploadToken.trim();
    if (uploadToken.length < 8 || uploadToken.length > 120) {
      throw new ConvexError("UPLOAD_TOKEN_INVALID");
    }
    const ownerToken = await requireOwnerToken(ctx);
    const pending = await ctx.db
      .query("pendingUploads")
      .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
      .take(6);
    const existing = await ctx.db
      .query("pendingUploads")
      .withIndex("by_uploadToken", (q) => q.eq("uploadToken", uploadToken))
      .unique();
    if (existing !== null) {
      if (
        existing.ownerToken !== ownerToken ||
        existing.questId !== quest._id ||
        existing.contentType !== args.expectedContentType ||
        existing.size !== args.expectedSize ||
        existing.storageId !== undefined ||
        existing.expiresAt < Date.now()
      ) {
        throw new ConvexError("UPLOAD_NOT_ALLOWED");
      }
      return null;
    }
    if (pending.length >= 5) throw new ConvexError("UPLOAD_LIMIT_REACHED");
    const uploadId = await ctx.db.insert("pendingUploads", {
      contentType: args.expectedContentType,
      expiresAt: Date.now() + 60 * 60 * 1_000,
      ownerToken,
      questId: quest._id,
      size: args.expectedSize,
      uploadToken,
    });
    await ctx.scheduler.runAfter(60 * 60 * 1_000, internal.evidence.expireUpload, { uploadId });
    return null;
  },
});

export const uploadSmallProof = action({
  args: {
    bytes: v.bytes(),
    contentType: v.string(),
    questId: v.id("quests"),
    uploadToken: v.string(),
  },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    const telemetryStartedAt = Date.now();
    try {
      if (args.bytes.byteLength <= 0 || args.bytes.byteLength > 900_000) {
        throw new ConvexError("UPLOAD_NOT_ALLOWED");
      }
      await ctx.runMutation(internal.evidence.prepareDirectUpload, {
        expectedContentType: args.contentType,
        expectedSize: args.bytes.byteLength,
        questId: args.questId,
        uploadToken: args.uploadToken,
      });
      const storageId = await ctx.storage.store(new Blob([args.bytes], { type: args.contentType }));
      try {
        await ctx.runMutation(internal.evidence.bindDirectUpload, {
          contentType: args.contentType,
          questId: args.questId,
          size: args.bytes.byteLength,
          storageId,
          uploadToken: args.uploadToken,
        });
      } catch (cause) {
        await ctx.storage.delete(storageId);
        throw cause;
      }
      return storageId;
    } catch (cause) {
      if (!(cause instanceof ConvexError)) {
        await captureBackendException(ctx, {
          cause,
          durationMs: Date.now() - telemetryStartedAt,
          journey: "complete_quest",
          operationId: args.uploadToken,
        });
      }
      throw cause;
    }
  },
});

export const bindDirectUpload = internalMutation({
  args: {
    contentType: v.string(),
    questId: v.id("quests"),
    size: v.number(),
    storageId: v.id("_storage"),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerToken = await requireOwnerToken(ctx);
    const reservation = await ctx.db
      .query("pendingUploads")
      .withIndex("by_uploadToken", (q) => q.eq("uploadToken", args.uploadToken.trim()))
      .unique();
    if (
      reservation === null ||
      reservation.ownerToken !== ownerToken ||
      reservation.questId !== args.questId ||
      reservation.expiresAt < Date.now() ||
      reservation.contentType !== args.contentType ||
      reservation.size !== args.size ||
      reservation.storageId !== undefined
    ) {
      throw new ConvexError("UPLOAD_NOT_ALLOWED");
    }
    await ctx.db.patch("pendingUploads", reservation._id, { storageId: args.storageId });
    return null;
  },
});

export const expireUpload = internalMutation({
  args: { uploadId: v.id("pendingUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("pendingUploads", args.uploadId);
    if (upload === null) return null;
    if (upload.expiresAt > Date.now()) {
      await ctx.scheduler.runAfter(
        upload.expiresAt - Date.now(),
        internal.evidence.expireUpload,
        args,
      );
      return null;
    }
    if (upload.storageId !== undefined) await ctx.storage.delete(upload.storageId);
    await ctx.db.delete("pendingUploads", upload._id);
    return null;
  },
});

export const listMine = query({
  args: { limit: v.number() },
  returns: v.array(evidenceResult),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new ConvexError("LIMIT_INVALID");
    }
    const ownerToken = await requireOwnerToken(ctx);
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
      .order("desc")
      .take(args.limit);
    return rows.map(withoutOwner);
  },
});

export const getMine = query({
  args: { proofId: v.id("evidence") },
  returns: evidenceDetailResult,
  handler: async (ctx, args) => {
    const proof = await requireOwnedDocument(ctx, await ctx.db.get("evidence", args.proofId));
    const rewardRows = await ctx.db
      .query("rewardLedger")
      .withIndex("by_questId", (q) => q.eq("questId", proof.questId))
      .take(4);
    const quest = await requireOwnedQuest(ctx, await ctx.db.get("quests", proof.questId));
    const reward = rewardRows.map(({ amount, awardKind }) => ({ amount, awardKind }));
    const signedStorageUrl =
      proof.storageId === undefined ? null : await ctx.storage.getUrl(proof.storageId);
    return {
      ...withoutOwner(proof),
      quest: {
        doneCondition: quest.doneCondition,
        mode: quest.mode,
        objective: quest.objective,
        title: quest.title,
      },
      reward,
      signedStorageUrl,
    };
  },
});
