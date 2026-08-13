import {
  findJourney,
  isJourneyId,
  isTelemetryStage,
  journeyDefinition,
  JOURNEYS,
  postHogInsertId,
  TELEMETRY_REDACTION_VERSION,
  TELEMETRY_SCHEMA_VERSION,
} from "../../shared/telemetry-contract";
import type { JourneyName, TelemetryStage } from "../../shared/telemetry-contract";

export type BackendOperationInput = {
  durationMs: number;
  family?: string;
  failureClass?: string;
  fileCount?: number;
  helpChoice?: string;
  idempotentReplay?: boolean;
  journey: JourneyName;
  mode?: string;
  operationId: string;
  outcome?: "expected_failure" | "succeeded";
  proofKind?: string;
  questId?: string;
  questStep?: string;
  rewardKey?: string;
  rowCount?: number;
  settingsSection?: string;
  xpAwarded?: number;
};

export type BackendTelemetryEnvironment = {
  release: string;
  stage: TelemetryStage;
};

export type BackendTelemetryProperty = boolean | number | string;
export type BackendTelemetryProperties = {
  $exception_fingerprint?: string;
  $insert_id: string;
  auth_state: string;
  durable_receipt: boolean;
  duration_ms: number;
  environment: string;
  error_class?: string;
  event_name?: string;
  failure_class?: string;
  family?: string;
  file_count?: number;
  help_choice?: string;
  idempotent_replay?: boolean;
  lifecycle_phase: string;
  mode?: string;
  operation_event?: string;
  operation_id: string;
  operation_name: string;
  outcome: string;
  proof_kind?: string;
  quest_id?: string;
  quest_step?: string;
  redaction_version: number;
  release: string;
  reward_key?: string;
  row_count?: number;
  sample_rate: number;
  schema_version: number;
  service_hop: string;
  service_name: string;
  settings_section?: string;
  stage: string;
  trace_id: string;
  xp_awarded?: number;
};

export type BackendPostHogEvent = {
  distinctId: string;
  event: string;
  properties?: BackendTelemetryProperties;
};

