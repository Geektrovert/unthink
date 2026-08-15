import { describe, expect, test } from "vitest";

import { reconcileLearningSettings, reconcileRewardSettings } from "./settings-form";

describe("settings form recovery", () => {
  test("preserves an unsaved learning draft when the profile refreshes", () => {
    expect(
      reconcileLearningSettings(
        {
          anchor: "Server anchor",
          learningPreferences: {
            defaultMode: "standard",
            lowStimulation: false,
            timerVisible: false,
          },
          northStar: "Server horizon",
          revival: "Server revival",
          supports: ["exact-resume"],
        },
        { isDirty: true },
      ),
    ).toEqual({ kind: "preserve-draft" });
  });

  test("refreshes pristine settings from the canonical profile", () => {
    const profile = {
      anchor: "Keep the core idea visible",
      learningPreferences: {
        defaultMode: "deep" as const,
        lowStimulation: true,
        timerVisible: true,
      },
      northStar: "Build a durable model",
      revival: undefined,
      rewardPreferences: {
        celebration: false,
        motion: false,
        rewardCategories: ["creative" as const],
        rewardSuggestions: false,
        showXp: false,
        sound: true,
      },
      supports: ["optional-timer" as const],
    };

    expect(reconcileLearningSettings(profile, { isDirty: false })).toEqual({
      kind: "replace-from-profile",
      values: {
        anchor: "Keep the core idea visible",
        defaultMode: "deep",
        lowStimulation: true,
        northStar: "Build a durable model",
        revival: "",
        supports: ["optional-timer"],
        timerVisible: true,
      },
    });
    expect(reconcileRewardSettings(profile, { isDirty: false })).toEqual({
      kind: "replace-from-profile",
      values: {
        celebration: false,
        motion: false,
        rewardCategories: ["creative"],
        rewardSuggestions: false,
        showXp: false,
        sound: true,
      },
    });
  });
});
