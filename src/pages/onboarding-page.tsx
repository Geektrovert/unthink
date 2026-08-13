import { Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { api } from "../../convex/_generated/api";
import { resumableOnboardingStep, type OnboardingStep } from "../onboarding";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Field, Panel, ProductPage, Status } from "../ui/surface";

type Friction = Record<
  "distract" | "estimate" | "overload" | "remember" | "resume" | "start" | "stop" | "switch",
  "yes" | "sometimes" | "no" | "skip"
>;

const frictionKeys = [
  "distract",
  "estimate",
  "overload",
  "remember",
  "resume",
  "start",
  "stop",
  "switch",
] as const;
const frictionResponses = ["yes", "sometimes", "no", "skip"] as const;

const calibrationTasks = [
  {
    key: "recall",
    prompt: "Close your notes and explain one idea you learned recently in three sentences.",
  },
  {
    key: "apply",
    prompt: "Use that idea in the smallest concrete example you can inspect.",
  },
  {
    key: "bridge",
    prompt: "Connect it to a domain you already know, then name where the analogy breaks.",
  },
  {
    key: "teach",
    prompt: "Explain the idea for a capable peer and include one likely failure mode.",
  },
  {
    key: "stop",
    prompt: "Stop at a clear done condition and record what made it enough.",
  },
] as const;

function parseDomainKeys(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
}

export function OnboardingPage() {
  const profile = useQuery(api.profile.get, {});
  const saveStep = useMutation(api.profile.saveOnboardingStep);
  const saveDraft = useMutation(api.profile.saveOnboardingDraft);
  const complete = useMutation(api.profile.completeOnboarding);
  const navigate = useNavigate();
  const params = useParams({ from: "/onboarding/$step" });
  const persistedStep = profile?.onboardingStep ?? "promise";
  const step = resumableOnboardingStep(persistedStep);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [anchor, setAnchor] = useState("backend systems");
  const [revival, setRevival] = useState("drawing");
  const [northStar, setNorthStar] = useState("physics");
  const [domainKeys, setDomainKeys] = useState("backend, systems");
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
    setDomainKeys(profile.establishedDomainKeys?.join(", ") ?? "backend, systems");
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
        calibration: calibrationTasks.map(({ key: taskKey }) => ({
          correction: corrections[taskKey] ?? "",
          observation: calibration[taskKey] ?? "",
          taskKey,
        })),
        establishedDomainKeys: parseDomainKeys(domainKeys),
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
    domainKeys,
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

  async function run<Result>(next: () => Promise<Result>, nextStep?: OnboardingStep) {
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
        <p className={ui.muted}>
          Why this shape? It records preferences and observed work, never an ADHD or mastery score.
        </p>
        {draftStatus === "saving" ? <p className={ui.muted}>Saving this draft…</p> : null}
        {draftStatus === "dirty" ? <p className={ui.muted}>Draft has unsaved changes.</p> : null}
        {draftStatus === "saved" ? <p className={ui.muted}>Draft saved.</p> : null}
        {draftStatus === "failed" ? (
          <div className={ui.stack}>
            <p className={ui.error} role="alert">
              This edit is still on screen but has not synced.
            </p>
            <Button onClick={() => setDraftRetry((value) => value + 1)} tone="quiet">
              Retry draft save
            </Button>
          </div>
        ) : null}
        {step === "promise" ? (
          <div className={ui.stack}>
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
            className={ui.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  saveStep({
                    payload: {
                      anchor,
                      establishedDomainKeys: parseDomainKeys(domainKeys),
                      northStar,
                      revival: revival.trim().length === 0 ? undefined : revival,
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
            <Field label="Domains you already know (comma-separated)">
              <input
                onChange={(event) => setDomainKeys(event.target.value)}
                required
                value={domainKeys}
              />
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
          <div className={ui.stack}>
            <p>
              Start, memory, switching, time, stopping, overload, distraction, and resume stay
              separate.
            </p>
            {frictionKeys.map((key) => (
              <Field key={key} label={`${key} friction`}>
                <select
                  onChange={(event) => {
                    const response = frictionResponses.find(
                      (candidate) => candidate === event.target.value,
                    );
                    if (response !== undefined) {
                      setFriction((current) => ({ ...current, [key]: response }));
                    }
                  }}
                  value={friction[key]}
                >
                  {frictionResponses.map((value) => (
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
              <label className={ui.check} key={support}>
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
          <div className={ui.stack}>
            <label className={ui.check}>
              <input
                checked={showXp}
                onChange={(event) => setShowXp(event.target.checked)}
                type="checkbox"
              />{" "}
              Show deterministic XP
            </label>
            <label className={ui.check}>
              <input
                checked={rewardSuggestions}
                onChange={(event) => setRewardSuggestions(event.target.checked)}
                type="checkbox"
              />{" "}
              Show pre-agreed reward suggestions
            </label>
            <label className={ui.check}>
              <input
                checked={celebration}
                onChange={(event) => setCelebration(event.target.checked)}
                type="checkbox"
              />{" "}
              Show completion celebration
            </label>
            <label className={ui.check}>
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
            className={ui.stack}
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveStep({
                  payload: {
                    observations: calibrationTasks.map(({ key: taskKey }) => ({
                      correction: corrections[taskKey] ?? "",
                      observation: calibration[taskKey] ?? "",
                      taskKey,
                    })),
                  },
                  step: "calibration",
                });
                await complete({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
              });
            }}
          >
            {calibrationTasks.map(({ key: taskKey, prompt }) => (
              <div className={ui.stack} key={taskKey}>
                <p>
                  <strong>{taskKey}</strong>: {prompt}
                </p>
                <Field label="What happened when you tried it?">
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
          <p className={ui.error} role="alert">
            Your input is still here. Try the same action again.
          </p>
        ) : null}
      </Panel>
    </ProductPage>
  );
}
