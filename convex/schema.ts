import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  capacityModes,
  frictionResponses,
  proofKinds,
  rewardCategoryOptions,
  supportOptions,
} from "../shared/product-contract";

export const modeValidator = v.union(
  v.literal(capacityModes[0]),
  v.literal(capacityModes[1]),
  v.literal(capacityModes[2]),
);
export const questStatusValidator = v.union(
  v.literal("ready"),
  v.literal("active"),
  v.literal("parked"),
  v.literal("completed"),
);
export const questStepValidator = v.union(
  v.literal("retrieve"),
  v.literal("make"),
  v.literal("connect"),
  v.literal("feedback"),
  v.literal("proof"),
);
export const questFamilyValidator = v.union(
  v.literal("anchor"),
  v.literal("recall"),
  v.literal("bridge"),
  v.literal("teach"),
  v.literal("revival"),
  v.literal("north-star"),
  v.literal("review"),
);
export const onboardingStepValidator = v.union(
  v.literal("promise"),
  v.literal("goals"),
  v.literal("supports"),
  v.literal("rewards"),
  v.literal("calibration"),
  v.literal("complete"),
);
export const frictionResponseValidator = v.union(
  v.literal(frictionResponses[0]),
  v.literal(frictionResponses[1]),
  v.literal(frictionResponses[2]),
  v.literal(frictionResponses[3]),
);
export const supportValidator = v.union(
  v.literal(supportOptions[0]),
  v.literal(supportOptions[1]),
  v.literal(supportOptions[2]),
  v.literal(supportOptions[3]),
);

export const frictionValidator = v.object({
  distract: frictionResponseValidator,
  estimate: frictionResponseValidator,
  overload: frictionResponseValidator,
  remember: frictionResponseValidator,
  resume: frictionResponseValidator,
  start: frictionResponseValidator,
  stop: frictionResponseValidator,
  switch: frictionResponseValidator,
});

export const rewardPreferencesValidator = v.object({
  celebration: v.boolean(),
  motion: v.optional(v.boolean()),
  rewardCategories: v.optional(
    v.array(v.union(v.literal(rewardCategoryOptions[0]), v.literal(rewardCategoryOptions[1]))),
  ),
  rewardSuggestions: v.boolean(),
  showXp: v.boolean(),
  sound: v.boolean(),
});

export const learningPreferencesValidator = v.object({
  defaultMode: modeValidator,
  lowStimulation: v.boolean(),
  timerVisible: v.boolean(),
});

export const calibrationObservationValidator = v.object({
  correction: v.string(),
  observation: v.string(),
  taskKey: v.union(
    v.literal("recall"),
    v.literal("apply"),
    v.literal("bridge"),
    v.literal("teach"),
    v.literal("stop"),
  ),
});

export const profileFields = v.object({
  anchor: v.optional(v.string()),
  calibration: v.optional(v.array(calibrationObservationValidator)),
  calibrationDraft: v.optional(v.array(calibrationObservationValidator)),
  establishedDomainKeys: v.optional(v.array(v.string())),
  friction: v.optional(frictionValidator),
  learningPreferences: v.optional(learningPreferencesValidator),
  lifetimeXp: v.optional(v.number()),
  northStar: v.optional(v.string()),
  onboardingComplete: v.boolean(),
  onboardingStep: onboardingStepValidator,
  ownerToken: v.string(),
  pilotDeckVersion: v.optional(v.string()),
  promiseAccepted: v.optional(v.boolean()),
  revival: v.optional(v.string()),
  rewardPreferences: v.optional(rewardPreferencesValidator),
  supports: v.optional(v.array(supportValidator)),
  timezone: v.optional(v.string()),
  updatedAt: v.number(),
});

const questStepSpecValidator = v.object({
  connect: v.string(),
  feedback: v.string(),
  make: v.string(),
  proof: v.string(),
  retrieve: v.string(),
});

