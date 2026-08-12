import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ProductCtx = QueryCtx | MutationCtx;

export async function requireOwnerToken(ctx: ProductCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("UNAUTHENTICATED");
  }
  return identity.tokenIdentifier;
}

export async function requireOwnedDocument<T extends { ownerToken: string }>(
  ctx: ProductCtx,
  document: T | null,
): Promise<T> {
  if (document === null) {
    throw new ConvexError("NOT_FOUND");
  }
  const ownerToken = await requireOwnerToken(ctx);
  if (document.ownerToken !== ownerToken) {
    throw new ConvexError("NOT_FOUND");
  }
  return document;
}

export async function requireOwnedQuest(ctx: ProductCtx, quest: Doc<"quests"> | null) {
  return await requireOwnedDocument(ctx, quest);
}
