import { APP_ORIGINS } from "../shared/deployment";
import {
  findJourney,
  isJourneyId,
  isTelemetryStage,
  JOURNEYS,
  journeyDefinition,
  postHogInsertId,
  TELEMETRY_REDACTION_VERSION,
  TELEMETRY_SCHEMA_VERSION,
} from "../shared/telemetry-contract";
import type { JourneyName, TelemetryEventName, TelemetryStage } from "../shared/telemetry-contract";

export type CompletionEventInput = {
  durationMs: number;
  errorClass?: string;
  family: string;
  mode: string;
  operationId: string;
  outcome: "succeeded" | "expected_failure" | "failed";
  proofKind: string;
  questId: string;
  retryCount: number;
  xpAwarded: number;
};

export type InteractionEventName = Exclude<TelemetryEventName, "learning_operation_completed">;

export type BrowserOperationInput = {
  durationMs: number;
  errorClass?: string;
  journey: Exclude<JourneyName, "complete_quest">;
  operationId: string;
  outcome: "failed" | "succeeded";
  release: string;
  stage: TelemetryStage;
};

type CompletionEventEnvelope = CompletionEventInput & {
  release: string;
  stage: TelemetryStage;
};

type TelemetryValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<TelemetryValue>
  | { readonly [key: string]: TelemetryValue };

type TelemetryProperties = { readonly [key: string]: TelemetryValue };
type TelemetryRecord = { [key: string]: TelemetryValue };

type TelemetryCapture = {
  event: string;
  properties?: TelemetryProperties;
};

const completionKeys: ReadonlyArray<keyof CompletionEventEnvelope> = [
  "durationMs",
  "family",
  "mode",
  "operationId",
  "outcome",
  "proofKind",
  "questId",
  "release",
  "retryCount",
  "stage",
  "xpAwarded",
];

const completionKeySet = new Set<string>([...completionKeys, "errorClass"]);

const knownErrorClasses = new Set([
  "AbortError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "UnknownError",
]);

