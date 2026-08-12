type CompletionEventInput = {
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

function isCompletionInput(value: unknown): value is CompletionEventInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== completionKeys.length ||
    completionKeys.some((key) => !(key in record))
  ) {
    return false;
  }
  return (
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    typeof record.environment === "string" &&
    typeof record.family === "string" &&
    typeof record.mode === "string" &&
    typeof record.operationId === "string" &&
    (record.outcome === "succeeded" ||
      record.outcome === "expected_failure" ||
      record.outcome === "failed") &&
    typeof record.proofKind === "string" &&
    typeof record.questId === "string" &&
    typeof record.release === "string" &&
    Number.isInteger(record.retryCount) &&
    typeof record.route === "string" &&
    Number.isFinite(record.xpAwarded)
  );
}

export function buildCompletionEvent(value: CompletionEventInput) {
  if (!isCompletionInput(value)) throw new Error("TELEMETRY_INPUT_INVALID");
  return {
    auth_state: "authenticated",
    duration_ms: value.durationMs,
    environment: value.environment,
    event_name: "learning_operation_completed",
    family: value.family,
    $insert_id: `unthink:${value.operationId}`,
    mode: value.mode,
    operation_id: value.operationId,
    operation_name: "complete_quest",
    outcome: value.outcome,
    proof_kind: value.proofKind,
    quest_id: value.questId,
    redaction_version: 1,
    release: value.release,
    retry_count: value.retryCount,
    route: value.route,
    sample_rate: 1,
    schema_version: 1,
    service_name: "unthink-web",
    xp_awarded: value.xpAwarded,
  } as const;
}

export function sanitizeUnexpectedError(error: unknown, operationId: string) {
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
  const candidate =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
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

function hasValidTransportValues(properties: Record<string, unknown>) {
  for (const [key, value] of Object.entries(properties)) {
    if (approvedEventKeys.has(key)) continue;
    if (["distinct_id", "$device_id", "$session_id", "$window_id"].includes(key)) {
      if (!providerOpaqueId.test(String(value))) return false;
    } else if (key === "$host") {
      if (!/^(?:localhost|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/i.test(String(value))) {
        return false;
      }
    } else if (["$browser_version", "$lib_version", "$os_version"].includes(key)) {
      if (!/^\d+(?:\.\d+){0,3}$/.test(String(value))) return false;
    } else if (key === "$lib") {
      if (value !== "web") return false;
    } else if (key === "$browser") {
      if (
        ![
          "Chrome",
          "Chrome iOS",
          "Edge",
          "Firefox",
          "Microsoft Edge",
          "Mobile Safari",
          "Safari",
        ].includes(String(value))
      )
        return false;
    } else if (key === "$os") {
      if (!["Android", "Chrome OS", "iOS", "Linux", "Mac OS X", "Windows"].includes(String(value)))
        return false;
    } else if (key === "$device_type") {
      if (!["Desktop", "Mobile", "Tablet"].includes(String(value))) return false;
    } else if (["$screen_height", "$screen_width"].includes(key)) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20_000) {
        return false;
      }
    } else if (!["$is_identified", "$process_person_profile"].includes(key)) {
      return false;
    } else if (typeof value !== "boolean") {
      return false;
    }
  }
  return true;
}

function hasValidApplicationValues(event: string, properties: Record<string, unknown>) {
  if (event === "$exception") {
    return (
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
      ].includes(String(properties.error_class)) &&
      properties.redaction_version === 1 &&
      publicToken.test(String(properties.token)) &&
      /^[a-z0-9][a-z0-9_.:-]{7,119}$/i.test(String(properties.operation_id))
    );
  }
  return (
    properties.auth_state === "authenticated" &&
    properties.$insert_id === `unthink:${String(properties.operation_id)}` &&
    ["anchor", "recall", "bridge", "teach", "revival", "north-star", "review"].includes(
      String(properties.family),
    ) &&
    ["rescue", "standard", "deep"].includes(String(properties.mode)) &&
    properties.operation_name === "complete_quest" &&
    ["succeeded", "expected_failure", "failed"].includes(String(properties.outcome)) &&
    ["text", "reference", "file"].includes(String(properties.proof_kind)) &&
    properties.redaction_version === 1 &&
    properties.route === "/quest/:questId" &&
    properties.sample_rate === 1 &&
    properties.schema_version === 1 &&
    properties.service_name === "unthink-web" &&
    publicToken.test(String(properties.token)) &&
    typeof properties.duration_ms === "number" &&
    properties.duration_ms >= 0 &&
    typeof properties.retry_count === "number" &&
    Number.isInteger(properties.retry_count) &&
    typeof properties.xp_awarded === "number" &&
    properties.xp_awarded >= 0 &&
    properties.xp_awarded <= 10 &&
    /^[a-z0-9][a-z0-9_.:-]{7,119}$/i.test(String(properties.operation_id)) &&
    /^[a-z0-9][a-z0-9_.:-]{7,119}$/i.test(String(properties.quest_id)) &&
    ["development", "production", "test"].includes(String(properties.environment)) &&
    /^[a-z0-9][a-z0-9_.-]{0,119}$/i.test(String(properties.release))
  );
}

export function redactTelemetryCapture(
  value: {
    event: string;
    properties?: Record<string, unknown>;
  } | null,
) {
  if (value === null) return null;
  if (value.event !== "learning_operation_completed" && value.event !== "$exception") return null;
  const incoming = value.properties ?? {};
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
        (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") &&
        (typeof entry !== "number" || Number.isFinite(entry)) &&
        (typeof entry !== "string" ||
          (entry.length <= 160 && !entry.includes("@") && !/https?:\/\//.test(entry))),
    ),
  );
  if (!hasValidTransportValues(properties)) return null;
  if (!hasValidApplicationValues(value.event, properties)) return null;
  return { event: value.event, properties: { ...properties } };
}
