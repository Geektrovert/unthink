import { useParams } from "@tanstack/react-router";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { emitCompletionEvent } from "../posthog";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Field, Panel, ProductPage, Status } from "../ui/surface";
import { fire, operationId, playCompletionChime } from "./support";

type QuestLifecycle = Exclude<FunctionReturnType<typeof api.quests.getMine>, null>;
type ProofDraft = NonNullable<QuestLifecycle["attempt"]["drafts"]["proof"]>;
type CompletionProof = FunctionArgs<typeof api.quests.complete>["proof"];
type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
type JsonRecord = { readonly [key: string]: JsonValue };

const capsuleKeys = ["idea", "example", "boundary", "connection", "retrievalCue"] as const;
const proofKinds = ["text", "reference", "file"] as const;

function jsonTag(value: JsonValue | undefined) {
  return Object.prototype.toString.call(value);
}

function isJsonRecord(value: JsonValue | undefined): value is JsonRecord {
  return jsonTag(value) === "[object Object]";
}

function isJsonString(value: JsonValue | undefined): value is string {
  return jsonTag(value) === "[object String]" && Object(value) !== value;
}

function parseProofDraft(serialized: string): ProofDraft | null {
  // SAFETY: JSON.parse can only produce JSON values; this recursive union represents that exact
  // boundary before the fields are decoded into the proof domain contract below.
  const value = JSON.parse(serialized) as JsonValue;
  if (!isJsonRecord(value) || !isJsonRecord(value.capsule)) return null;
  const boundary = value.capsule.boundary;
  const connection = value.capsule.connection;
  const example = value.capsule.example;
  const idea = value.capsule.idea;
  const retrievalCue = value.capsule.retrievalCue;
  const checkOutcome = value.checkOutcome;
  const proofKind = value.proofKind;
  const proofNote = value.proofNote;
  const referenceUrl = value.referenceUrl;
  const storageId = value.storageId;
  if (
    !isJsonString(boundary) ||
    !isJsonString(connection) ||
    !isJsonString(example) ||
    !isJsonString(idea) ||
    !isJsonString(retrievalCue) ||
    !isJsonString(checkOutcome) ||
    (proofKind !== "text" && proofKind !== "reference" && proofKind !== "file") ||
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

function draftForStep(
  step: string,
  drafts: {
    connection: string;
    feedback: string;
    practice: string;
    proofNote: string;
    recall: string;
  },
) {
  if (step === "retrieve") return drafts.recall ?? "";
  if (step === "make") return drafts.practice ?? "";
  if (step === "connect") return drafts.connection ?? "";
  if (step === "feedback") return drafts.feedback ?? "";
  return drafts.proofNote ?? "";
}

export function QuestPage() {
  const params = useParams({ from: "/quest/$questId" });
  // SAFETY: The route value remains untrusted; every generated Convex function validates the
  // quest ID and authenticated owner before reading or mutating the document.
  const questId = params.questId as Id<"quests">;
  const profile = useQuery(api.profile.get, {});
  const lifecycle = useQuery(api.quests.getMine, { questId });
  const save = useMutation(api.quests.saveProgress);
  const help = useMutation(api.quests.requestHelp);
  const complete = useMutation(api.quests.complete);
  const uploadSmallProof = useAction(api.evidence.uploadSmallProof);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const [status, setStatus] = useState("Synced");
  const [proofNote, setProofNote] = useState("");
  const [proofKind, setProofKind] = useState<"text" | "reference" | "file">("text");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofStorageId, setProofStorageId] = useState<Id<"_storage"> | undefined>();
  const [checkOutcome, setCheckOutcome] = useState("");
  const [capsule, setCapsule] = useState<ProofDraft["capsule"]>({
    boundary: "",
    connection: "",
    example: "",
    idea: "",
    retrievalCue: "",
  });
  const [receipt, setReceipt] = useState<{ xpAwarded: number } | null>(null);
  const [completionPending, setCompletionPending] = useState(false);
  const emittedCompletionIds = useRef(new Set<string>());
  const [completionOperationId] = useState(() => {
    const existing = localStorage.getItem(`unthink:completion:${questId}`);
    if (existing !== null) return existing;
    const created = operationId("complete");
    localStorage.setItem(`unthink:completion:${questId}`, created);
    return created;
  });
  const [timerClock, setTimerClock] = useState(() => Date.now());
  const latestDraft = useRef("");
  const autosaveGeneration = useRef(0);
  const proofDraftHydrated = useRef(false);
  const lastSyncedProofDraft = useRef("");

  useEffect(() => {
    if (profile?.learningPreferences?.timerVisible !== true) return;
    const timer = window.setInterval(() => setTimerClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [profile?.learningPreferences?.timerVisible]);

  useEffect(() => {
    if (lifecycle === undefined || dirty) return;
    const serverDraft = draftForStep(lifecycle.attempt.currentStep, lifecycle.attempt.drafts);
    const cached = localStorage.getItem(`unthink:draft:${questId}:${lifecycle.attempt.revision}`);
    if (cached === null) {
      setDraft(serverDraft);
      return;
    }
    setDraft(cached);
    setDirty(true);
    setUnsynced(true);
    setStatus("Saved on this device · not synced");
  }, [dirty, lifecycle, questId]);

  useEffect(() => {
    if (!unsynced) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [unsynced]);

  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!dirty || !unsynced || lifecycle === undefined) return;
    const step = lifecycle.attempt.currentStep;
    if (step === "proof" || lifecycle.quest.status !== "active") return;
    const value = draft;
    const generation = autosaveGeneration.current;
    const revision = lifecycle.attempt.revision;
    const timer = window.setTimeout(() => {
      setStatus("Saving…");
      fire(async () => {
        const update =
          step === "retrieve"
            ? ({ step: "retrieve", text: value } as const)
            : step === "make"
              ? ({ step: "make", text: value } as const)
              : step === "connect"
                ? ({ step: "connect", text: value } as const)
                : ({ step: "feedback", text: value } as const);
        try {
          await save({
            advance: false,
            clientMutationId: operationId("autosave"),
            questId,
            update,
          });
          if (autosaveGeneration.current !== generation || latestDraft.current !== value) return;
          localStorage.removeItem(`unthink:draft:${questId}:${revision}`);
          setUnsynced(false);
          setStatus("Synced");
        } catch {
          if (autosaveGeneration.current !== generation) return;
          setStatus("Saved on this device · not synced");
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, lifecycle, questId, save, unsynced]);

  useEffect(() => {
    if (lifecycle === undefined || proofDraftHydrated.current) return;
    const serverDraft = lifecycle.attempt.drafts.proof;
    const cached = localStorage.getItem(`unthink:draft:${questId}:proof`);
    const serializedServerDraft = serverDraft === undefined ? "" : JSON.stringify(serverDraft);
    lastSyncedProofDraft.current = serializedServerDraft;
    if (cached === null && serverDraft === undefined) {
      proofDraftHydrated.current = true;
      return;
    }
    try {
      const value = parseProofDraft(cached ?? serializedServerDraft);
      if (value === null) throw new Error("PROOF_DRAFT_INVALID");
      setCapsule(value.capsule);
      setCheckOutcome(value.checkOutcome);
      setProofKind(value.proofKind);
      setProofNote(value.proofNote);
      setReferenceUrl(value.referenceUrl);
      setProofStorageId(value.storageId);
    } catch {
      localStorage.removeItem(`unthink:draft:${questId}:proof`);
    } finally {
      proofDraftHydrated.current = true;
    }
  }, [lifecycle, questId]);

  useEffect(() => {
    if (
      !proofDraftHydrated.current ||
      lifecycle === undefined ||
      lifecycle.quest.status !== "active" ||
      lifecycle.attempt.currentStep !== "proof"
    ) {
      return;
    }
    const proof: ProofDraft = {
      capsule,
      checkOutcome,
      proofKind,
      proofNote,
      referenceUrl,
    };
    if (proofStorageId !== undefined) proof.storageId = proofStorageId;
    const serialized = JSON.stringify(proof);
    if (serialized === lastSyncedProofDraft.current) return;
    localStorage.setItem(`unthink:draft:${questId}:proof`, serialized);
    setStatus("Saving proof draft…");
    const timer = window.setTimeout(() => {
      fire(async () => {
        try {
          await save({
            advance: false,
            clientMutationId: operationId("autosave-proof"),
            questId,
            update: { proof, step: "proof" },
          });
          lastSyncedProofDraft.current = serialized;
          localStorage.removeItem(`unthink:draft:${questId}:proof`);
          setStatus("Synced");
        } catch {
          setStatus("Saved on this device · not synced");
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    capsule,
    checkOutcome,
    lifecycle,
    proofKind,
    proofNote,
    proofStorageId,
    questId,
    referenceUrl,
    save,
  ]);

  if (lifecycle === undefined) return <Status>Restoring the exact quest step…</Status>;
  const currentLifecycle = lifecycle;
  if (lifecycle.quest.status === "completed" || receipt !== null) {
    const completedXp =
      receipt?.xpAwarded ??
      ("completionReceipt" in lifecycle ? lifecycle.completionReceipt?.xpAwarded : undefined);
    return (
      <ProductPage>
        <Panel title="Proof saved.">
          <p>
            {profile?.rewardPreferences?.celebration === false
              ? "The durable completion receipt is saved."
              : "Nice work — the durable completion receipt is saved."}
          </p>
          {profile?.rewardPreferences?.showXp === false || completedXp === undefined ? null : (
            <p>{completedXp} XP was committed with the receipt.</p>
          )}
          <Button onClick={() => (window.location.href = "/today")}>Leave for today</Button>
        </Panel>
      </ProductPage>
    );
  }
  const step = lifecycle.attempt.currentStep;
  const prompt = lifecycle.quest.stepSpec[step];
  const elapsedMinutes = Math.max(
    0,
    Math.floor((timerClock - (lifecycle.quest.startedAt ?? timerClock)) / 60_000),
  );

  async function saveCurrent() {
    autosaveGeneration.current += 1;
    setStatus("Saving…");
    const update =
      step === "retrieve"
        ? ({ step: "retrieve", text: draft } as const)
        : step === "make"
          ? ({ step: "make", text: draft } as const)
          : step === "connect"
            ? ({ step: "connect", text: draft } as const)
            : ({ step: "feedback", text: draft } as const);
    try {
      await save({ advance: true, clientMutationId: operationId("save"), questId, update });
      localStorage.removeItem(`unthink:draft:${questId}:${currentLifecycle.attempt.revision}`);
      setDirty(false);
      setUnsynced(false);
      setDraft("");
      setStatus("Synced");
    } catch {
      localStorage.setItem(
        `unthink:draft:${questId}:${currentLifecycle.attempt.revision}`,
        draft.slice(0, 4_000),
      );
      setUnsynced(true);
      setStatus("Saved on this device · not synced");
    }
  }

  async function submitProof(event: FormEvent) {
    event.preventDefault();
    if (completionPending) return;
    setCompletionPending(true);
    const startedAt = performance.now();
    const id = completionOperationId;
    try {
      let storageId: Id<"_storage"> | undefined;
      if (proofKind === "file") {
        if (proofStorageId !== undefined) storageId = proofStorageId;
        else {
          if (proofFile === null) throw new Error("PROOF_FILE_REQUIRED");
          const uploadToken = operationId("upload");
          storageId = await uploadSmallProof({
            bytes: await proofFile.arrayBuffer(),
            contentType: proofFile.type,
            questId,
            uploadToken,
          });
          setProofStorageId(storageId);
          await save({
            advance: false,
            clientMutationId: operationId("save-proof-upload"),
            questId,
            update: {
              proof: {
                capsule,
                checkOutcome,
                proofKind,
                proofNote,
                referenceUrl,
                storageId,
              },
              step: "proof",
            },
          });
        }
      }
      const completionProof: CompletionProof = { kind: proofKind, note: proofNote };
      if (proofKind === "reference") completionProof.referenceUrl = referenceUrl;
      if (storageId !== undefined) completionProof.storageId = storageId;
      const result = await complete({
        capsule,
        checkOutcome,
        operationId: id,
        proof: completionProof,
        questId,
      });
      localStorage.removeItem(`unthink:draft:${questId}:${currentLifecycle.attempt.revision}`);
      localStorage.removeItem(`unthink:draft:${questId}:proof`);
      localStorage.removeItem(`unthink:completion:${questId}`);
      setUnsynced(false);
      setReceipt(result);
      if (profile?.rewardPreferences?.sound === true) playCompletionChime();
      if (!emittedCompletionIds.current.has(result.operationId))
        emitCompletionEvent({
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
          environment: import.meta.env.MODE,
          family: currentLifecycle.quest.family,
          mode: currentLifecycle.quest.mode,
          operationId: result.operationId,
          outcome: "succeeded",
          proofKind,
          questId,
          retryCount: 0,
          route: "/quest/:questId",
          xpAwarded: result.xpAwarded,
        });
      emittedCompletionIds.current.add(result.operationId);
    } catch {
      setStatus("Proof not committed · your text is still here");
    } finally {
      setCompletionPending(false);
    }
  }

  return (
    <ProductPage>
      <div className={ui.workspace}>
        <aside className={ui.rail} aria-label="Quest steps">
          {(["retrieve", "make", "connect", "feedback", "proof"] as const).map((item) => (
            <span aria-current={item === step ? "step" : undefined} key={item}>
              {item}
            </span>
          ))}
        </aside>
        <Panel title={lifecycle.quest.title}>
          <p className={ui.eyebrow}>
            {lifecycle.quest.mode} · {step}
          </p>
          {profile?.learningPreferences?.timerVisible === true ? (
            <p className={ui.muted}>Optional timer · {elapsedMinutes} min elapsed</p>
          ) : null}
          <p>{prompt}</p>
          {step === "proof" ? (
            <form className={ui.stack} onSubmit={(event) => void submitProof(event)}>
              <Field label="Proof kind">
                <select
                  onChange={(event) =>
                    setProofKind(proofKinds.find((kind) => kind === event.target.value) ?? "text")
                  }
                  value={proofKind}
                >
                  <option value="text">Text</option>
                  <option value="reference">Reference URL</option>
                  <option value="file">Private file</option>
                </select>
              </Field>
              <Field label="Inspectable proof">
                <textarea
                  onChange={(event) => setProofNote(event.target.value)}
                  required
                  rows={4}
                  value={proofNote}
                />
              </Field>
              {proofKind === "reference" ? (
                <Field label="Reference URL">
                  <input
                    onChange={(event) => setReferenceUrl(event.target.value)}
                    required
                    type="url"
                    value={referenceUrl}
                  />
                </Field>
              ) : null}
              {proofKind === "file" ? (
                <Field label="Private file · PNG, JPEG, PDF, MP3, or text · 900 KB maximum">
                  <input
                    accept="image/png,image/jpeg,application/pdf,audio/mpeg,text/plain"
                    onChange={(event) => {
                      setProofFile(event.target.files?.[0] ?? null);
                      setProofStorageId(undefined);
                    }}
                    required
                    type="file"
                  />
                </Field>
              ) : null}
              <Field label="Feedback or check outcome">
                <textarea
                  onChange={(event) => setCheckOutcome(event.target.value)}
                  required
                  rows={2}
                  value={checkOutcome}
                />
              </Field>
              {capsuleKeys.map((key) => (
                <Field key={key} label={`Memory capsule · ${key}`}>
                  <input
                    onChange={(event) =>
                      setCapsule((current) => ({ ...current, [key]: event.target.value }))
                    }
                    required
                    value={capsule[key]}
                  />
                </Field>
              ))}
              <Button disabled={completionPending} type="submit">
                {completionPending ? "Committing…" : "Commit proof and reward"}
              </Button>
            </form>
          ) : (
            <div className={ui.stack}>
              <Field label="Your working draft">
                <textarea
                  onChange={(event) => {
                    setDirty(true);
                    setUnsynced(true);
                    setDraft(event.target.value);
                    localStorage.setItem(
                      `unthink:draft:${questId}:${currentLifecycle.attempt.revision}`,
                      event.target.value.slice(0, 4_000),
                    );
                  }}
                  rows={8}
                  value={draft}
                />
              </Field>
              <Button onClick={() => void saveCurrent()}>Save and continue</Button>
            </div>
          )}
          <Status>{status}</Status>
          <div className={ui.actions}>
            <Button
              onClick={() =>
                fire(async () => {
                  const helped = await help({
                    choice: "hint",
                    operationId: operationId("help"),
                    questId,
                  });
                  setStatus(
                    helped.attempt.helpLevel === 1
                      ? "Hint 1: what is the smallest concrete example that could answer this prompt?"
                      : "Hint 2: write one example, name its boundary, and stop there.",
                  );
                })
              }
              tone="quiet"
            >
              One hint
            </Button>
            <Button
              onClick={() =>
                fire(async () => {
                  await help({ choice: "shrink", operationId: operationId("help"), questId });
                  setStatus("Rescue mode is active. Finish this step, then go straight to proof.");
                })
              }
              tone="quiet"
            >
              Shrink to Rescue
            </Button>
            <Button
              onClick={() =>
                fire(async () => {
                  await help({ choice: "park", operationId: operationId("help"), questId });
                  window.location.href = "/today";
                })
              }
              tone="quiet"
            >
              Park safely
            </Button>
          </div>
        </Panel>
      </div>
    </ProductPage>
  );
}
