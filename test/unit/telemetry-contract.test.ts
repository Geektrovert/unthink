import { expect, test } from "vitest";

import {
  createJourneyId,
  findJourney,
  isJourneyId,
  journeyDefinition,
  postHogInsertId,
} from "../../shared/telemetry-contract";

test("one shared definition owns both hops of a user journey", () => {
  const journey = journeyDefinition("start_quest");
  expect(journey).toEqual({
    eventName: "quest_started",
    operationName: "start_quest",
    route: "/today",
  });
  expect(findJourney(journey.eventName, journey.operationName, journey.route)).toBe("start_quest");
});

test("journey IDs and per-outcome hop IDs remain correlated without suppressing a retry", () => {
  const id = createJourneyId("complete_quest", "123e4567-e89b-42d3-a456-426614174010");
  expect(isJourneyId(id)).toBe(true);
  expect(postHogInsertId(id, "browser", "failed")).not.toBe(
    postHogInsertId(id, "browser", "succeeded"),
  );
  expect(postHogInsertId(id, "backend", "succeeded")).not.toBe(
    postHogInsertId(id, "browser", "succeeded"),
  );
});
