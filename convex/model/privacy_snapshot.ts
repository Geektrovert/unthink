import { ConvexError, getDocumentSize } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type OwnerRows = {
  attempts: Doc<"questAttempts">[];
  evidence: Doc<"evidence">[];
  ledger: Doc<"rewardLedger">[];
  operations: Doc<"privacyOperations">[];
  profile: Doc<"profiles"> | null;
  quests: Doc<"quests">[];
  redemptions: Doc<"rewardRedemptions">[];
  runs: Doc<"runs">[];
  uploads: Doc<"pendingUploads">[];
};

export async function readBoundedOwnerRows(
  ctx: QueryCtx | MutationCtx,
  ownerToken: string,
): Promise<OwnerRows> {
  const maximumPerTable = 64;
  const [profile, quests, attempts, evidence, uploads, ledger, redemptions, runs, operations] =
    await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .unique(),
      ctx.db
        .query("quests")
        .withIndex("by_ownerToken_and_dayKey", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("questAttempts")
        .withIndex("by_ownerToken_and_savedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("evidence")
        .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("pendingUploads")
        .withIndex("by_ownerToken", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("rewardLedger")
        .withIndex("by_ownerToken_and_createdAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("rewardRedemptions")
        .withIndex("by_ownerToken_and_redeemedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("runs")
        .withIndex("by_ownerToken_and_startedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
      ctx.db
        .query("privacyOperations")
        .withIndex("by_ownerToken_and_requestedAt", (q) => q.eq("ownerToken", ownerToken))
        .take(maximumPerTable + 1),
    ]);
  const groups = [quests, attempts, evidence, uploads, ledger, redemptions, runs, operations];
  if (groups.some((rows) => rows.length > maximumPerTable)) {
    throw new ConvexError("PRIVACY_OPERATION_TOO_LARGE");
  }
  const rows = {
    attempts,
    evidence,
    ledger,
    operations,
    profile,
    quests,
    redemptions,
    runs,
    uploads,
  };
  const allRows = [...(profile === null ? [] : [profile]), ...groups.flat()];
  if (
    allRows.length > 256 ||
    allRows.reduce((bytes, row) => bytes + getDocumentSize(row), 0) > 4 * 1024 * 1024
  ) {
    throw new ConvexError("PRIVACY_OPERATION_TOO_LARGE");
  }
  return rows;
}
