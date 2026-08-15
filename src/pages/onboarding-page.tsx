import { Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { api } from "../../convex/_generated/api";
import {
  frictionResponses,
  rewardCategoryOptions,
  supportOptions,
} from "../../shared/product-contract";
import { resumableOnboardingStep, type OnboardingStep } from "../onboarding";
import { beginBrowserJourney, newJourneyId } from "../posthog";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { useAppForm } from "../ui/form";
import { Panel, ProductPage, Status } from "../ui/surface";
import {
  boundedGoal,
  calibrationTasks,
  correctionSchema,
  domainKeysSchema,
  emptyCalibration,
  emptyFriction,
  frictionKeys,
  initialOnboardingValues,
  observationSchema,
  optionalGoal,
  parseDomainKeys,
} from "./onboarding-form";

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
  const [onboardingHydrated, setOnboardingHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "failed">(
    "idle",
  );
  const [draftRetry, setDraftRetry] = useState(0);
  const draftRevision = useRef(0);

  const form = useAppForm({
    defaultValues: initialOnboardingValues(),
    onSubmit: async ({ value }) => {
      switch (step) {
        case "goals":
          await run(
            () =>
              saveStep({
                payload: {
                  anchor: value.anchor,
                  establishedDomainKeys: parseDomainKeys(value.domainKeys),
                  northStar: value.northStar,
                  revival: value.revival.trim().length === 0 ? undefined : value.revival,
                },
                step: "goals",
              }),
            "supports",
          );
          break;
        case "supports":
          await run(
            () =>
              saveStep({
                payload: { friction: value.friction, supports: value.supports },
                step: "supports",
              }),
            "rewards",
          );
          break;
        case "rewards":
          await run(
            () =>
              saveStep({
                payload: {
                  celebration: value.celebration,
                  motion: true,
                  rewardCategories: [...rewardCategoryOptions],
                  rewardSuggestions: value.rewardSuggestions,
                  showXp: value.showXp,
                  sound: value.sound,
                },
                step: "rewards",
              }),
            "calibration",
          );
          break;
        case "calibration": {
          const onboardingOperationId = newJourneyId("complete_onboarding");
          await run(
            async () => {
              await saveStep({
                payload: {
                  observations: calibrationTasks.map(({ key: taskKey }) => ({
                    correction: value.calibration[taskKey].correction,
                    observation: value.calibration[taskKey].observation,
                    taskKey,
                  })),
                },
                step: "calibration",
              });
              await complete({
                operationId: onboardingOperationId,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
            },
            undefined,
            { journey: "complete_onboarding", operationId: onboardingOperationId },
          );
          break;
        }
        case "promise":
          break;
      }
    },
  });

  useEffect(() => {
    if (profile === undefined || profile === null || onboardingHydrated) return;
    const savedCalibration = profile.calibrationDraft ?? profile.calibration;
    const calibration = structuredClone(emptyCalibration);
    for (const item of savedCalibration ?? []) {
      calibration[item.taskKey] = {
        correction: item.correction,
        observation: item.observation,
      };
    }
    form.reset({
      anchor: profile.anchor ?? "backend systems",
      calibration,
      celebration: profile.rewardPreferences?.celebration ?? true,
      domainKeys: profile.establishedDomainKeys?.join(", ") ?? "backend, systems",
      friction: profile.friction ?? { ...emptyFriction },
      northStar: profile.northStar ?? "physics",
      revival: profile.revival ?? "",
      rewardSuggestions: profile.rewardPreferences?.rewardSuggestions ?? true,
      showXp: profile.rewardPreferences?.showXp ?? true,
      sound: profile.rewardPreferences?.sound ?? false,
      supports: profile.supports ?? ["exact-resume"],
    });
    setOnboardingHydrated(true);
  }, [form, onboardingHydrated, profile]);

  useEffect(() => {
    if (!onboardingHydrated || profile?.onboardingComplete === true) return;
    let timer: number | undefined;
    let previousValues = form.state.values;

    const queueSave = (force = false) => {
      const currentValues = form.state.values;
      if (!force && currentValues === previousValues) return;
      previousValues = currentValues;
      const revision = ++draftRevision.current;
      setDraftStatus("dirty");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setDraftStatus("saving");
        const value = currentValues;
        void saveDraft({
          anchor: value.anchor,
          calibration: calibrationTasks.map(({ key: taskKey }) => ({
            correction: value.calibration[taskKey].correction,
            observation: value.calibration[taskKey].observation,
            taskKey,
          })),
          establishedDomainKeys: parseDomainKeys(value.domainKeys),
          friction: value.friction,
          northStar: value.northStar,
          revival: value.revival || undefined,
          rewardPreferences: {
            celebration: value.celebration,
            motion: true,
            rewardCategories: [...rewardCategoryOptions],
            rewardSuggestions: value.rewardSuggestions,
            showXp: value.showXp,
            sound: value.sound,
          },
          supports: value.supports,
        })
          .then(() => {
            if (draftRevision.current === revision) setDraftStatus("saved");
          })
          .catch(() => {
            if (draftRevision.current === revision) setDraftStatus("failed");
          });
      }, 700);
    };

    const subscription = form.store.subscribe(() => queueSave());
    if (draftRetry > 0) queueSave(true);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [draftRetry, form, onboardingHydrated, profile?.onboardingComplete, saveDraft]);

  if (profile === undefined) return <Status>Loading your saved onboarding step…</Status>;
  if (profile?.onboardingComplete) return <Navigate to="/today" replace />;
  if (params.step !== step) {
    return <Navigate params={{ step }} to="/onboarding/$step" replace />;
  }

  async function run<Result>(
    next: () => Promise<Result>,
    nextStep?: OnboardingStep,
    telemetry?: { journey: "complete_onboarding"; operationId: string },
  ) {
    setPending(true);
    setError(false);
    const browserOperation =
      telemetry === undefined
        ? undefined
        : beginBrowserJourney(telemetry.journey, telemetry.operationId);
    try {
      await next();
      if (nextStep === undefined) {
        browserOperation?.succeeded();
        await navigate({ to: "/today" });
      } else {
        await navigate({ params: { step: nextStep }, to: "/onboarding/$step" });
      }
    } catch (cause) {
      browserOperation?.failed(cause);
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
          <form.AppForm>
            <form.FormRoot>
              <form.AppField name="anchor" validators={{ onSubmit: boundedGoal }}>
                {(field) => <field.TextField label="Anchor to deepen now" />}
              </form.AppField>
              <form.AppField name="domainKeys" validators={{ onSubmit: domainKeysSchema }}>
                {(field) => <field.TextField label="Domains you already know (comma-separated)" />}
              </form.AppField>
              <form.AppField name="revival" validators={{ onSubmit: optionalGoal }}>
                {(field) => <field.TextField label="Optional Revival" />}
              </form.AppField>
              <form.AppField name="northStar" validators={{ onSubmit: boundedGoal }}>
                {(field) => <field.TextField label="North Star" />}
              </form.AppField>
              <form.SubmitButton idleLabel="Save goals" pending={pending} pendingLabel="Saving…" />
            </form.FormRoot>
          </form.AppForm>
        ) : null}
        {step === "supports" ? (
          <form.AppForm>
            <form.FormRoot>
              <p>
                Start, memory, switching, time, stopping, overload, distraction, and resume stay
                separate.
              </p>
              {frictionKeys.map((key) => (
                <form.AppField key={key} name={`friction.${key}`}>
                  {(field) => (
                    <field.SelectField
                      items={frictionResponses.map((value) => ({ label: value, value }))}
                      label={`${key} friction`}
                    />
                  )}
                </form.AppField>
              ))}
              <form.AppField
                name="supports"
                validators={{ onSubmit: z.array(z.enum(supportOptions)).max(4) }}
              >
                {(field) => (
                  <field.CheckboxGroupField
                    items={supportOptions.map((value) => ({ label: value, value }))}
                    legend="Helpful supports"
                  />
                )}
              </form.AppField>
              <form.SubmitButton
                idleLabel="Use these supports"
                pending={pending}
                pendingLabel="Saving…"
              />
            </form.FormRoot>
          </form.AppForm>
        ) : null}
        {step === "rewards" ? (
          <form.AppForm>
            <form.FormRoot>
              {(
                [
                  ["showXp", "Show deterministic XP"],
                  ["rewardSuggestions", "Show pre-agreed reward suggestions"],
                  ["celebration", "Show completion celebration"],
                  ["sound", "Play an opt-in completion sound"],
                ] as const
              ).map(([name, label]) => (
                <form.AppField key={name} name={name}>
                  {(field) => <field.CheckboxField label={label} />}
                </form.AppField>
              ))}
              <form.SubmitButton
                idleLabel="Save reward display"
                pending={pending}
                pendingLabel="Saving…"
              />
            </form.FormRoot>
          </form.AppForm>
        ) : null}
        {step === "calibration" ? (
          <form.AppForm>
            <form.FormRoot>
              {calibrationTasks.map(({ key: taskKey, prompt }) => (
                <div className={ui.stack} key={taskKey}>
                  <p>
                    <strong>{taskKey}</strong>: {prompt}
                  </p>
                  <form.AppField
                    name={`calibration.${taskKey}.observation`}
                    validators={{ onSubmit: observationSchema }}
                  >
                    {(field) => <field.TextAreaField label="What happened when you tried it?" />}
                  </form.AppField>
                  <form.AppField
                    name={`calibration.${taskKey}.correction`}
                    validators={{ onSubmit: correctionSchema }}
                  >
                    {(field) => <field.TextAreaField label={`${taskKey}: optional correction`} />}
                  </form.AppField>
                </div>
              ))}
              <form.SubmitButton
                idleLabel="Finish calibration"
                pending={pending}
                pendingLabel="Saving…"
              />
            </form.FormRoot>
          </form.AppForm>
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
