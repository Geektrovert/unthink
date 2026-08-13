import type { OwnerRows } from "../model/privacy_snapshot";

export type PrivacyKind = "export" | "delete_proof" | "delete_learning" | "close_account";

export function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function rowManifest(rows: OwnerRows) {
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

export function snapshotCounts(rows: OwnerRows) {
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
      rows.operations.filter((row) => row.kind === "export" && row.archiveStorageId !== undefined)
        .length,
    rows:
      (rows.profile === null ? 0 : 1) + groups.reduce((total, group) => total + group.length, 0),
  };
}

export function consequenceForRows(kind: PrivacyKind, rows: OwnerRows) {
  const counts = snapshotCounts(rows);
  return stableHash(`${kind}:all:${counts.rows}:${counts.files}:${rowManifest(rows)}`);
}

export function expectedConfirmation(kind: PrivacyKind) {
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
