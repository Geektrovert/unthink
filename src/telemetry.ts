export type CompletionEventInput = {
  durationMs: number;
  environment: string;
  family: string;
  mode: string;
  operationId: string;
  outcome: "succeeded" | "expected_failure" | "failed";
  proofKind: string;
  questId: string;
  release: string;
  retryCount: number;
  route: string;
  xpAwarded: number;
};

type TelemetryValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<TelemetryValue>
  | { readonly [key: string]: TelemetryValue };

type TelemetryProperties = { readonly [key: string]: TelemetryValue };
type TelemetryRecord = { readonly [key: string]: TelemetryValue };

type TelemetryCapture = {
  event: string;
  properties?: TelemetryProperties;
};

const completionKeys: ReadonlyArray<keyof CompletionEventInput> = [
  "durationMs",
  "environment",
  "family",
  "mode",
  "operationId",
  "outcome",
  "proofKind",
  "questId",
  "release",
  "retryCount",
  "route",
  "xpAwarded",
];

function valueTag(value: TelemetryValue | undefined) {
  return Object.prototype.toString.call(value);
}

function isString(value: TelemetryValue | undefined): value is string {
  return valueTag(value) === "[object String]" && Object(value) !== value;
}

function isFiniteNumber(value: TelemetryValue | undefined): value is number {
  return valueTag(value) === "[object Number]" && Object(value) !== value && Number.isFinite(value);
}

function isBoolean(value: TelemetryValue | undefined): value is boolean {
  return valueTag(value) === "[object Boolean]" && Object(value) !== value;
}

function isTelemetryRecord(value: TelemetryValue): value is TelemetryRecord {
  return valueTag(value) === "[object Object]";
}

function parseCompletionInput(value: TelemetryValue): CompletionEventInput | null {
  if (!isTelemetryRecord(value)) return null;
  if (
    Object.keys(value).length !== completionKeys.length ||
    completionKeys.some((key) => !(key in value))
  ) {
    return null;
  }
  const durationMs = value.durationMs;
  const environment = value.environment;
  const family = value.family;
  const mode = value.mode;
  const operationId = value.operationId;
  const outcome = value.outcome;
  const proofKind = value.proofKind;
  const questId = value.questId;
  const release = value.release;
  const retryCount = value.retryCount;
  const route = value.route;
  const xpAwarded = value.xpAwarded;
  if (
    !isFiniteNumber(durationMs) ||
    !isString(environment) ||
    !isString(family) ||
    !isString(mode) ||
    !isString(operationId) ||
    (outcome !== "succeeded" && outcome !== "expected_failure" && outcome !== "failed") ||
    !isString(proofKind) ||
    !isString(questId) ||
    !isString(release) ||
    !isFiniteNumber(retryCount) ||
    !Number.isInteger(retryCount) ||
    !isString(route) ||
    !isFiniteNumber(xpAwarded)
  ) {
    return null;
  }
  return {
    durationMs,
    environment,
    family,
    mode,
    operationId,
    outcome,
    proofKind,
    questId,
    release,
    retryCount,
    route,
    xpAwarded,
  };
}

export function buildCompletionEvent(value: TelemetryValue) {
  const input = parseCompletionInput(value);
  if (input === null) throw new Error("TELEMETRY_INPUT_INVALID");
  return {
    auth_state: "authenticated",
    duration_ms: input.durationMs,
    environment: input.environment,
    event_name: "learning_operation_completed",
    family: input.family,
    $insert_id: `unthink:${input.operationId}`,
    mode: input.mode,
    operation_id: input.operationId,
    operation_name: "complete_quest",
    outcome: input.outcome,
    proof_kind: input.proofKind,
    quest_id: input.questId,
    redaction_version: 1,
    release: input.release,
    retry_count: input.retryCount,
    route: input.route,
    sample_rate: 1,
    schema_version: 1,
    service_name: "unthink-web",
    xp_awarded: input.xpAwarded,
  } as const;
}

export function sanitizeUnexpectedError(cause: unknown, operationId: string) {
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
  return {
    error_class: knownClasses.has(candidate) ? candidate : "UnknownError",
    operation_id: operationId.slice(0, 120),
    redaction_version: 1,
  } as const;
}

const approvedEventKeys = new Set([
  "$insert_id",
  "auth_state",
  "duration_ms",
  "environment",
  "family",
  "mode",
  "operation_id",
  "operation_name",
  "outcome",
  "proof_kind",
  "quest_id",
  "redaction_version",
  "release",
  "retry_count",
  "route",
  "sample_rate",
  "schema_version",
  "service_name",
  "xp_awarded",
  "token",
  "error_class",
]);

const approvedPostHogKeys = new Set([
  "$browser",
  "$browser_version",
  "$device_type",
  "$host",
  "$lib",
  "$lib_version",
  "$os",
  "$os_version",
  "$screen_height",
  "$screen_width",
  "$session_id",
  "$window_id",
  "$is_identified",
  "$process_person_profile",
  "$device_id",
]);
const forbiddenPropertyName =
  /(?:answer|capsule|cookie|draft|email|filename|note|password|prompt|proof|reference|secret|support|title|url)/i;
const providerOpaqueId =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const publicToken = /^phc_[A-Za-z0-9]{20,120}$/;

