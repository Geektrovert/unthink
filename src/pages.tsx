import { Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { authClient } from "./auth-client";
import { emitCompletionEvent } from "./posthog";
import { resumableOnboardingStep } from "./onboarding";
import type { OnboardingStep } from "./onboarding";
import { Button } from "./ui/button";
import { Field, Panel, ProductPage, Status } from "./ui/surface";

function localDayKey(date = new Date(), timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function operationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function fire(task: () => Promise<unknown>) {
  void task();
}

function clearDeviceDrafts() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("unthink:")) localStorage.removeItem(key);
  }
}

function playCompletionChime() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.14);
    oscillator.addEventListener("ended", () => void audio.close(), { once: true });
  } catch {
    // Optional presentation cannot revise a committed completion.
  }
}

type Friction = Record<
  "distract" | "estimate" | "overload" | "remember" | "resume" | "start" | "stop" | "switch",
  "yes" | "sometimes" | "no" | "skip"
>;
export function OnboardingPage() {
  const profile = useQuery(api.profile.get, {});
  const saveStep = useMutation(api.profile.saveOnboardingStep);
  const saveDraft = useMutation(api.profile.saveOnboardingDraft);
  const complete = useMutation(api.profile.completeOnboarding);
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { step?: string };
  const persistedStep = profile?.onboardingStep ?? "promise";
  const step = resumableOnboardingStep(persistedStep as OnboardingStep | "complete");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [anchor, setAnchor] = useState("backend systems");
  const [revival, setRevival] = useState("drawing");
  const [northStar, setNorthStar] = useState("physics");
  const [showXp, setShowXp] = useState(true);
  const [celebration, setCelebration] = useState(true);
  const [sound, setSound] = useState(false);
  const [rewardSuggestions, setRewardSuggestions] = useState(true);
  const [calibration, setCalibration] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [friction, setFriction] = useState<Friction>({
    distract: "skip",
    estimate: "skip",
    overload: "skip",
    remember: "skip",
    resume: "skip",
    start: "skip",
    stop: "skip",
    switch: "skip",
  } satisfies Friction);
  const [supports, setSupports] = useState<
    Array<"exact-resume" | "written-outline" | "low-stimulation" | "optional-timer">
  >(["exact-resume"]);
  const [onboardingHydrated, setOnboardingHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "failed">(
    "idle",
  );
  const [draftRetry, setDraftRetry] = useState(0);
  const draftRevision = useRef(0);

  useEffect(() => {
    if (profile === undefined || profile === null) return;
    if (onboardingHydrated) return;
    setAnchor(profile.anchor ?? "backend systems");
    setRevival(profile.revival ?? "");
    setNorthStar(profile.northStar ?? "physics");
    setShowXp(profile.rewardPreferences?.showXp ?? true);
    setCelebration(profile.rewardPreferences?.celebration ?? true);
    setSound(profile.rewardPreferences?.sound ?? false);
    setRewardSuggestions(profile.rewardPreferences?.rewardSuggestions ?? true);
    setFriction(profile.friction ?? friction);
    setSupports(profile.supports ?? ["exact-resume"]);
    const savedCalibration = profile.calibrationDraft ?? profile.calibration;
    if (savedCalibration !== undefined) {
      setCalibration(
        Object.fromEntries(savedCalibration.map((item) => [item.taskKey, item.observation])),
      );
      setCorrections(
        Object.fromEntries(savedCalibration.map((item) => [item.taskKey, item.correction])),
      );
    }
    setOnboardingHydrated(true);
  }, [onboardingHydrated, profile]);

  useEffect(() => {
    if (!onboardingHydrated || profile?.onboardingComplete === true) return;
    const revision = ++draftRevision.current;
    setDraftStatus("dirty");
    const timer = window.setTimeout(() => {
      setDraftStatus("saving");
      void saveDraft({
        anchor,
        calibration: (["recall", "apply", "bridge", "teach", "stop"] as const).map((taskKey) => ({
          correction: corrections[taskKey] ?? "",
          observation: calibration[taskKey] ?? "",
          taskKey,
        })),
        friction,
        northStar,
        revival: revival || undefined,
        rewardPreferences: {
          celebration,
          motion: true,
          rewardCategories: ["creative", "choice"],
          rewardSuggestions,
          showXp,
          sound,
        },
        supports,
      })
        .then(() => {
          if (draftRevision.current === revision) setDraftStatus("saved");
        })
        .catch(() => {
          if (draftRevision.current === revision) setDraftStatus("failed");
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    anchor,
    calibration,
    celebration,
    corrections,
    draftRetry,
    friction,
    northStar,
    onboardingHydrated,
    revival,
    rewardSuggestions,
    showXp,
    sound,
    supports,
    profile?.onboardingComplete,
    saveDraft,
  ]);

  if (profile === undefined) return <Status>Loading your saved onboarding step…</Status>;
  if (profile?.onboardingComplete) return <Navigate to="/today" replace />;
  if (params.step !== step) {
    return <Navigate params={{ step }} to="/onboarding/$step" replace />;
  }

  async function run(next: () => Promise<unknown>, nextStep?: OnboardingStep) {
    setPending(true);
    setError(false);
    try {
      await next();
      if (nextStep === undefined) {
        await navigate({ to: "/today" });
      } else {
        await navigate({ params: { step: nextStep }, to: "/onboarding/$step" });
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <ProductPage>
      <Panel title={`Onboarding · ${step}`}>
        <p className="ds-muted">
          Why this shape? It records preferences and observed work, never an ADHD or mastery score.
        </p>
        {draftStatus === "saving" ? <p className="ds-muted">Saving this draft…</p> : null}
        {draftStatus === "dirty" ? <p className="ds-muted">Draft has unsaved changes.</p> : null}
        {draftStatus === "saved" ? <p className="ds-muted">Draft saved.</p> : null}
        {draftStatus === "failed" ? (
          <div className="ds-stack">
            <p className="ds-error" role="alert">
              This edit is still on screen but has not synced.
            </p>
            <Button onClick={() => setDraftRetry((value) => value + 1)} tone="quiet">
              Retry draft save
            </Button>
          </div>
        ) : null}
        {step === "promise" ? (
          <div className="ds-stack">
            <p>One quest is enough. Missing a day creates no debt. Proof outranks screen time.</p>
            <Button
              disabled={pending}
              onClick={() =>
                void run(() => saveStep({ payload: { accepted: true }, step: "promise" }), "goals")
              }
            >
              Keep this promise
            </Button>
          </div>
        ) : null}
        {step === "goals" ? (
          <form
            className="ds-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  saveStep({
                    payload: {
                      anchor,
                      establishedDomainKeys: ["frontend", "robotics", "backend", "infrastructure"],
                      northStar,
                      ...(revival.trim().length === 0 ? {} : { revival }),
                    },
                    step: "goals",
                  }),
                "supports",
              );
            }}
          >
            <Field label="Anchor to deepen now">
              <input onChange={(event) => setAnchor(event.target.value)} value={anchor} />
            </Field>
            <Field label="Optional Revival">
              <input onChange={(event) => setRevival(event.target.value)} value={revival} />
            </Field>
            <Field label="North Star">
              <input onChange={(event) => setNorthStar(event.target.value)} value={northStar} />
            </Field>
            <Button disabled={pending} type="submit">
              Save goals
            </Button>
          </form>
        ) : null}
        {step === "supports" ? (
          <div className="ds-stack">
            <p>
              Start, memory, switching, time, stopping, overload, distraction, and resume stay
              separate.
            </p>
            {(Object.keys(friction) as Array<keyof typeof friction>).map((key) => (
              <Field key={key} label={`${key} friction`}>
                <select
                  onChange={(event) =>
                    setFriction((current) => ({
                      ...current,
                      [key]: event.target.value as "yes" | "sometimes" | "no" | "skip",
                    }))
                  }
                  value={friction[key]}
                >
                  {(["yes", "sometimes", "no", "skip"] as const).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            {(
              ["exact-resume", "written-outline", "low-stimulation", "optional-timer"] as const
            ).map((support) => (
              <label className="ds-check" key={support}>
                <input
                  checked={supports.includes(support)}
                  onChange={(event) =>
                    setSupports((current) =>
                      event.target.checked
                        ? [...new Set([...current, support])]
                        : current.filter((value) => value !== support),
                    )
                  }
                  type="checkbox"
                />{" "}
                {support}
              </label>
            ))}
            <Button
              disabled={pending}
              onClick={() =>
                void run(
                  () =>
                    saveStep({
                      payload: {
                        friction,
                        supports,
                      },
                      step: "supports",
                    }),
                  "rewards",
                )
              }
            >
              Use these supports
            </Button>
          </div>
        ) : null}
        {step === "rewards" ? (
          <div className="ds-stack">
            <label className="ds-check">
              <input
                checked={showXp}
                onChange={(event) => setShowXp(event.target.checked)}
                type="checkbox"
              />{" "}
              Show deterministic XP
            </label>
            <label className="ds-check">
              <input
                checked={rewardSuggestions}
                onChange={(event) => setRewardSuggestions(event.target.checked)}
                type="checkbox"
              />{" "}
              Show pre-agreed reward suggestions
            </label>
            <label className="ds-check">
              <input
                checked={celebration}
                onChange={(event) => setCelebration(event.target.checked)}
                type="checkbox"
              />{" "}
              Show completion celebration
            </label>
            <label className="ds-check">
              <input
                checked={sound}
                onChange={(event) => setSound(event.target.checked)}
                type="checkbox"
              />{" "}
              Play an opt-in completion sound
            </label>
            <Button
              disabled={pending}
              onClick={() =>
                void run(
                  () =>
                    saveStep({
                      payload: {
                        celebration,
                        motion: true,
                        rewardCategories: ["creative", "choice"],
                        rewardSuggestions,
                        showXp,
                        sound,
                      },
                      step: "rewards",
                    }),
                  "calibration",
                )
              }
            >
              Save reward display
            </Button>
          </div>
        ) : null}
        {step === "calibration" ? (
          <form
            className="ds-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const taskKeys = ["recall", "apply", "bridge", "teach", "stop"] as const;
              void run(async () => {
                await saveStep({
                  payload: {
                    observations: taskKeys.map((taskKey) => ({
                      correction: corrections[taskKey] ?? "",
                      observation: calibration[taskKey] ?? "Completed at an experienced level.",
                      taskKey,
                    })),
                  },
                  step: "calibration",
                });
                await complete({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
              });
            }}
          >
            {(["recall", "apply", "bridge", "teach", "stop"] as const).map((taskKey) => (
              <div className="ds-stack" key={taskKey}>
                <Field label={`${taskKey}: what did you observe?`}>
                  <textarea
                    onChange={(event) =>
                      setCalibration((current) => ({ ...current, [taskKey]: event.target.value }))
                    }
                    required
                    rows={2}
                    value={calibration[taskKey] ?? ""}
                  />
                </Field>
                <Field label={`${taskKey}: optional correction`}>
                  <textarea
                    onChange={(event) =>
                      setCorrections((current) => ({ ...current, [taskKey]: event.target.value }))
                    }
                    rows={2}
                    value={corrections[taskKey] ?? ""}
                  />
                </Field>
              </div>
            ))}
            <Button disabled={pending} type="submit">
              Finish calibration
            </Button>
          </form>
        ) : null}
        {error ? (
          <p className="ds-error" role="alert">
            Your input is still here. Try the same action again.
          </p>
        ) : null}
      </Panel>
    </ProductPage>
  );
}

export function TodayPage() {
  const profile = useQuery(api.profile.get, {});
  const [dayClock, setDayClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setDayClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dayKey = useMemo(
    () => localDayKey(new Date(dayClock), profile?.timezone),
    [dayClock, profile?.timezone],
  );
  const today = useQuery(api.quests.getToday, profile?.onboardingComplete ? { dayKey } : "skip");
  const prepare = useMutation(api.quests.prepareToday);
  const start = useMutation(api.quests.startOrResize);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (profile === undefined) return <Status>Loading Today…</Status>;
  if (!profile?.onboardingComplete) {
    const step =
      profile?.onboardingStep === "complete" ? "promise" : (profile?.onboardingStep ?? "promise");
    return <Navigate params={{ step }} to="/onboarding/$step" replace />;
  }
  if (today === undefined) return <Status>Finding the one useful thing…</Status>;
  const currentToday = today;

  async function open(mode: "rescue" | "standard" | "deep") {
    setPending(true);
    setError(false);
    try {
      const lifecycle =
        currentToday.quest === null
          ? await prepare({ dayKey, operationId: operationId("prepare") })
          : { attempt: currentToday.attempt!, quest: currentToday.quest };
      await start({ mode, operationId: operationId("start"), questId: lifecycle.quest._id });
      await navigate({ params: { questId: lifecycle.quest._id }, to: "/quest/$questId" });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <ProductPage>
      <Panel title={today.quest?.title ?? "One useful thing."}>
        <p className="ds-muted">
          {today.quest?.whyNow ?? "Prepare one reviewed quest. Missing yesterday created no debt."}
        </p>
        {today.quest === null ? null : (
          <p>
            <strong>Done:</strong> {today.quest.doneCondition}
          </p>
        )}
        <div className="ds-actions" aria-label="Choose capacity">
          <Button
            disabled={pending}
            onClick={() => void open("rescue")}
            tone={
              (profile.learningPreferences?.defaultMode ?? "standard") === "rescue"
                ? undefined
                : "quiet"
            }
          >
            Rescue · 3 min
          </Button>
          <Button
            disabled={pending}
            onClick={() => void open("standard")}
            tone={
              (profile.learningPreferences?.defaultMode ?? "standard") === "standard"
                ? undefined
                : "quiet"
            }
          >
            Standard · 12 min
          </Button>
          <Button
            disabled={pending}
            onClick={() => void open("deep")}
            tone={
              (profile.learningPreferences?.defaultMode ?? "standard") === "deep"
                ? undefined
                : "quiet"
            }
          >
            Deep · 25 min
          </Button>
        </div>
        {today.quest?.status === "parked" ? (
          <Status>Parked safely at {today.quest.activeStep}.</Status>
        ) : null}
        {profile.rewardPreferences?.showXp === false ? null : (
          <p className="ds-muted">
            Today {today.dayXp} XP · lifetime {today.lifetimeXp} XP
          </p>
        )}
        <p className="ds-muted">
          Weekly momentum · {today.weeklyMomentum.completedQuests} completed quest
          {today.weeklyMomentum.completedQuests === 1 ? "" : "s"} in the last 7 days
        </p>
        {error ? (
          <p className="ds-error" role="alert">
            Nothing was claimed as started. Try again.
          </p>
        ) : null}
      </Panel>
    </ProductPage>
  );
}

function draftForStep(step: string, drafts: Record<string, string>) {
  if (step === "retrieve") return drafts.recall ?? "";
  if (step === "make") return drafts.practice ?? "";
  if (step === "connect") return drafts.connection ?? "";
  if (step === "feedback") return drafts.feedback ?? "";
  return drafts.proofNote ?? "";
}

export function QuestPage() {
  const { questId } = useParams({ strict: false }) as { questId: Id<"quests"> };
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
  const [checkOutcome, setCheckOutcome] = useState("");
  const [capsule, setCapsule] = useState({
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
  const skipNextProofDraftPersist = useRef(false);

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
        const patch =
          step === "retrieve"
            ? { recall: value }
            : step === "make"
              ? { practice: value }
              : step === "connect"
                ? { connection: value }
                : { feedback: value };
        try {
          await save({
            advance: false,
            clientMutationId: operationId("autosave"),
            patch,
            questId,
            step,
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
    const cached = localStorage.getItem(`unthink:draft:${questId}:proof`);
    if (cached === null) {
      proofDraftHydrated.current = true;
      return;
    }
    try {
      const value = JSON.parse(cached) as Record<string, unknown>;
      if (
        typeof value.capsule !== "object" ||
        value.capsule === null ||
        typeof value.checkOutcome !== "string" ||
        (value.proofKind !== "text" &&
          value.proofKind !== "reference" &&
          value.proofKind !== "file") ||
        typeof value.proofNote !== "string" ||
        typeof value.referenceUrl !== "string" ||
        Object.values(value.capsule).some((entry) => typeof entry !== "string")
      ) {
        throw new Error("PROOF_DRAFT_INVALID");
      }
      setCapsule(value.capsule as typeof capsule);
      skipNextProofDraftPersist.current = true;
      setCheckOutcome(value.checkOutcome);
      setProofKind(value.proofKind);
      setProofNote(value.proofNote);
      setReferenceUrl(value.referenceUrl);
    } catch {
      localStorage.removeItem(`unthink:draft:${questId}:proof`);
    } finally {
      proofDraftHydrated.current = true;
    }
  }, [questId]);

  useEffect(() => {
    if (!proofDraftHydrated.current) return;
    if (skipNextProofDraftPersist.current) {
      skipNextProofDraftPersist.current = false;
      return;
    }
    localStorage.setItem(
      `unthink:draft:${questId}:proof`,
      JSON.stringify({ capsule, checkOutcome, proofKind, proofNote, referenceUrl }),
    );
  }, [capsule, checkOutcome, proofKind, proofNote, questId, referenceUrl]);

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
    const patch =
      step === "retrieve"
        ? { recall: draft }
        : step === "make"
          ? { practice: draft }
          : step === "connect"
            ? { connection: draft }
            : { feedback: draft };
    try {
      await save({ advance: true, clientMutationId: operationId("save"), patch, questId, step });
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
        if (proofFile === null) throw new Error("PROOF_FILE_REQUIRED");
        const uploadToken = operationId("upload");
        storageId = await uploadSmallProof({
          bytes: await proofFile.arrayBuffer(),
          contentType: proofFile.type,
          questId,
          uploadToken,
        });
      }
      const result = await complete({
        capsule,
        checkOutcome,
        operationId: id,
        proof: {
          kind: proofKind,
          note: proofNote,
          ...(proofKind === "reference" ? { referenceUrl } : {}),
          ...(storageId === undefined ? {} : { storageId }),
        },
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
      <div className="ds-workspace">
        <aside className="ds-rail" aria-label="Quest steps">
          {(["retrieve", "make", "connect", "feedback", "proof"] as const).map((item) => (
            <span aria-current={item === step ? "step" : undefined} key={item}>
              {item}
            </span>
          ))}
        </aside>
        <Panel title={lifecycle.quest.title}>
          <p className="ds-eyebrow">
            {lifecycle.quest.mode} · {step}
          </p>
          {profile?.learningPreferences?.timerVisible === true ? (
            <p className="ds-muted">Optional timer · {elapsedMinutes} min elapsed</p>
          ) : null}
          <p>{prompt}</p>
          {step === "proof" ? (
            <form className="ds-stack" onSubmit={(event) => void submitProof(event)}>
              <Field label="Proof kind">
                <select
                  onChange={(event) =>
                    setProofKind(event.target.value as "text" | "reference" | "file")
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
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
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
              {(Object.keys(capsule) as Array<keyof typeof capsule>).map((key) => (
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
            <div className="ds-stack">
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
          <div className="ds-actions">
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

export function ProofsPage() {
  const proofs = useQuery(api.evidence.listMine, { limit: 25 });
  return (
    <ProductPage>
      <Panel title="Proofs">
        {proofs === undefined ? <Status>Loading private proofs…</Status> : null}
        {proofs?.length === 0 ? <p>No proof yet. One completed quest is enough.</p> : null}
        <div className="ds-list">
          {proofs?.map((proof) => (
            <a href={`/proofs/${proof._id}`} key={proof._id}>
              <strong>{proof.family}</strong>
              <span>{new Date(proof.createdAt).toLocaleString()}</span>
            </a>
          ))}
        </div>
      </Panel>
    </ProductPage>
  );
}

export function ProofDetailPage() {
  const { proofId } = useParams({ strict: false }) as { proofId: Id<"evidence"> };
  const profile = useQuery(api.profile.get, {});
  const [deletedReceipt, setDeletedReceipt] = useState<{
    counts: { files: number; rows: number };
    operationId: string;
    state: string;
  } | null>(null);
  const proof = useQuery(api.evidence.getMine, deletedReceipt === null ? { proofId } : "skip");
  const preview = useQuery(
    api.privacy.preview,
    deletedReceipt === null ? { kind: "delete_proof", proofId } : "skip",
  );
  const confirmDelete = useAction(api.privacy.confirmDelete);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleteIdempotencyKey] = useState(() => operationId("delete-proof"));
  const [deleteOperationId] = useState(() => operationId("privacy-delete-proof"));
  if (deletedReceipt !== null) {
    return (
      <ProductPage>
        <Panel title="Deletion receipt">
          <p>State · {deletedReceipt.state}</p>
          <p>Operation · {deletedReceipt.operationId}</p>
          <p>
            Deleted · {deletedReceipt.counts.rows} row, {deletedReceipt.counts.files} file
          </p>
          <a href="/proofs">Back to Proofs</a>
        </Panel>
      </ProductPage>
    );
  }
  if (proof === undefined) return <Status>Loading proof…</Status>;
  return (
    <ProductPage>
      <Panel title={`${proof.family} proof`}>
        <p>
          <strong>{proof.quest.title}</strong> · {proof.quest.mode}
        </p>
        <p>{proof.quest.objective}</p>
        <p className="ds-muted">Done condition: {proof.quest.doneCondition}</p>
        <p>{proof.note}</p>
        {proof.referenceUrl === undefined ? null : <a href={proof.referenceUrl}>Open reference</a>}
        {proof.signedStorageUrl === null ? null : (
          <a href={proof.signedStorageUrl}>Open private file</a>
        )}
        <dl className="ds-capsule">
          {Object.entries(proof.capsule).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {profile?.rewardPreferences?.showXp === false ? null : (
          <p>{proof.reward.reduce((total, row) => total + row.amount, 0)} XP awarded</p>
        )}
        <div className="ds-stack">
          <p className="ds-muted">
            Delete this proof only: {preview?.counts.rows ?? 1} row and {preview?.counts.files ?? 0}{" "}
            file.
          </p>
          <Field label={`Type ${preview?.confirmation ?? "DELETE PROOF"}`}>
            <input onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
          </Field>
          <Button
            disabled={deleting || preview === undefined}
            onClick={() =>
              fire(async () => {
                if (preview === undefined) return;
                setDeleting(true);
                setDeleteError(false);
                try {
                  const receipt = await confirmDelete({
                    confirmation,
                    consequenceHash: preview.consequenceHash,
                    idempotencyKey: deleteIdempotencyKey,
                    kind: "delete_proof",
                    operationId: deleteOperationId,
                    proofId,
                  });
                  if (receipt.state !== "completed") {
                    throw new Error(receipt.failureClass ?? "DELETION_INCOMPLETE");
                  }
                  setDeletedReceipt(receipt);
                  setDeleting(false);
                } catch {
                  setDeleteError(true);
                  setDeleting(false);
                }
              })
            }
            tone="danger"
          >
            Delete this proof
          </Button>
          {deleteError ? (
            <p className="ds-error">
              Deletion did not complete. Sign in again and review the preview.
            </p>
          ) : null}
        </div>
      </Panel>
    </ProductPage>
  );
}

export function RewardsPage() {
  const profile = useQuery(api.profile.get, {});
  const rewards = useQuery(api.rewards.listAvailable, {});
  const ledger = useQuery(api.rewards.getLedger, {});
  const redemptions = useQuery(api.rewards.listRedemptions, {});
  const eligibleIntents = useQuery(api.rewards.getEligibleIntents, {});
  const redeem = useMutation(api.rewards.redeem);
  const [message, setMessage] = useState("");
  const [nextIntent, setNextIntent] = useState<
    "anchor" | "recall" | "bridge" | "teach" | "revival" | "north-star" | "review"
  >("anchor");
  useEffect(() => {
    if (eligibleIntents?.includes(nextIntent) === false)
      setNextIntent(eligibleIntents[0] ?? "anchor");
  }, [eligibleIntents, nextIntent]);
  return (
    <ProductPage>
      <Panel title="Deterministic rewards">
        <p className="ds-muted">Unlocks never consume or rewrite lifetime XP.</p>
        {profile?.rewardPreferences?.showXp === false ? null : (
          <p>Lifetime XP · {ledger?.lifetimeXp ?? 0}</p>
        )}
        {profile?.rewardPreferences?.rewardSuggestions === false ? (
          <p>Reward suggestions are hidden. You can enable them in Reward settings.</p>
        ) : null}
        <div className="ds-list">
          {rewards?.map((reward) => (
            <div className="ds-list-item" key={reward.rewardKey}>
              <strong>
                {reward.title}
                {profile?.rewardPreferences?.showXp === false ? "" : ` · ${reward.threshold} XP`}
              </strong>
              <span>{reward.description}</span>
              {reward.rewardKey === "choose-next-intent" && reward.state === "available" ? (
                <Field label="Choose the next reviewed intent">
                  <select
                    onChange={(event) => setNextIntent(event.target.value as typeof nextIntent)}
                    value={nextIntent}
                  >
                    {eligibleIntents?.map((intent) => (
                      <option key={intent} value={intent}>
                        {intent}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Button
                disabled={reward.state !== "available"}
                onClick={() =>
                  fire(async () => {
                    try {
                      await redeem({
                        catalogueVersion: reward.catalogueVersion,
                        ...(reward.rewardKey === "choose-next-intent"
                          ? { choiceKey: nextIntent }
                          : {}),
                        idempotencyKey: operationId("redeem"),
                        operationId: operationId("reward"),
                        rewardKey: reward.rewardKey,
                      });
                      setMessage("Receipt saved. Lifetime XP is unchanged.");
                    } catch {
                      setMessage("The reward state changed. Refresh and try again.");
                    }
                  })
                }
              >
                {reward.state === "available" ? "Use once" : reward.state}
              </Button>
            </div>
          ))}
        </div>
        <div className="ds-stack">
          <strong>Immutable award ledger</strong>
          {ledger?.rows.length === 0 ? <p>No awards yet.</p> : null}
          {ledger?.rows.map((row) => (
            <p className="ds-muted" key={row.operationId + row.awardKind}>
              {row.awardKind} · +{row.amount} · {new Date(row.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
        <div className="ds-stack">
          <strong>Redemption receipts</strong>
          {redemptions?.length === 0 ? <p>No redemptions yet.</p> : null}
          {redemptions?.map((receipt) => (
            <p className="ds-muted" key={receipt.operationId}>
              {receipt.rewardKey} · {receipt.state} · operation {receipt.operationId} ·{" "}
              {new Date(receipt.redeemedAt).toLocaleString()}
              {receipt.targetDayKey === undefined ? "" : ` · target ${receipt.targetDayKey}`}
              {receipt.appliedSeedKey === undefined ? "" : ` · seed ${receipt.appliedSeedKey}`}
            </p>
          ))}
        </div>
        {message ? <Status>{message}</Status> : null}
      </Panel>
    </ProductPage>
  );
}

export function SettingsPage({
  section,
}: {
  section: "learning" | "rewards" | "security" | "privacy";
}) {
  const profile = useQuery(api.profile.get, {});
  const deletePreview = useQuery(
    api.privacy.preview,
    section === "privacy" ? { kind: "delete_learning" } : "skip",
  );
  const prepareExport = useAction(api.privacy.prepareExport);
  const getExportDownload = useAction(api.privacy.exportDownload);
  const confirmDelete = useAction(api.privacy.confirmDelete);
  const updateLearningSettings = useMutation(api.profile.updateLearningSettings);
  const updateRewardSettings = useMutation(api.profile.updateRewardSettings);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [privacyReceipt, setPrivacyReceipt] = useState<{
    counts: { files: number; rows: number };
    operationId: string;
    state: string;
  } | null>(null);
  const [deleteLearningKey] = useState(() => operationId("delete-learning"));
  const [deleteLearningOperationId] = useState(() => operationId("privacy-delete"));
  const [settingsAnchor, setSettingsAnchor] = useState("");
  const [settingsRevival, setSettingsRevival] = useState("");
  const [settingsNorthStar, setSettingsNorthStar] = useState("");
  const [settingsSupports, setSettingsSupports] = useState<
    Array<"exact-resume" | "written-outline" | "low-stimulation" | "optional-timer">
  >([]);
  const [defaultMode, setDefaultMode] = useState<"rescue" | "standard" | "deep">("standard");
  const [lowStimulation, setLowStimulation] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);
  const [showXpSetting, setShowXpSetting] = useState(true);
  const [celebrationSetting, setCelebrationSetting] = useState(true);
  const [soundSetting, setSoundSetting] = useState(false);
  const [motionSetting, setMotionSetting] = useState(true);
  const [rewardSuggestionsSetting, setRewardSuggestionsSetting] = useState(true);
  const [rewardCategories, setRewardCategories] = useState<Array<"creative" | "choice">>([]);

  useEffect(() => {
    if (profile === undefined || profile === null) return;
    setSettingsAnchor(profile.anchor ?? "");
    setSettingsRevival(profile.revival ?? "");
    setSettingsNorthStar(profile.northStar ?? "");
    setSettingsSupports(profile.supports ?? []);
    setDefaultMode(profile.learningPreferences?.defaultMode ?? "standard");
    setLowStimulation(profile.learningPreferences?.lowStimulation ?? false);
    setTimerVisible(profile.learningPreferences?.timerVisible ?? false);
    setShowXpSetting(profile.rewardPreferences?.showXp ?? true);
    setCelebrationSetting(profile.rewardPreferences?.celebration ?? true);
    setSoundSetting(profile.rewardPreferences?.sound ?? false);
    setMotionSetting(profile.rewardPreferences?.motion ?? true);
    setRewardSuggestionsSetting(profile.rewardPreferences?.rewardSuggestions ?? true);
    setRewardCategories(profile.rewardPreferences?.rewardCategories ?? []);
  }, [profile]);

  const supportOptions = [
    "exact-resume",
    "written-outline",
    "low-stimulation",
    "optional-timer",
  ] as const;
  const rewardCategoryOptions = ["creative", "choice"] as const;
  const rewardToggles = [
    { checked: showXpSetting, label: "Show deterministic XP", setChecked: setShowXpSetting },
    {
      checked: celebrationSetting,
      label: "Show celebration",
      setChecked: setCelebrationSetting,
    },
    { checked: soundSetting, label: "Play sound", setChecked: setSoundSetting },
    { checked: motionSetting, label: "Use motion", setChecked: setMotionSetting },
    {
      checked: rewardSuggestionsSetting,
      label: "Show real-world reward suggestions",
      setChecked: setRewardSuggestionsSetting,
    },
  ];

  return (
    <ProductPage>
      <div className="ds-settings-nav">
        {(["learning", "rewards", "security", "privacy"] as const).map((item) => (
          <a
            aria-current={item === section ? "page" : undefined}
            href={`/settings/${item}`}
            key={item}
          >
            {item}
          </a>
        ))}
      </div>
      <Panel title={`Settings · ${section}`}>
        {section === "learning" ? (
          <form
            className="ds-stack"
            onSubmit={(event) => {
              event.preventDefault();
              fire(async () => {
                try {
                  await updateLearningSettings({
                    anchor: settingsAnchor,
                    learningPreferences: { defaultMode, lowStimulation, timerVisible },
                    northStar: settingsNorthStar,
                    revival: settingsRevival || undefined,
                    supports: settingsSupports,
                  });
                  setMessage("Learning settings saved.");
                } catch {
                  setMessage("Learning settings were not saved. Check the fields and retry.");
                }
              });
            }}
          >
            <Field label="Anchor">
              <input
                onChange={(event) => setSettingsAnchor(event.target.value)}
                required
                value={settingsAnchor}
              />
            </Field>
            <Field label="Revival (optional)">
              <input
                onChange={(event) => setSettingsRevival(event.target.value)}
                value={settingsRevival}
              />
            </Field>
            <Field label="North Star">
              <input
                onChange={(event) => setSettingsNorthStar(event.target.value)}
                required
                value={settingsNorthStar}
              />
            </Field>
            <Field label="Default capacity mode">
              <select
                onChange={(event) =>
                  setDefaultMode(event.target.value as "rescue" | "standard" | "deep")
                }
                value={defaultMode}
              >
                <option value="rescue">Rescue</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </Field>
            <div className="ds-stack">
              <strong>Supports</strong>
              {supportOptions.map((support) => (
                <label className="ds-check" key={support}>
                  <input
                    checked={settingsSupports.includes(support)}
                    onChange={(event) =>
                      setSettingsSupports((current) =>
                        event.target.checked
                          ? [...new Set([...current, support])]
                          : current.filter((value) => value !== support),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  {support}
                </label>
              ))}
            </div>
            <label className="ds-check">
              <input
                checked={lowStimulation}
                onChange={(event) => setLowStimulation(event.target.checked)}
                type="checkbox"
              />{" "}
              Use low-stimulation presentation
            </label>
            <label className="ds-check">
              <input
                checked={timerVisible}
                onChange={(event) => setTimerVisible(event.target.checked)}
                type="checkbox"
              />{" "}
              Show the optional timer
            </label>
            <p className="ds-muted">
              Why this shape? One Anchor, at most one Revival, and one horizon keep wider interests
              visible but not due.
            </p>
            <Button type="submit">Save learning settings</Button>
          </form>
        ) : null}
        {section === "rewards" ? (
          <form
            className="ds-stack"
            onSubmit={(event) => {
              event.preventDefault();
              fire(async () => {
                try {
                  await updateRewardSettings({
                    preferences: {
                      celebration: celebrationSetting,
                      motion: motionSetting,
                      rewardCategories,
                      rewardSuggestions: rewardSuggestionsSetting,
                      showXp: showXpSetting,
                      sound: soundSetting,
                    },
                  });
                  setMessage("Reward settings saved.");
                } catch {
                  setMessage("Reward settings were not saved. Retry the same action.");
                }
              });
            }}
          >
            {rewardToggles.map(({ checked, label, setChecked }) => (
              <label className="ds-check" key={label}>
                <input
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  type="checkbox"
                />{" "}
                {label}
              </label>
            ))}
            <div className="ds-stack">
              <strong>Allowed pre-agreed reward categories</strong>
              {rewardCategoryOptions.map((category) => (
                <label className="ds-check" key={category}>
                  <input
                    checked={rewardCategories.includes(category)}
                    onChange={(event) =>
                      setRewardCategories((current) =>
                        event.target.checked
                          ? [...new Set([...current, category])]
                          : current.filter((value) => value !== category),
                      )
                    }
                    type="checkbox"
                  />{" "}
                  {category}
                </label>
              ))}
            </div>
            <Button type="submit">Save reward settings</Button>
          </form>
        ) : null}
        {section === "security" ? (
          <div className="ds-stack">
            <p>
              Password is the currently tested recovery credential. Passkeys appear only after the
              live compatibility gate.
            </p>
            <Button onClick={() => void authClient.revokeOtherSessions()}>
              Sign out other sessions
            </Button>
            <Button
              onClick={() =>
                fire(async () => {
                  const result = await authClient.signOut();
                  if (!result.error) clearDeviceDrafts();
                })
              }
              tone="quiet"
            >
              Sign out here
            </Button>
          </div>
        ) : null}
        {section === "privacy" ? (
          <div className="ds-stack">
            <p>
              Convex stores canonical learning data. Optional PostHog receives only redacted
              operation facts.
            </p>
            <Button
              onClick={() =>
                fire(async () => {
                  try {
                    const receipt = await prepareExport({
                      idempotencyKey: operationId("export"),
                      operationId: operationId("privacy"),
                    });
                    setExportUrl(await getExportDownload({ operationId: receipt.operationId }));
                    setMessage(
                      `Export prepared: ${receipt.counts.rows} rows, checksum ${receipt.checksum.slice(0, 12)}…`,
                    );
                  } catch {
                    setMessage("Sign in again, then retry the export.");
                  }
                })
              }
            >
              Prepare private export
            </Button>
            {exportUrl ? <a href={exportUrl}>Download the short-lived private export</a> : null}
            <Field label="Typed confirmation">
              <input
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </Field>
            <Button
              tone="danger"
              onClick={() =>
                fire(async () => {
                  if (deletePreview === undefined) return;
                  try {
                    const receipt = await confirmDelete({
                      confirmation,
                      consequenceHash: deletePreview.consequenceHash,
                      idempotencyKey: deleteLearningKey,
                      kind: "delete_learning",
                      operationId: deleteLearningOperationId,
                    });
                    if (receipt.state !== "completed") {
                      setMessage(`Deletion is retryable: ${receipt.failureClass ?? "incomplete"}.`);
                      return;
                    }
                    clearDeviceDrafts();
                    setPrivacyReceipt(receipt);
                    setMessage("Learning data deletion receipt saved; device drafts cleared.");
                  } catch {
                    setMessage(
                      "Deletion did not complete. Review the current preview and sign in again.",
                    );
                  }
                })
              }
            >
              Delete all learning data
            </Button>
            <p className="ds-muted">
              Account closure stays hidden until live Better Auth identity deletion and session
              revocation pass the compatibility gate.
            </p>
          </div>
        ) : null}
        {message ? <Status>{message}</Status> : null}
        {privacyReceipt === null ? null : (
          <div className="ds-stack">
            <strong>Durable deletion receipt</strong>
            <span>State · {privacyReceipt.state}</span>
            <span>Operation · {privacyReceipt.operationId}</span>
            <span>
              Deleted · {privacyReceipt.counts.rows} rows, {privacyReceipt.counts.files} files
            </span>
          </div>
        )}
      </Panel>
    </ProductPage>
  );
}