const providerOpaqueId =
  /^(?:[a-z0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const publicToken = /^phc_[A-Za-z0-9]{20,120}$/;
const safeRelease = /^(?:local|[0-9a-f]{7,64})$/i;

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

function isTelemetryRecord(value: TelemetryValue | undefined): value is TelemetryRecord {
  return valueTag(value) === "[object Object]";
}

function parseCompletionInput(value: TelemetryValue): CompletionEventEnvelope | null {
  if (!isTelemetryRecord(value)) return null;
  if (
    Object.keys(value).some((key) => !completionKeySet.has(key)) ||
    completionKeys.some((key) => !(key in value))
  ) {
    return null;
  }
  const durationMs = value.durationMs;
  const errorClass = value.errorClass;
  const family = value.family;
  const mode = value.mode;
  const operationId = value.operationId;
  const outcome = value.outcome;
  const proofKind = value.proofKind;
  const questId = value.questId;
  const release = value.release;
  const retryCount = value.retryCount;
  const stage = value.stage;
  const xpAwarded = value.xpAwarded;
  if (
    !isFiniteNumber(durationMs) ||
    (errorClass !== undefined && !isString(errorClass)) ||
    !isString(family) ||
    !isString(mode) ||
    !isString(operationId) ||
    (outcome !== "succeeded" && outcome !== "expected_failure" && outcome !== "failed") ||
    !isString(proofKind) ||
    !isString(questId) ||
    !isString(release) ||
    !isFiniteNumber(retryCount) ||
    !Number.isInteger(retryCount) ||
    !isString(stage) ||
    !isFiniteNumber(xpAwarded)
  ) {
    return null;
  }
  if (!isTelemetryStage(stage)) return null;
  const result: CompletionEventEnvelope = {
    durationMs,
    family,
    mode,
    operationId,
    outcome,
    proofKind,
    questId,
    release,
    retryCount,
    stage,
    xpAwarded,
  };
  if (errorClass !== undefined) result.errorClass = errorClass;
  return result;
}

function commonOperationProperties(input: {
  durationMs: number;
  journey: JourneyName;
  operationId: string;
  outcome: "expected_failure" | "failed" | "succeeded";
  release: string;
  stage: TelemetryStage;
}) {
  const definition = journeyDefinition(input.journey);
  return {
    $insert_id: postHogInsertId(input.operationId, "browser", input.outcome),
    auth_state: "authenticated",
    durable_receipt: input.outcome === "succeeded",
    duration_ms: input.durationMs,
    environment: input.stage,
    lifecycle_phase: "observed",
    operation_id: input.operationId,
    operation_name: definition.operationName,
    outcome: input.outcome,
    redaction_version: TELEMETRY_REDACTION_VERSION,
    release: input.release,
    route: definition.route,
    sample_rate: 1,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    service_hop: "browser",
    service_name: "unthink-web",
    stage: input.stage,
    trace_id: input.operationId,
  } as const;
}

type CompletionTelemetryEvent = ReturnType<typeof commonOperationProperties> & {
  error_class?: string;
  event_name: string;
  family: string;
  mode: string;
  operation_event: "learning_operation_completed";
  proof_kind: string;
  quest_id: string;
  retry_count: number;
  xp_awarded: number;
};

type BrowserTelemetryEvent = ReturnType<typeof commonOperationProperties> & {
  error_class?: string;
  event_name: string;
  operation_event: InteractionEventName;
};

type SanitizedExceptionFrame = {
  colno?: number;
  filename: string;
  function?: string;
  in_app: true;
  lineno?: number;
  platform: "web:javascript";
};

export function buildCompletionEvent(value: TelemetryValue) {
  const input = parseCompletionInput(value);
  if (input === null) throw new Error("TELEMETRY_INPUT_INVALID");
  const event: CompletionTelemetryEvent = {
    ...commonOperationProperties({
      durationMs: input.durationMs,
      journey: "complete_quest",
      operationId: input.operationId,
      outcome: input.outcome,
      release: input.release,
      stage: input.stage,
    }),
    event_name:
      input.outcome === "failed" ? "learning_operation_failed" : "learning_operation_completed",
    family: input.family,
    mode: input.mode,
    operation_event: "learning_operation_completed",
    proof_kind: input.proofKind,
    quest_id: input.questId,
    retry_count: input.retryCount,
    xp_awarded: input.xpAwarded,
  };
  if (input.outcome === "failed") event.error_class = normalizeErrorClass(input.errorClass);
  return event;
}

export function buildBrowserOperationEvent(input: BrowserOperationInput) {
  const definition = journeyDefinition(input.journey);
  const eventName =
    input.outcome === "succeeded" ? definition.eventName : "learning_operation_failed";
  const event: BrowserTelemetryEvent = {
    ...commonOperationProperties(input),
    event_name: eventName,
    operation_event: definition.eventName,
  };
  if (input.outcome === "failed") event.error_class = normalizeErrorClass(input.errorClass);
  return event;
}

export function normalizeErrorClass(value: string | undefined) {
  return value !== undefined && knownErrorClasses.has(value) ? value : "UnknownError";
}

export function sanitizeUnexpectedError(cause: unknown, operationId: string) {
  const candidate = cause instanceof Error ? cause.name : undefined;
  return {
    $insert_id: postHogInsertId(operationId, "browser", "failed"),
    $exception_fingerprint: `unthink-web:${normalizeErrorClass(candidate)}`,
    auth_state: "authenticated",
    durable_receipt: false,
    duration_ms: 0,
    environment: "local",
    error_class: normalizeErrorClass(candidate),
    lifecycle_phase: "failed",
    operation_id: operationId.slice(0, 120),
    operation_name: "unhandled_browser_error",
    outcome: "failed",
    redaction_version: TELEMETRY_REDACTION_VERSION,
    release: "local",
    route: "/browser",
    sample_rate: 1,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    service_hop: "browser",
    service_name: "unthink-web",
    stage: "local",
    trace_id: operationId.slice(0, 120),
  } as const;
}

function sanitizeBrowserStackLine(line: string) {
  const location = line.match(/(https?:\/\/[^\s)]+?)(?::(\d+))(?::(\d+))\)?$/);
  if (location === null) return null;
  const candidate = location[1];
  const lineNumber = location[2];
  const columnNumber = location[3];
  if (candidate === undefined || lineNumber === undefined || columnNumber === undefined) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const filename = sanitizeStackFilename(`${url.origin}${url.pathname}`);
  if (filename === null) return null;
  return `    at <anonymous> (${filename}:${lineNumber}:${columnNumber})`;
}

export function sanitizedBrowserError(cause: unknown) {
  const candidate = cause instanceof Error ? cause.name : undefined;
  const error = new Error("Unexpected browser error");
  error.name = normalizeErrorClass(candidate);
  if (cause instanceof Error && cause.stack !== undefined) {
    const frames: string[] = [];
    for (const line of cause.stack.split("\n").slice(1, 21)) {
      const frame = sanitizeBrowserStackLine(line);
      if (frame !== null) frames.push(frame);
    }
    if (frames.length > 0) error.stack = `${error.name}: ${error.message}\n${frames.join("\n")}`;
    else error.stack = undefined;
  }
  return error;
}

const approvedOperationKeys = new Set([
  "$insert_id",
  "auth_state",
  "durable_receipt",
  "duration_ms",
  "environment",
  "error_class",
  "family",
  "lifecycle_phase",
  "mode",
  "operation_event",
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
  "service_hop",
  "service_name",
  "stage",
  "trace_id",
  "xp_awarded",
  "token",
]);