export const questFields = v.object({
  appliedLifecycleOperationIds: v.optional(v.array(v.string())),
  allowedProofKinds: v.array(v.union(v.literal("text"), v.literal("reference"), v.literal("file"))),
  capacityVariants: v.object({ deep: v.string(), rescue: v.string(), standard: v.string() }),
  checkMethod: v.string(),
  completedAt: v.optional(v.number()),
  createdOperationId: v.string(),
  dayKey: v.string(),
  domainKeys: v.array(v.string()),
  doneCondition: v.string(),
  evidenceLabels: v.array(v.string()),
  family: questFamilyValidator,
  helpLevel: v.number(),
  mode: modeValidator,
  objective: v.string(),
  ownerToken: v.string(),
  possibleXpTags: v.array(
    v.union(v.literal("proof"), v.literal("retrieval-check"), v.literal("bridge-or-contribution")),
  ),
  parkedAt: v.optional(v.number()),
  seedKey: v.string(),
  seedVersion: v.number(),
  startedAt: v.optional(v.number()),
  status: questStatusValidator,
  stepSpec: questStepSpecValidator,
  title: v.string(),
  updatedAt: v.number(),
  whyNow: v.string(),
});

export const capsuleValidator = v.object({
  boundary: v.string(),
  connection: v.string(),
  example: v.string(),
  idea: v.string(),
  retrievalCue: v.string(),
});

export const proofKindValidator = v.union(
  v.literal(proofKinds[0]),
  v.literal(proofKinds[1]),
  v.literal(proofKinds[2]),
);

export const proofDraftValidator = v.object({
  capsule: capsuleValidator,
  checkOutcome: v.string(),
  proofKind: proofKindValidator,
  proofNote: v.string(),
  referenceUrl: v.string(),
  storageId: v.optional(v.id("_storage")),
});

export const attemptDraftsValidator = v.object({
  connection: v.string(),
  feedback: v.string(),
  practice: v.string(),
  proof: v.optional(proofDraftValidator),
  proofNote: v.string(),
  recall: v.string(),
  referenceUrl: v.string(),
});

export const evidenceFields = v.object({
  capsule: capsuleValidator,
  checkOutcome: v.string(),
  completionOperationId: v.string(),
  createdAt: v.number(),
  domainKeys: v.array(v.string()),
  family: questFamilyValidator,
  note: v.string(),
  ownerToken: v.string(),
  proofKind: proofKindValidator,
  questId: v.id("quests"),
  referenceUrl: v.optional(v.string()),
  storageContentType: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  storageSize: v.optional(v.number()),
});

export const awardKindValidator = v.union(
  v.literal("proof"),
  v.literal("retrieval-check"),
  v.literal("bridge-or-contribution"),
);

export const redemptionStateValidator = v.union(
  v.literal("claimed"),
  v.literal("applied"),
  v.literal("used"),
);

export const runOutcomeValidator = v.union(
  v.literal("succeeded"),
  v.literal("expected-failure"),
  v.literal("failed"),
);

export const privacyKindValidator = v.union(
  v.literal("export"),
  v.literal("delete_proof"),
  v.literal("delete_learning"),
  v.literal("close_account"),
);