function hasValidTransportValues(properties: TelemetryProperties) {
  for (const [key, value] of Object.entries(properties)) {
    if (approvedEventKeys.has(key)) continue;
    if (["distinct_id", "$device_id", "$session_id", "$window_id"].includes(key)) {
      if (!isString(value) || !providerOpaqueId.test(value)) return false;
    } else if (key === "$host") {
      if (
        !isString(value) ||
        !/^(?:localhost|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/i.test(value)
      ) {
        return false;
      }
    } else if (["$browser_version", "$lib_version", "$os_version"].includes(key)) {
      if (!isString(value) || !/^\d+(?:\.\d+){0,3}$/.test(value)) return false;
    } else if (key === "$lib") {
      if (value !== "web") return false;
    } else if (key === "$browser") {
      if (
        !isString(value) ||
        ![
          "Chrome",
          "Chrome iOS",
          "Edge",
          "Firefox",
          "Microsoft Edge",
          "Mobile Safari",
          "Safari",
        ].includes(value)
      ) {
        return false;
      }
    } else if (key === "$os") {
      if (
        !isString(value) ||
        !["Android", "Chrome OS", "iOS", "Linux", "Mac OS X", "Windows"].includes(value)
      ) {
        return false;
      }
    } else if (key === "$device_type") {
      if (!isString(value) || !["Desktop", "Mobile", "Tablet"].includes(value)) return false;
    } else if (["$screen_height", "$screen_width"].includes(key)) {
      if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1 || value > 20_000) {
        return false;
      }
    } else if (!["$is_identified", "$process_person_profile"].includes(key)) {
      return false;
    } else if (!isBoolean(value)) {
      return false;
    }
  }
  return true;
}

function hasValidApplicationValues(event: string, properties: TelemetryProperties) {
  const token = properties.token;
  const operationId = properties.operation_id;
  if (!isString(token) || !publicToken.test(token)) return false;
  if (!isString(operationId) || !/^[a-z0-9][a-z0-9_.:-]{7,119}$/i.test(operationId)) {
    return false;
  }
  if (event === "$exception") {
    const errorClass = properties.error_class;
    return (
      isString(errorClass) &&
      [
        "AbortError",
        "Error",
        "EvalError",
        "RangeError",
        "ReferenceError",
        "SyntaxError",
        "TypeError",
        "URIError",
        "UnknownError",
      ].includes(errorClass) &&
      properties.redaction_version === 1
    );
  }
  const family = properties.family;
  const mode = properties.mode;
  const outcome = properties.outcome;
  const proofKind = properties.proof_kind;
  const questId = properties.quest_id;
  const environment = properties.environment;
  const release = properties.release;
  const durationMs = properties.duration_ms;
  const retryCount = properties.retry_count;
  const xpAwarded = properties.xp_awarded;
  return (
    properties.auth_state === "authenticated" &&
    properties.$insert_id === `unthink:${operationId}` &&
    isString(family) &&
    ["anchor", "recall", "bridge", "teach", "revival", "north-star", "review"].includes(family) &&
    isString(mode) &&
    ["rescue", "standard", "deep"].includes(mode) &&
    properties.operation_name === "complete_quest" &&
    isString(outcome) &&
    ["succeeded", "expected_failure", "failed"].includes(outcome) &&
    isString(proofKind) &&
    ["text", "reference", "file"].includes(proofKind) &&
    properties.redaction_version === 1 &&
    properties.route === "/quest/:questId" &&
    properties.sample_rate === 1 &&
    properties.schema_version === 1 &&
    properties.service_name === "unthink-web" &&
    isFiniteNumber(durationMs) &&
    durationMs >= 0 &&
    isFiniteNumber(retryCount) &&
    Number.isInteger(retryCount) &&
    isFiniteNumber(xpAwarded) &&
    xpAwarded >= 0 &&
    xpAwarded <= 10 &&
    isString(questId) &&
    /^[a-z0-9][a-z0-9_.:-]{7,119}$/i.test(questId) &&
    isString(environment) &&
    ["development", "production", "test"].includes(environment) &&
    isString(release) &&
    /^[a-z0-9][a-z0-9_.-]{0,119}$/i.test(release)
  );
}

function isSafePrimitive(value: TelemetryValue) {
  if (isFiniteNumber(value) || isBoolean(value)) return true;
  return (
    isString(value) && value.length <= 160 && !value.includes("@") && !/https?:\/\//.test(value)
  );
}

export function redactTelemetryCapture<Capture extends TelemetryCapture>(
  value: Capture | null,
): Capture | null {
  if (value === null) return null;
  if (value.event !== "learning_operation_completed" && value.event !== "$exception") return null;
  const incoming: TelemetryProperties = value.properties ?? {};
  if (
    Object.keys(incoming).some(
      (key) =>
        !approvedEventKeys.has(key) &&
        key !== "distinct_id" &&
        !approvedPostHogKeys.has(key) &&
        forbiddenPropertyName.test(key),
    )
  ) {
    return null;
  }
  const properties = Object.fromEntries(
    Object.entries(incoming).filter(
      ([key, entry]) =>
        (approvedEventKeys.has(key) || key === "distinct_id" || approvedPostHogKeys.has(key)) &&
        isSafePrimitive(entry),
    ),
  );
  if (!hasValidTransportValues(properties)) return null;
  if (!hasValidApplicationValues(value.event, properties)) return null;
  return { ...value, properties };
}