const actorIdentifier =
  /^(?:[a-z0-9]{20,64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const safeRelease = /^(?:local|[0-9a-f]{7,64})$/i;

export function isTelemetryOperationId(value: string) {
  return isJourneyId(value);
}

export function resolveBackendTelemetryEnvironment(
  appEnvironment: string | undefined,
  appRelease: string | undefined,
): BackendTelemetryEnvironment | null {
  const stage = appEnvironment === undefined ? "local" : appEnvironment;
  if (!isTelemetryStage(stage)) return null;
  const release = appRelease === undefined || !safeRelease.test(appRelease) ? "local" : appRelease;
  return { release, stage };
}

export function buildBackendWideEvent(
  input: BackendOperationInput,
  environment: BackendTelemetryEnvironment,
) {
  const definition = journeyDefinition(input.journey);
  const outcome = input.outcome ?? "succeeded";
  const properties: BackendTelemetryProperties = {
    $insert_id: postHogInsertId(input.operationId, "backend", outcome),
    auth_state: "authenticated",
    durable_receipt: true,
    duration_ms: input.durationMs,
    environment: environment.stage,
    event_name: definition.eventName,
    idempotent_replay: input.idempotentReplay ?? false,
    lifecycle_phase: "committed",
    operation_event: definition.eventName,
    operation_id: input.operationId,
    operation_name: definition.operationName,
    outcome,
    redaction_version: TELEMETRY_REDACTION_VERSION,
    release: environment.release,
    sample_rate: 1,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    service_hop: "backend",
    service_name: "unthink-convex",
    stage: environment.stage,
    trace_id: input.operationId,
  };
  if (input.family !== undefined) properties.family = input.family;
  if (input.failureClass !== undefined) properties.failure_class = input.failureClass;
  if (input.fileCount !== undefined) properties.file_count = input.fileCount;
  if (input.helpChoice !== undefined) properties.help_choice = input.helpChoice;
  if (input.mode !== undefined) properties.mode = input.mode;
  if (input.proofKind !== undefined) properties.proof_kind = input.proofKind;
  if (input.questId !== undefined) properties.quest_id = input.questId;
  if (input.questStep !== undefined) properties.quest_step = input.questStep;
  if (input.rewardKey !== undefined) properties.reward_key = input.rewardKey;
  if (input.rowCount !== undefined) properties.row_count = input.rowCount;
  if (input.settingsSection !== undefined) properties.settings_section = input.settingsSection;
  if (input.xpAwarded !== undefined) properties.xp_awarded = input.xpAwarded;
  return properties;
}

function primitiveTag(value: BackendTelemetryProperty | undefined) {
  return Object.prototype.toString.call(value);
}

function isString(value: BackendTelemetryProperty | undefined): value is string {
  return primitiveTag(value) === "[object String]" && Object(value) !== value;
}

function isFiniteNumber(value: BackendTelemetryProperty | undefined): value is number {
  return (
    primitiveTag(value) === "[object Number]" && Object(value) !== value && Number.isFinite(value)
  );
}

function isBoolean(value: BackendTelemetryProperty | undefined): value is boolean {
  return primitiveTag(value) === "[object Boolean]" && Object(value) !== value;
}

function validOptionalString(
  value: BackendTelemetryProperty | undefined,
  allowed: ReadonlyArray<string>,
  required: boolean,
) {
  if (value === undefined) return !required;
  return isString(value) && allowed.includes(value);
}

export function redactBackendPostHogEvent(
  value: BackendPostHogEvent,
  environment: BackendTelemetryEnvironment | null,
): BackendPostHogEvent | null {
  if (environment === null) return null;
  if (!actorIdentifier.test(value.distinctId)) return null;
  if (value.properties === undefined) return null;
  const properties = value.properties;
  const operationId = properties.operation_id;
  const operationName = properties.operation_name;
  const durationMs = properties.duration_ms;
  if (
    !isString(operationId) ||
    !isJourneyId(operationId) ||
    !isString(operationName) ||
    !Object.values(JOURNEYS).some((definition) => definition.operationName === operationName) ||
    !isFiniteNumber(durationMs) ||
    durationMs < 0 ||
    durationMs > 86_400_000
  ) {
    return null;
  }
  if (value.event === "$exception") {
    const errorClass = properties.error_class;
    if (
      !isString(errorClass) ||
      ![
        "AbortError",
        "Error",
        "EvalError",
        "RangeError",
        "ReferenceError",
        "SyntaxError",
        "TypeError",
        "URIError",
        "UnknownError",
      ].includes(errorClass) ||
      properties.$exception_fingerprint !== `unthink-convex:${errorClass}` ||
      properties.$insert_id !== postHogInsertId(operationId, "backend", "failed") ||
      properties.auth_state !== "authenticated" ||
      properties.durable_receipt !== false ||
      properties.environment !== environment.stage ||
      properties.lifecycle_phase !== "failed" ||
      properties.outcome !== "failed" ||
      properties.redaction_version !== TELEMETRY_REDACTION_VERSION ||
      properties.release !== environment.release ||
      properties.sample_rate !== 1 ||
      properties.schema_version !== TELEMETRY_SCHEMA_VERSION ||
      properties.service_hop !== "backend" ||
      properties.service_name !== "unthink-convex" ||
      properties.stage !== environment.stage ||
      properties.trace_id !== operationId
    ) {
      return null;
    }
    const exceptionKeys = new Set([
      "$exception_fingerprint",
      "$insert_id",
      "auth_state",
      "durable_receipt",
      "duration_ms",
      "environment",
      "error_class",
      "lifecycle_phase",
      "operation_id",
      "operation_name",
      "outcome",
      "redaction_version",
      "release",
      "sample_rate",
      "schema_version",
      "service_hop",
      "service_name",
      "stage",
      "trace_id",
    ]);
    return Object.keys(properties).some((key) => !exceptionKeys.has(key)) ? null : value;
  }
  const journey = findJourney(value.event, operationName);
  if (journey === null) return null;
  if (
    (properties.outcome !== "succeeded" && properties.outcome !== "expected_failure") ||
    properties.$insert_id !== postHogInsertId(operationId, "backend", properties.outcome) ||
    properties.auth_state !== "authenticated" ||
    properties.durable_receipt !== true ||
    properties.environment !== environment.stage ||
    properties.event_name !== value.event ||
    properties.lifecycle_phase !== "committed" ||
    properties.operation_event !== value.event ||
    properties.redaction_version !== TELEMETRY_REDACTION_VERSION ||
    properties.release !== environment.release ||
    properties.sample_rate !== 1 ||
    properties.schema_version !== TELEMETRY_SCHEMA_VERSION ||
    properties.service_hop !== "backend" ||
    properties.service_name !== "unthink-convex" ||
    properties.stage !== environment.stage ||
    properties.trace_id !== operationId ||
    !isBoolean(properties.idempotent_replay)
  ) {
    return null;
  }
  if (
    !validOptionalString(
      properties.family,
      ["anchor", "recall", "bridge", "teach", "revival", "north-star", "review"],
      false,
    ) ||
    !validOptionalString(properties.mode, ["rescue", "standard", "deep"], false) ||
    !validOptionalString(properties.proof_kind, ["text", "reference", "file"], false) ||
    !validOptionalString(
      properties.quest_step,
      ["retrieve", "make", "connect", "feedback", "proof"],
      false,
    ) ||
    !validOptionalString(properties.help_choice, ["clarify", "hint", "shrink", "park"], false) ||
    !validOptionalString(properties.settings_section, ["learning", "rewards"], false)
  ) {
    return null;
  }
  const questId = properties.quest_id;
  if (questId !== undefined && (!isString(questId) || !isJourneyId(questId))) {
    return null;
  }
  const rewardKey = properties.reward_key;
  if (
    rewardKey !== undefined &&
    (!isString(rewardKey) ||
      !["choose-next-intent", "protected-studio-session"].includes(rewardKey))
  ) {
    return null;
  }
  const xpAwarded = properties.xp_awarded;
  if (xpAwarded !== undefined && (!isFiniteNumber(xpAwarded) || xpAwarded < 0 || xpAwarded > 10)) {
    return null;
  }
  const failureClass = properties.failure_class;
  if (
    failureClass !== undefined &&
    (!isString(failureClass) ||
      !["AUTH_RECONCILIATION_FAILED", "STORAGE_RECONCILIATION_FAILED"].includes(failureClass))
  ) {
    return null;
  }
  for (const count of [properties.file_count, properties.row_count]) {
    if (
      count !== undefined &&
      (!isFiniteNumber(count) || !Number.isInteger(count) || count < 0 || count > 500)
    ) {
      return null;
    }
  }
  const approvedKeys = new Set([
    "$insert_id",
    "auth_state",
    "durable_receipt",
    "duration_ms",
    "environment",
    "event_name",
    "family",
    "failure_class",
    "file_count",
    "help_choice",
    "idempotent_replay",
    "lifecycle_phase",
    "mode",
    "operation_event",
    "operation_id",
    "operation_name",
    "outcome",
    "proof_kind",
    "quest_id",
    "quest_step",
    "redaction_version",
    "release",
    "reward_key",
    "row_count",
    "sample_rate",
    "schema_version",
    "service_hop",
    "service_name",
    "settings_section",
    "stage",
    "trace_id",
    "xp_awarded",
  ]);
  if (Object.keys(properties).some((key) => !approvedKeys.has(key))) return null;
  return { ...value, properties };
}

export function sanitizedBackendError(cause: unknown) {
  const knownClasses = new Set([
    "AbortError",
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
  ]);
  const candidate = cause instanceof Error ? cause.name : "";
  const error = new Error("Unexpected Convex operation failure");
  error.name = knownClasses.has(candidate) ? candidate : "UnknownError";
  error.stack = undefined;
  return error;
}
