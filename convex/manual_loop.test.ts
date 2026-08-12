/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const dayKey = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Dhaka",
  year: "numeric",
}).format(new Date());

function createManualLoop() {
  const backend = convexTest(schema, modules);
  return {
    owner: backend.withIdentity({ subject: "owner" }),
    stranger: backend.withIdentity({ subject: "stranger" }),
  };
}

test("the owner can onboard, resume, and complete one daily quest exactly once", async () => {
  const { owner, stranger } = createManualLoop();

  expect(await owner.query(api.profile.get, {})).toBeNull();
  await owner.mutation(api.profile.saveOnboardingStep, {
    payload: { accepted: true },
    step: "promise",
  });
  const draft = await owner.mutation(api.profile.saveOnboardingDraft, {
    anchor: "backend systems in progress",
    calibration: [],
    friction: {
      distract: "skip",
      estimate: "skip",
      overload: "skip",
      remember: "skip",
      resume: "skip",
      start: "skip",
      stop: "skip",
      switch: "skip",
    },
    northStar: "physics in progress",
    rewardPreferences: {
      celebration: true,
      motion: true,
      rewardCategories: ["creative", "choice"],
      rewardSuggestions: true,
      showXp: true,
      sound: false,
    },
    supports: ["exact-resume"],
  });
  expect(draft.anchor).toBe("backend systems in progress");
  expect(draft.calibrationDraft).toEqual([]);
  await expect(
    owner.mutation(api.profile.completeOnboarding, { timezone: "Asia/Dhaka" }),
  ).rejects.toThrow("ONBOARDING_INCOMPLETE");
  await expect(
    owner.mutation(api.profile.saveOnboardingDraft, {
      anchor: "backend systems",
      calibration: Array.from({ length: 6 }, () => ({
        correction: "",
        observation: "",
        taskKey: "recall" as const,
      })),
      friction: {
        distract: "skip",
        estimate: "skip",
        overload: "skip",
        remember: "skip",
        resume: "skip",
        start: "skip",
        stop: "skip",
        switch: "skip",
      },
      northStar: "physics",
      rewardPreferences: {
        celebration: true,
        rewardCategories: ["creative", "choice"],
        rewardSuggestions: true,
        showXp: true,
        sound: false,
      },
      supports: ["exact-resume"],
    }),
  ).rejects.toThrow("CALIBRATION_DRAFT_INVALID");
  await expect(
    owner.mutation(api.profile.saveOnboardingStep, {
      payload: {
        observations: ["recall", "apply", "bridge", "teach", "stop"].map((taskKey) => ({
          correction: "",
          observation: `Completed ${taskKey}`,
          taskKey: taskKey as "recall" | "apply" | "bridge" | "teach" | "stop",
        })),
      },
      step: "calibration",
    }),
  ).rejects.toThrow("ONBOARDING_STEP_OUT_OF_ORDER");
  await owner.mutation(api.profile.saveOnboardingStep, {
    payload: {
      anchor: "backend-systems",
      establishedDomainKeys: ["frontend", "robotics", "infrastructure"],
      northStar: "physics",
      revival: "drawing",
    },
    step: "goals",
  });
  await owner.mutation(api.profile.saveOnboardingStep, {
    payload: {
      friction: {
        distract: "sometimes",
        estimate: "sometimes",
        overload: "yes",
        remember: "yes",
        resume: "yes",
        start: "yes",
        stop: "sometimes",
        switch: "sometimes",
      },
      supports: ["exact-resume", "written-outline", "low-stimulation"],
    },
    step: "supports",
  });
  await owner.mutation(api.profile.saveOnboardingStep, {
    payload: {
      celebration: true,
      rewardSuggestions: true,
      showXp: true,
      sound: false,
    },
    step: "rewards",
  });
  await owner.mutation(api.profile.saveOnboardingStep, {
    payload: {
      observations: [
        { correction: "", observation: "Recalled the tradeoff", taskKey: "recall" },
        { correction: "", observation: "Built a bounded example", taskKey: "apply" },
        { correction: "", observation: "Named the analogy limit", taskKey: "bridge" },
        { correction: "", observation: "Explained the failure mode", taskKey: "teach" },
        { correction: "", observation: "Stopped at enough", taskKey: "stop" },
      ],
    },
    step: "calibration",
  });
  const profile = await owner.mutation(api.profile.completeOnboarding, {
    timezone: "Asia/Dhaka",
  });
  expect(profile.onboardingComplete).toBe(true);
  expect(profile.learningPreferences).toEqual({
    defaultMode: "standard",
    lowStimulation: true,
    timerVisible: false,
  });

  const learningSettings = await owner.mutation(api.profile.updateLearningSettings, {
    anchor: "distributed-systems",
    learningPreferences: {
      defaultMode: "rescue",
      lowStimulation: true,
      timerVisible: false,
    },
    northStar: "physics",
    revival: "drawing",
    supports: ["exact-resume", "low-stimulation"],
  });
  expect(learningSettings.learningPreferences).toEqual({
    defaultMode: "rescue",
    lowStimulation: true,
    timerVisible: false,
  });
  const rewardSettings = await owner.mutation(api.profile.updateRewardSettings, {
    preferences: {
      celebration: false,
      motion: false,
      rewardCategories: ["creative", "choice", "creative"],
      rewardSuggestions: true,
      showXp: false,
      sound: false,
    },
  });
  expect(rewardSettings.rewardPreferences?.rewardCategories).toEqual(["creative", "choice"]);

  const first = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: `prepare-${dayKey}`,
  });
  const repeated = await owner.mutation(api.quests.prepareToday, {
    dayKey,
    operationId: "prepare-retry",
  });
  expect(repeated.quest._id).toBe(first.quest._id);

  await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: `start-${dayKey}`,
    questId: first.quest._id,
  });
  const saved = await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-recall-1",
    patch: { recall: "Cancellation is cooperative, not forced." },
    questId: first.quest._id,
    step: "retrieve",
  });
  const duplicateSave = await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-recall-1",
    patch: { recall: "A retry must not overwrite this." },
    questId: first.quest._id,
    step: "retrieve",
  });
  expect(duplicateSave.revision).toBe(saved.revision);

  await owner.mutation(api.quests.requestHelp, {
    choice: "park",
    operationId: "park-operation-1",
    questId: first.quest._id,
  });
  await owner.mutation(api.quests.startOrResize, {
    mode: "standard",
    operationId: `resume-${dayKey}`,
    questId: first.quest._id,
  });
  const practiceSaved = await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-practice-1",
    patch: { practice: "I made cleanup idempotent." },
    questId: first.quest._id,
    step: "make",
  });
  const delayedRecallRetry = await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-recall-1",
    patch: { recall: "A delayed retry must not regress newer work." },
    questId: first.quest._id,
    step: "retrieve",
  });
  expect(delayedRecallRetry).toEqual(practiceSaved);
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-connection-1",
    patch: { connection: "Like an interrupt line, except cancellation can be declined." },
    questId: first.quest._id,
    step: "connect",
  });
  await owner.mutation(api.quests.saveProgress, {
    clientMutationId: "save-feedback-1",
    patch: { feedback: "The boundary is whether the callee reaches a cancellation point." },
    questId: first.quest._id,
    step: "feedback",
  });

  const completionArgs = {
    capsule: {
      boundary: "A non-cooperative task can ignore cancellation.",
      connection: "Hardware interrupts need an explicit handler too.",
      example: "A worker checks an abort signal between bounded chunks.",
      idea: "Cancellation is a protocol.",
      retrievalCue: "Where can cancellation be observed?",
    },
    checkOutcome: "The example names the observation boundary.",
    operationId: `complete-${dayKey}`,
    proof: {
      kind: "text" as const,
      note: "Implemented and checked a cooperative cancellation path.",
    },
    questId: first.quest._id,
  };
  const completed = await owner.mutation(api.quests.complete, completionArgs);
  const retried = await owner.mutation(api.quests.complete, completionArgs);
  expect(retried).toEqual(completed);
  expect(completed.xpAwarded).toBeGreaterThanOrEqual(5);

  const today = await owner.query(api.quests.getToday, { dayKey });
  expect(today.quest?.status).toBe("completed");
  expect(today.attempt?.drafts.recall).toBe("Cancellation is cooperative, not forced.");
  expect(today.lifetimeXp).toBe(completed.xpAwarded);

  const proofs = await owner.query(api.evidence.listMine, { limit: 10 });
  expect(proofs).toHaveLength(1);
  await expect(stranger.query(api.evidence.getMine, { proofId: proofs[0]!._id })).rejects.toThrow(
    "NOT_FOUND",
  );
});