export const privacyStateValidator = v.union(
  v.literal("prepared"),
  v.literal("confirmed"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

export const pendingUploadFields = v.object({
  contentType: v.string(),
  expiresAt: v.number(),
  ownerToken: v.string(),
  questId: v.id("quests"),
  size: v.number(),
  storageId: v.optional(v.id("_storage")),
  uploadToken: v.string(),
});

export const privacyCountsValidator = v.object({ files: v.number(), rows: v.number() });

export const privacyOperationBaseFields = {
  consequenceHash: v.string(),
  consequenceVersion: v.number(),
  counts: privacyCountsValidator,
  failureClass: v.optional(v.string()),
  idempotencyKey: v.string(),
  operationId: v.string(),
  requestedAt: v.number(),
  state: privacyStateValidator,
  updatedAt: v.number(),
} as const;

export const privacyExportOperationFields = v.object({
  ...privacyOperationBaseFields,
  archiveChecksum: v.optional(v.string()),
  archiveExpiresAt: v.optional(v.number()),
  archiveStorageId: v.optional(v.id("_storage")),
  kind: v.literal("export"),
  ownerToken: v.string(),
});

export const privacyDeletionOperationFields = v.object({
  ...privacyOperationBaseFields,
  kind: v.union(v.literal("delete_proof"), v.literal("delete_learning")),
  ownerToken: v.string(),
  pendingStorageIds: v.optional(v.array(v.id("_storage"))),
  requestedObjectId: v.optional(v.string()),
});

export const privacyClosureOperationFields = v.object({
  ...privacyOperationBaseFields,
  authDeletionStartedAt: v.optional(v.number()),
  authUserId: v.optional(v.string()),
  kind: v.literal("close_account"),
  ownerToken: v.optional(v.string()),
  pendingStorageIds: v.optional(v.array(v.id("_storage"))),
});

export const privacyOperationValidator = v.union(
  privacyExportOperationFields,
  privacyDeletionOperationFields,
  privacyClosureOperationFields,
);

export const questAttemptFields = v.object({
  appliedClientMutationIds: v.optional(v.array(v.string())),
  appliedHelpOperationIds: v.optional(v.array(v.string())),
  currentStep: questStepValidator,
  drafts: attemptDraftsValidator,
  helpLevel: v.number(),
  ownerToken: v.string(),
  questId: v.id("quests"),
  revision: v.number(),
  savedAt: v.number(),
});

export const rewardLedgerFields = v.object({
  amount: v.number(),
  awardIdempotencyKey: v.string(),
  awardKind: awardKindValidator,
  createdAt: v.number(),
  localDay: v.string(),
  operationId: v.string(),
  ownerToken: v.string(),
  questId: v.id("quests"),
});

export const rewardRedemptionFields = v.object({
  catalogueVersion: v.number(),
  appliedSeedKey: v.optional(v.string()),
  choiceKey: v.optional(v.string()),
  fallbackReason: v.optional(v.string()),
  operationId: v.string(),
  ownerToken: v.string(),
  redeemedAt: v.number(),
  redemptionIdempotencyKey: v.string(),
  rewardKey: v.string(),
  state: redemptionStateValidator,
  targetDayKey: v.optional(v.string()),
  unlockThreshold: v.number(),
  updatedAt: v.number(),
});

export const runFields = v.object({
  durationMs: v.number(),
  endedAt: v.number(),
  environment: v.string(),
  errorClass: v.optional(v.string()),
  evidenceId: v.optional(v.id("evidence")),
  operationId: v.string(),
  operationName: v.string(),
  outcome: runOutcomeValidator,
  ownerToken: v.string(),
  proofDeletedAt: v.optional(v.number()),
  questId: v.optional(v.id("quests")),
  redactionVersion: v.number(),
  release: v.string(),
  retryCount: v.number(),
  startedAt: v.number(),
  xpAwarded: v.number(),
});

export default defineSchema({
  evidence: defineTable(evidenceFields.fields)
    .index("by_ownerToken_and_createdAt", ["ownerToken", "createdAt"])
    .index("by_questId", ["questId"]),
  pendingUploads: defineTable(pendingUploadFields.fields)
    .index("by_storageId", ["storageId"])
    .index("by_uploadToken", ["uploadToken"])
    .index("by_ownerToken", ["ownerToken"]),
  privacyOperations: defineTable(privacyOperationValidator)
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_ownerToken_and_requestedAt", ["ownerToken", "requestedAt"]),
  profiles: defineTable(profileFields.fields).index("by_ownerToken", ["ownerToken"]),
  questAttempts: defineTable(questAttemptFields.fields)
    .index("by_questId", ["questId"])
    .index("by_ownerToken_and_savedAt", ["ownerToken", "savedAt"]),
  quests: defineTable(questFields.fields)
    .index("by_ownerToken_and_dayKey", ["ownerToken", "dayKey"])
    .index("by_ownerToken_and_status", ["ownerToken", "status"])
    .index("by_ownerToken_and_status_and_dayKey", ["ownerToken", "status", "dayKey"]),
  rewardLedger: defineTable(rewardLedgerFields.fields)
    .index("by_awardIdempotencyKey", ["awardIdempotencyKey"])
    .index("by_ownerToken_and_createdAt", ["ownerToken", "createdAt"])
    .index("by_ownerToken_and_localDay", ["ownerToken", "localDay"])
    .index("by_questId", ["questId"]),
  rewardRedemptions: defineTable(rewardRedemptionFields.fields)
    .index("by_ownerToken_and_catalogueVersion_and_rewardKey", [
      "ownerToken",
      "catalogueVersion",
      "rewardKey",
    ])
    .index("by_ownerToken_and_redeemedAt", ["ownerToken", "redeemedAt"])
    .index("by_redemptionIdempotencyKey", ["redemptionIdempotencyKey"]),
  runs: defineTable(runFields.fields)
    .index("by_operationId", ["operationId"])
    .index("by_questId", ["questId"])
    .index("by_ownerToken_and_startedAt", ["ownerToken", "startedAt"]),
});
