import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../convex/_generated/api";
import { beginBrowserJourney, newJourneyId } from "../posthog";
import { localDayKey, operationId } from "./support";
import { Button } from "../ui/button";
import { ui } from "../ui/classes";
import { Panel, ProductPage, Status } from "../ui/surface";

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
    const startOperationId = newJourneyId("start_quest");
    const browserOperation = beginBrowserJourney("start_quest", startOperationId);
    try {
      const lifecycle =
        currentToday.quest === null
          ? await prepare({ dayKey, operationId: operationId("prepare") })
          : { attempt: currentToday.attempt!, quest: currentToday.quest };
      await start({ mode, operationId: startOperationId, questId: lifecycle.quest._id });
      browserOperation.succeeded();
      await navigate({ params: { questId: lifecycle.quest._id }, to: "/quest/$questId" });
    } catch (cause) {
      browserOperation.failed(cause);
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <ProductPage>
      <Panel title={today.quest?.title ?? "One useful thing."}>
        <p className={ui.muted}>
          {today.quest?.whyNow ?? "Prepare one reviewed quest. Missing yesterday created no debt."}
        </p>
        {today.quest === null ? null : (
          <p>
            <strong>Done:</strong> {today.quest.doneCondition}
          </p>
        )}
        <div className={ui.actions} aria-label="Choose capacity">
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
          <Status>Parked safely at {today.attempt?.currentStep ?? "the saved step"}.</Status>
        ) : null}
        {profile.rewardPreferences?.showXp === false ? null : (
          <p className={ui.muted}>
            Today {today.dayXp} XP · lifetime {today.lifetimeXp} XP
          </p>
        )}
        <p className={ui.muted}>
          Weekly momentum · {today.weeklyMomentum.completedQuests} completed quest
          {today.weeklyMomentum.completedQuests === 1 ? "" : "s"} in the last 7 days
        </p>
        {error ? (
          <p className={ui.error} role="alert">
            Nothing was claimed as started. Try again.
          </p>
        ) : null}
      </Panel>
    </ProductPage>
  );
}
