import { useParams } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { productTextLimits, proofKinds } from "../../shared/product-contract";
import { beginBrowserJourney, beginCompletionJourney, newJourneyId } from "../posthog";
import { createQuestDraftTracker, questProgressUpdate } from "../quest-draft-lifecycle";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { useAppForm } from "../ui/form";
import { Panel, ProductPage, Status } from "../ui/surface";
import {
  capsuleKeys,
  draftForStep,
  initialProofFormValues,
  parseProofDraft,
  proofFormSchema,
  questDraftSchema,
} from "./quest-form";
import type { CompletionProof, ProofDraft } from "./quest-form";
import { fire, operationId, playCompletionChime } from "./support";

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
  const [dirty, setDirty] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const [status, setStatus] = useState("Synced");
  const [receipt, setReceipt] = useState<{ xpAwarded: number } | null>(null);
  const [completionOperationId] = useState(() => {
    const existing = localStorage.getItem(`unthink:completion:${questId}`);
    if (existing !== null) return existing;
    const created = newJourneyId("complete_quest");
    localStorage.setItem(`unthink:completion:${questId}`, created);
    return created;
  });
  const [timerClock, setTimerClock] = useState(() => Date.now());
  const latestDraft = useRef("");
  const draftTracker = useRef(createQuestDraftTracker(""));
  const autosaveGeneration = useRef(0);
  const proofDraftHydrated = useRef(false);
  const lastSyncedProofDraft = useRef("");

  const draftForm = useAppForm({
    defaultValues: { draft: "" },
    validators: { onSubmit: questDraftSchema },
    onSubmit: async () => saveCurrent(),
  });
  const proofForm = useAppForm({
    defaultValues: initialProofFormValues(),
    validators: { onSubmit: proofFormSchema },
    onSubmit: async ({ value }) => submitProof(proofFormSchema.parse(value)),
  });

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
      draftTracker.current.replace(serverDraft);
      draftForm.setFieldValue("draft", serverDraft);
      latestDraft.current = serverDraft;
      return;
    }
    draftTracker.current.replace(cached);
    draftForm.setFieldValue("draft", cached);
    latestDraft.current = cached;
    setDirty(true);
    setUnsynced(true);
    setStatus("Saved on this device · not synced");
  }, [dirty, draftForm, lifecycle, questId]);

  useEffect(() => {
    if (!unsynced) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [unsynced]);

  useEffect(() => {
    if (lifecycle === undefined) return;
    const step = lifecycle.attempt.currentStep;
    if (step === "proof" || lifecycle.quest.status !== "active") return;
    const revision = lifecycle.attempt.revision;
    let timer: number | undefined;
    const subscription = draftForm.store.subscribe(() => {
      const value = draftTracker.current.observe(draftForm.state.values.draft);
      if (value === null) return;
      latestDraft.current = value;
      setDirty(true);
      setUnsynced(true);
      setStatus("Saved on this device · not synced");
      localStorage.setItem(
        `unthink:draft:${questId}:${revision}`,
        value.slice(0, productTextLimits.questDraft),
      );
      const generation = ++autosaveGeneration.current;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setStatus("Saving…");
        fire(async () => {
          const update = questProgressUpdate(step, value);
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
    });
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [draftForm, lifecycle, questId, save]);

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
      proofForm.reset({
        capsule: value.capsule,
        checkOutcome: value.checkOutcome,
        proofFile: null,
        proofKind: value.proofKind,
        proofNote: value.proofNote,
        proofStorageId: value.storageId,
        referenceUrl: value.referenceUrl,
      });
    } catch {
      localStorage.removeItem(`unthink:draft:${questId}:proof`);
    } finally {
      proofDraftHydrated.current = true;
    }
  }, [lifecycle, proofForm, questId]);

  useEffect(() => {
    if (
      !proofDraftHydrated.current ||
      lifecycle === undefined ||
      lifecycle.quest.status !== "active" ||
      lifecycle.attempt.currentStep !== "proof"
    ) {
      return;
    }
    let timer: number | undefined;
    let previousValues = proofForm.state.values;
    const subscription = proofForm.store.subscribe(() => {
      const values = proofForm.state.values;
      if (values === previousValues) return;
      previousValues = values;
      const proof: ProofDraft = {
        capsule: values.capsule,
        checkOutcome: values.checkOutcome,
        proofKind: values.proofKind,
        proofNote: values.proofNote,
        referenceUrl: values.referenceUrl,
      };
      if (values.proofStorageId !== undefined) proof.storageId = values.proofStorageId;
      const serialized = JSON.stringify(proof);
      if (serialized === lastSyncedProofDraft.current) return;
      localStorage.setItem(`unthink:draft:${questId}:proof`, serialized);
      setStatus("Saving proof draft…");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
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
    });
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [lifecycle, proofForm, questId, save]);

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
    if (step === "proof") return;
    const draft = questDraftSchema.parse(draftForm.state.values).draft;
    autosaveGeneration.current += 1;
    setStatus("Saving…");
    const update = questProgressUpdate(step, draft);
    const saveOperationId = newJourneyId("advance_quest_step");
    const browserOperation = beginBrowserJourney("advance_quest_step", saveOperationId);
    try {
      await save({ advance: true, clientMutationId: saveOperationId, questId, update });
      browserOperation.succeeded();
      localStorage.removeItem(`unthink:draft:${questId}:${currentLifecycle.attempt.revision}`);
      setDirty(false);
      setUnsynced(false);
      draftTracker.current.replace("");
      draftForm.reset();
      latestDraft.current = "";
      setStatus("Synced");
    } catch (cause) {
      browserOperation.failed(cause);
      localStorage.setItem(
        `unthink:draft:${questId}:${currentLifecycle.attempt.revision}`,
        draft.slice(0, productTextLimits.questDraft),
      );
      setUnsynced(true);
      setStatus("Saved on this device · not synced");
    }
  }

  async function submitProof(values: z.infer<typeof proofFormSchema>) {
    const { capsule, checkOutcome, proofFile, proofKind, proofNote, proofStorageId, referenceUrl } =
      values;
    const id = completionOperationId;
    const completionJourney = beginCompletionJourney({
      family: currentLifecycle.quest.family,
      mode: currentLifecycle.quest.mode,
      operationId: id,
      proofKind,
      questId,
    });
    try {
      let storageId: Id<"_storage"> | undefined;
      if (proofKind === "file") {
        if (proofStorageId !== undefined) storageId = proofStorageId;
        else {
          if (proofFile === null) throw new Error("PROOF_FILE_REQUIRED");
          storageId = await uploadSmallProof({
            bytes: await proofFile.arrayBuffer(),
            contentType: proofFile.type,
            questId,
            uploadToken: id,
          });
          proofForm.setFieldValue("proofStorageId", storageId);
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
      completionJourney.succeeded(result.xpAwarded);
    } catch (cause) {
      completionJourney.failed(cause);
      setStatus("Proof not committed · your text is still here");
    }
  }

  async function requestQuestHelp(choice: "hint" | "shrink" | "park") {
    const helpOperationId = newJourneyId("request_quest_help");
    const browserOperation = beginBrowserJourney("request_quest_help", helpOperationId);
    try {
      const helped = await help({ choice, operationId: helpOperationId, questId });
      browserOperation.succeeded();
      if (choice === "park") {
        window.location.href = "/today";
        return;
      }
      if (choice === "shrink") {
        setStatus("Rescue mode is active. Finish this step, then go straight to proof.");
        return;
      }
      setStatus(
        helped.attempt.helpLevel === 1
          ? "Hint 1: what is the smallest concrete example that could answer this prompt?"
          : "Hint 2: write one example, name its boundary, and stop there.",
      );
    } catch (cause) {
      browserOperation.failed(cause);
      setStatus("That support was not saved. Retry the same action.");
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
            <proofForm.AppForm>
              <proofForm.FormRoot>
                <proofForm.AppField name="proofKind">
                  {(field) => (
                    <field.SelectField
                      items={[
                        { label: "Text", value: proofKinds[0] },
                        { label: "Reference URL", value: proofKinds[1] },
                        { label: "Private file", value: proofKinds[2] },
                      ]}
                      label="Proof kind"
                    />
                  )}
                </proofForm.AppField>
                <proofForm.AppField name="proofNote">
                  {(field) => <field.TextAreaField label="Inspectable proof" rows={4} />}
                </proofForm.AppField>
                <proofForm.Subscribe selector={(state) => state.values.proofKind}>
                  {(proofKind) => (
                    <>
                      {proofKind === "reference" ? (
                        <proofForm.AppField name="referenceUrl">
                          {(field) => <field.TextField label="Reference URL" type="url" />}
                        </proofForm.AppField>
                      ) : null}
                      {proofKind === "file" ? (
                        <proofForm.AppField name="proofFile">
                          {(field) => (
                            <field.FileField
                              accept="image/png,image/jpeg,application/pdf,audio/mpeg,text/plain"
                              label="Private file · PNG, JPEG, PDF, MP3, or text · 900 KB maximum"
                              onFileChange={() =>
                                proofForm.setFieldValue("proofStorageId", undefined)
                              }
                            />
                          )}
                        </proofForm.AppField>
                      ) : null}
                    </>
                  )}
                </proofForm.Subscribe>
                <proofForm.AppField name="checkOutcome">
                  {(field) => <field.TextAreaField label="Feedback or check outcome" />}
                </proofForm.AppField>
                {capsuleKeys.map((key) => (
                  <proofForm.AppField key={key} name={`capsule.${key}`}>
                    {(field) => <field.TextField label={`Memory capsule · ${key}`} />}
                  </proofForm.AppField>
                ))}
                <proofForm.SubmitButton
                  idleLabel="Commit proof and reward"
                  pendingLabel="Committing…"
                />
              </proofForm.FormRoot>
            </proofForm.AppForm>
          ) : (
            <draftForm.AppForm>
              <draftForm.FormRoot>
                <draftForm.AppField name="draft">
                  {(field) => <field.TextAreaField label="Your working draft" rows={8} />}
                </draftForm.AppField>
                <draftForm.SubmitButton idleLabel="Save and continue" pendingLabel="Saving…" />
              </draftForm.FormRoot>
            </draftForm.AppForm>
          )}
          <Status>{status}</Status>
          <div className={ui.actions}>
            <Button onClick={() => void requestQuestHelp("hint")} tone="quiet">
              One hint
            </Button>
            <Button onClick={() => void requestQuestHelp("shrink")} tone="quiet">
              Shrink to Rescue
            </Button>
            <Button onClick={() => void requestQuestHelp("park")} tone="quiet">
              Park safely
            </Button>
          </div>
        </Panel>
      </div>
    </ProductPage>
  );
}