const approvedPostHogKeys = new Set([
  "$browser",
  "$browser_version",
  "$device_id",
  "$device_type",
  "$host",
  "$is_identified",
  "$lib",
  "$lib_version",
  "$os",
  "$os_version",
  "$process_person_profile",
  "$screen_height",
  "$screen_width",
  "$session_id",
  "$window_id",
]);

const forbiddenPropertyName =
  /(?:answer|capsule|cookie|draft|email|filename|note|password|prompt|proof_text|reference|secret|support|title|url)/i;

function hasValidTransportValues(properties: TelemetryProperties) {
  for (const [key, value] of Object.entries(properties)) {
    if (approvedOperationKeys.has(key)) continue;
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

function isRuntimeStageValue(value: TelemetryValue | undefined): value is TelemetryStage {
  return isString(value) && isTelemetryStage(value);
}

function hasValidOperationValues(event: string, properties: TelemetryProperties) {
  const token = properties.token;
  const operationId = properties.operation_id;
  const operationEvent = properties.operation_event;
  const operationName = properties.operation_name;
  const outcome = properties.outcome;
  const route = properties.route;
  const stage = properties.stage;
  if (!isString(token) || !publicToken.test(token)) return false;
  if (!isString(operationId) || !isJourneyId(operationId)) return false;
  if (!isString(operationEvent) || !isString(operationName) || !isString(route)) return false;
  const journey = findJourney(operationEvent, operationName, route);
  if (journey === null) return false;
  if (outcome !== "succeeded" && outcome !== "expected_failure" && outcome !== "failed") {
    return false;
  }
  if (!isRuntimeStageValue(stage) || properties.environment !== stage) return false;
  if (event !== (outcome === "failed" ? "learning_operation_failed" : operationEvent)) return false;
  const durationMs = properties.duration_ms;
  const release = properties.release;
  if (!isFiniteNumber(durationMs) || durationMs < 0 || durationMs > 86_400_000) return false;
  if (!isString(release) || !safeRelease.test(release)) return false;
  if (
    properties.$insert_id !== postHogInsertId(operationId, "browser", outcome) ||
    properties.auth_state !== "authenticated" ||
    properties.durable_receipt !== (outcome === "succeeded") ||
    properties.lifecycle_phase !== "observed" ||
    properties.redaction_version !== TELEMETRY_REDACTION_VERSION ||
    properties.sample_rate !== 1 ||
    properties.schema_version !== TELEMETRY_SCHEMA_VERSION ||
    properties.service_hop !== "browser" ||
    properties.service_name !== "unthink-web" ||
    properties.trace_id !== operationId
  ) {
    return false;
  }
  const errorClass = properties.error_class;
  if (outcome === "failed") {
    if (!isString(errorClass) || !knownErrorClasses.has(errorClass)) return false;
  } else if (errorClass !== undefined) {
    return false;
  }
  if (journey !== "complete_quest") return true;
  const family = properties.family;
  const mode = properties.mode;
  const proofKind = properties.proof_kind;
  const questId = properties.quest_id;
  const retryCount = properties.retry_count;
  const xpAwarded = properties.xp_awarded;
  return (
    isString(family) &&
    ["anchor", "recall", "bridge", "teach", "revival", "north-star", "review"].includes(family) &&
    isString(mode) &&
    ["rescue", "standard", "deep"].includes(mode) &&
    isString(proofKind) &&
    ["text", "reference", "file"].includes(proofKind) &&
    isString(questId) &&
    isJourneyId(questId) &&
    isFiniteNumber(retryCount) &&
    Number.isInteger(retryCount) &&
    retryCount >= 0 &&
    isFiniteNumber(xpAwarded) &&
    xpAwarded >= 0 &&
    xpAwarded <= 10
  );
}

function isSafePrimitive(value: TelemetryValue | undefined) {
  if (isFiniteNumber(value) || isBoolean(value)) return true;
  return (
    isString(value) && value.length <= 160 && !value.includes("@") && !/https?:\/\//.test(value)
  );
}

function sanitizeStackFilename(value: TelemetryValue | undefined) {
  if (!isString(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const productionHost = url.origin === APP_ORIGINS.production;
  const previewHost = url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  const localHost = url.origin === APP_ORIGINS.local;
  if ((!productionHost && !previewHost && !localHost) || url.search || url.hash) return null;
  if (
    !/^\/(?:assets|src|node_modules\/\.vite)\/[A-Za-z0-9_./@-]+\.(?:js|mjs|ts|tsx)$/.test(
      url.pathname,
    )
  ) {
    return null;
  }
  return value;
}

function sanitizeExceptionFrame(value: TelemetryValue) {
  if (!isTelemetryRecord(value)) return null;
  const filename = sanitizeStackFilename(value.filename);
  if (filename === null || value.platform !== "web:javascript") return null;
  const functionName = value.function;
  if (
    functionName !== undefined &&
    (!isString(functionName) || !/^[A-Za-z0-9_$<>.[\] /:-]{1,160}$/.test(functionName))
  ) {
    return null;
  }
  const lineno = value.lineno;
  const colno = value.colno;
  if (
    (lineno !== undefined && (!isFiniteNumber(lineno) || !Number.isInteger(lineno))) ||
    (colno !== undefined && (!isFiniteNumber(colno) || !Number.isInteger(colno)))
  ) {
    return null;
  }
  const frame: SanitizedExceptionFrame = {
    filename,
    in_app: true,
    platform: "web:javascript",
  };
  if (colno !== undefined) frame.colno = colno;
  if (functionName !== undefined) frame.function = functionName;
  if (lineno !== undefined) frame.lineno = lineno;
  return frame;
}

function sanitizeExceptionList(value: TelemetryValue | undefined) {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const exception = value[0];
  if (!isTelemetryRecord(exception)) return null;
  const type = exception.type;
  const stacktrace = exception.stacktrace;
  if (
    !isString(type) ||
    !knownErrorClasses.has(type) ||
    exception.value !== "Unexpected browser error"
  ) {
    return null;
  }
  if (
    !isTelemetryRecord(stacktrace) ||
    stacktrace.type !== "raw" ||
    !Array.isArray(stacktrace.frames)
  ) {
    return null;
  }
  const frames = stacktrace.frames.map(sanitizeExceptionFrame);
  if (frames.length === 0 || frames.some((frame) => frame === null)) return null;
  return [
    {
      mechanism: { handled: true, synthetic: false, type: "generic" },
      stacktrace: { frames, type: "raw" },
      type,
      value: "Unexpected browser error",
    },
  ];
}

function redactExceptionCapture<Capture extends TelemetryCapture>(value: Capture) {
  const incoming = value.properties ?? {};
  const exceptionList = sanitizeExceptionList(incoming.$exception_list);
  const errorClass = incoming.error_class;
  const operationId = incoming.operation_id;
  const stage = incoming.stage;
  const token = incoming.token;
  if (
    exceptionList === null ||
    !isString(errorClass) ||
    !knownErrorClasses.has(errorClass) ||
    !isString(operationId) ||
    !isJourneyId(operationId) ||
    incoming.$insert_id !== postHogInsertId(operationId, "browser", "failed") ||
    !isRuntimeStageValue(stage) ||
    !isString(token) ||
    !publicToken.test(token)
  ) {
    return null;
  }
  const transport = Object.fromEntries(
    Object.entries(incoming).filter(
      ([key, entry]) =>
        (key === "distinct_id" || approvedPostHogKeys.has(key)) && isSafePrimitive(entry),
    ),
  );
  if (!hasValidTransportValues(transport)) return null;
  const release = incoming.release;
  if (!isString(release) || !safeRelease.test(release)) return null;
  return {
    ...value,
    properties: {
      ...transport,
      $insert_id: postHogInsertId(operationId, "browser", "failed"),
      $exception_fingerprint: `unthink-web:${errorClass}`,
      $exception_level: "error",
      $exception_list: exceptionList,
      auth_state: "authenticated",
      durable_receipt: false,
      duration_ms: 0,
      environment: stage,
      error_class: errorClass,
      lifecycle_phase: "failed",
      operation_id: operationId,
      operation_name: "unhandled_browser_error",
      outcome: "failed",
      redaction_version: TELEMETRY_REDACTION_VERSION,
      release,
      route: "/browser",
      sample_rate: 1,
      schema_version: TELEMETRY_SCHEMA_VERSION,
      service_hop: "browser",
      service_name: "unthink-web",
      stage,
      token,
      trace_id: operationId,
    },
  };
}

export function redactTelemetryCapture<Capture extends TelemetryCapture>(
  value: Capture | null,
): Capture | null {
  if (value === null) return null;
  if (value.event === "$exception") {
    // SAFETY: redactExceptionCapture preserves the capture envelope and replaces only properties.
    return redactExceptionCapture(value) as Capture | null;
  }
  if (
    value.event !== "learning_operation_failed" &&
    !Object.values(JOURNEYS).some(({ eventName }) => eventName === value.event)
  )
    return null;
  const incoming = value.properties ?? {};
  if (
    Object.keys(incoming).some(
      (key) =>
        !approvedOperationKeys.has(key) &&
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
        (approvedOperationKeys.has(key) || key === "distinct_id" || approvedPostHogKeys.has(key)) &&
        isSafePrimitive(entry),
    ),
  );
  if (!hasValidTransportValues(properties)) return null;
  if (!hasValidOperationValues(value.event, properties)) return null;
  return { ...value, properties };
}
