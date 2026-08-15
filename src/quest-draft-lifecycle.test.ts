import { describe, expect, test } from "vitest";

import { createQuestDraftTracker, questProgressUpdate } from "./quest-draft-lifecycle";

describe("quest draft lifecycle", () => {
  test("advancing to the next step does not turn the programmatic reset into an autosave", () => {
    const tracker = createQuestDraftTracker("working answer");

    expect(tracker.observe("working answer plus one detail")).toBe(
      "working answer plus one detail",
    );

    tracker.replace("");

    expect(tracker.observe("")).toBeNull();
  });

  test("each editable quest step produces its matching durable progress update", () => {
    expect(questProgressUpdate("retrieve", "recall")).toEqual({ step: "retrieve", text: "recall" });
    expect(questProgressUpdate("make", "practice")).toEqual({ step: "make", text: "practice" });
    expect(questProgressUpdate("connect", "bridge")).toEqual({ step: "connect", text: "bridge" });
    expect(questProgressUpdate("feedback", "check")).toEqual({ step: "feedback", text: "check" });
  });
});
