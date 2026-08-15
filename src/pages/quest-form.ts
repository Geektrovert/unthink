import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { z } from "zod";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { productTextLimits, proofKinds } from "../../shared/product-contract";

export type QuestLifecycle = Exclude<FunctionReturnType<typeof api.quests.getMine>, null>;
export type ProofDraft = NonNullable<QuestLifecycle["attempt"]["drafts"]["proof"]>;
export type CompletionProof = FunctionArgs<typeof api.quests.complete>["proof"];

export const capsuleKeys = ["idea", "example", "boundary", "connection", "retrievalCue"] as const;

type ProofFormValues = {
  capsule: ProofDraft["capsule"];
  checkOutcome: string;
  proofFile: File | null;
  proofKind: (typeof proofKinds)[number];
  proofNote: string;
  proofStorageId: Id<"_storage"> | undefined;
  referenceUrl: string;
};

export const questDraftSchema = z.object({
  draft: z.string().max(productTextLimits.questDraft, "Keep this draft under 4,000 characters."),
});

export const proofFormSchema = z
  .object({
    capsule: z.object({
      boundary: z.string().trim().min(1, "Add a boundary.").max(productTextLimits.calibration),
      connection: z.string().trim().min(1, "Add a connection.").max(productTextLimits.calibration),
      example: z.string().trim().min(1, "Add an example.").max(productTextLimits.calibration),
      idea: z.string().trim().min(1, "Add the idea.").max(productTextLimits.calibration),
      retrievalCue: z
        .string()
        .trim()
        .min(1, "Add a retrieval cue.")
        .max(productTextLimits.calibration),
    }),
    checkOutcome: z
      .string()
      .trim()
      .min(1, "Record the check outcome.")
      .max(productTextLimits.calibration),
    proofFile: z.custom<File | null>((value) => value === null || value instanceof File),
    proofKind: z.enum(proofKinds),
    proofNote: z.string().trim().min(1, "Add inspectable proof.").max(productTextLimits.questDraft),
    proofStorageId: z.custom<Id<"_storage"> | undefined>(),
    referenceUrl: z.string(),
  })
  .superRefine((value, context) => {
    if (value.proofKind === "reference") {
      const result = z.url("Enter a valid reference URL.").safeParse(value.referenceUrl);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          message: "Enter a valid reference URL.",
          path: ["referenceUrl"],
        });
      }
    }
    if (
      value.proofKind === "file" &&
      value.proofFile === null &&
      value.proofStorageId === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose a file to continue.",
        path: ["proofFile"],
      });
    }
  });

export function initialProofFormValues(): ProofFormValues {
  return {
    capsule: {
      boundary: "",
      connection: "",
      example: "",
      idea: "",
      retrievalCue: "",
    },
    checkOutcome: "",
    proofFile: null,
    proofKind: "text",
    proofNote: "",
    proofStorageId: undefined,
    referenceUrl: "",
  };
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
type JsonRecord = { readonly [key: string]: JsonValue };

function jsonTag(value: JsonValue | undefined) {
  return Object.prototype.toString.call(value);
}

function isJsonRecord(value: JsonValue | undefined): value is JsonRecord {
  return jsonTag(value) === "[object Object]";
}

function isJsonString(value: JsonValue | undefined): value is string {
  return jsonTag(value) === "[object String]" && Object(value) !== value;
}

function isProofKind(value: JsonValue | undefined): value is (typeof proofKinds)[number] {
  return proofKinds.some((candidate) => candidate === value);
}

export function parseProofDraft(serialized: string): ProofDraft | null {
  // SAFETY: JSON.parse can only produce JSON values; this recursive union represents that exact
  // boundary before the fields are decoded into the proof domain contract below.
  const value = JSON.parse(serialized) as JsonValue;
  if (!isJsonRecord(value) || !isJsonRecord(value.capsule)) return null;
  const { boundary, connection, example, idea, retrievalCue } = value.capsule;
  const { checkOutcome, proofKind, proofNote, referenceUrl, storageId } = value;
  if (
    !isJsonString(boundary) ||
    !isJsonString(connection) ||
    !isJsonString(example) ||
    !isJsonString(idea) ||
    !isJsonString(retrievalCue) ||
    !isJsonString(checkOutcome) ||
    !isProofKind(proofKind) ||
    !isJsonString(proofNote) ||
    !isJsonString(referenceUrl) ||
    (storageId !== undefined && !isJsonString(storageId))
  ) {
    return null;
  }
  const proof: ProofDraft = {
    capsule: { boundary, connection, example, idea, retrievalCue },
    checkOutcome,
    proofKind,
    proofNote,
    referenceUrl,
  };
  if (storageId !== undefined) {
    // SAFETY: The cached value is only a candidate ID; the generated save mutation validates the
    // _storage table brand before accepting it as durable state.
    proof.storageId = storageId as Id<"_storage">;
  }
  return proof;
}

export function draftForStep(step: string, drafts: QuestLifecycle["attempt"]["drafts"]) {
  if (step === "retrieve") return drafts.recall ?? "";
  if (step === "make") return drafts.practice ?? "";
  if (step === "connect") return drafts.connection ?? "";
  if (step === "feedback") return drafts.feedback ?? "";
  return drafts.proofNote ?? "";
}
