export const TELEMETRY_SCHEMA_VERSION = 2;
export const TELEMETRY_REDACTION_VERSION = 2;

export const TELEMETRY_STAGES = ["development", "local", "production", "staging", "test"] as const;

export type TelemetryStage = (typeof TELEMETRY_STAGES)[number];
export type TelemetryHop = "browser" | "backend";
export type TelemetryOutcome = "expected_failure" | "failed" | "succeeded";

export const JOURNEYS = {
  advance_quest_step: {
    eventName: "quest_step_advanced",
    operationName: "advance_quest_step",
    route: "/quest/:questId",
  },
  complete_onboarding: {
    eventName: "onboarding_completed",
    operationName: "complete_onboarding",
    route: "/onboarding/:step",
  },
  complete_quest: {
    eventName: "learning_operation_completed",
    operationName: "complete_quest",
    route: "/quest/:questId",
  },
  delete_learning_data: {
    eventName: "learning_data_deleted",
    operationName: "delete_learning_data",
    route: "/settings/privacy",
  },
  delete_proof: {
    eventName: "proof_deleted",
    operationName: "delete_proof",
    route: "/proofs/:proofId",
  },
  prepare_learning_data_export: {
    eventName: "learning_data_export_prepared",
    operationName: "prepare_learning_data_export",
    route: "/settings/privacy",
  },
  redeem_reward: {
    eventName: "reward_redeemed",
    operationName: "redeem_reward",
    route: "/rewards",
  },
  request_quest_help: {
    eventName: "quest_help_requested",
    operationName: "request_quest_help",
    route: "/quest/:questId",
  },
  start_quest: {
    eventName: "quest_started",
    operationName: "start_quest",
    route: "/today",
  },
  update_learning_settings: {
    eventName: "settings_saved",
    operationName: "update_learning_settings",
    route: "/settings/learning",
  },
  update_reward_settings: {
    eventName: "settings_saved",
    operationName: "update_reward_settings",
    route: "/settings/rewards",
  },
} as const;

export type JourneyName = keyof typeof JOURNEYS;
export type TelemetryEventName = (typeof JOURNEYS)[JourneyName]["eventName"];
export type TelemetryOperationName = (typeof JOURNEYS)[JourneyName]["operationName"];
export type TelemetryRoute = (typeof JOURNEYS)[JourneyName]["route"];

const telemetryStages = new Set<string>(TELEMETRY_STAGES);
const journeyIdentifier =
  /^(?:[a-z][a-z0-9_-]{1,39}-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-z0-9]{20,64})$/i;

export function isTelemetryStage(value: string | undefined): value is TelemetryStage {
  return value !== undefined && telemetryStages.has(value);
}

export function isJourneyId(value: string): value is string {
  return journeyIdentifier.test(value);
}

export function createJourneyId(journey: JourneyName, randomId = crypto.randomUUID()) {
  const prefix = JOURNEYS[journey].operationName.replaceAll("_", "-");
  const value = `${prefix}-${randomId}`;
  if (!isJourneyId(value)) throw new Error("JOURNEY_ID_INVALID");
  return value;
}

export function journeyDefinition<Journey extends JourneyName>(journey: Journey) {
  return JOURNEYS[journey];
}

export function journeyMatches(
  journey: JourneyName,
  eventName: string,
  operationName: string,
  route?: string,
) {
  const definition = JOURNEYS[journey];
  return (
    eventName === definition.eventName &&
    operationName === definition.operationName &&
    (route === undefined || route === definition.route)
  );
}

export function findJourney(eventName: string, operationName: string, route?: string) {
  // SAFETY: JOURNEYS is the authoritative readonly record, so Object.keys returns JourneyName.
  for (const journey of Object.keys(JOURNEYS) as JourneyName[]) {
    if (journeyMatches(journey, eventName, operationName, route)) return journey;
  }
  return null;
}

export function postHogInsertId(journeyId: string, hop: TelemetryHop, outcome: TelemetryOutcome) {
  if (!isJourneyId(journeyId)) throw new Error("JOURNEY_ID_INVALID");
  return `unthink:${journeyId}:unthink-${hop}:${outcome}`;
}
