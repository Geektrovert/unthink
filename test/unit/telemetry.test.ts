import { expect, test } from "vitest";

import {
  buildBrowserOperationEvent,
  buildCompletionEvent,
  redactTelemetryCapture,
  sanitizedBrowserError,
  sanitizeUnexpectedError,
} from "../../src/telemetry";

const operationId = "complete-123e4567-e89b-42d3-a456-426614174000";
const questId = "123e4567e89b42d3a456426614174001";
const token = "phc_1234567890abcdefghijklmnop";

test("completion telemetry is one correlated wide browser event", () => {
  expect(
    buildCompletionEvent({
      durationMs: 850,
      family: "bridge",
      mode: "standard",
      operationId,
      outcome: "succeeded",
      proofKind: "text",
      questId,
      release: "1234567890abcdef",
      retryCount: 1,
      stage: "staging",
      xpAwarded: 8,
    }),
  ).toMatchObject({
    $insert_id: `unthink:${operationId}:unthink-browser:succeeded`,
    durable_receipt: true,
    environment: "staging",
    event_name: "learning_operation_completed",
    lifecycle_phase: "observed",
    operation_id: operationId,
    operation_name: "complete_quest",
    outcome: "succeeded",
    release: "1234567890abcdef",
    service_hop: "browser",
    service_name: "unthink-web",
    stage: "staging",
    trace_id: operationId,
  });
});

test("interaction success and failure close the same browser operation", () => {
  const input = {
    durationMs: 120,
    journey: "start_quest" as const,
    operationId: "start-123e4567-e89b-42d3-a456-426614174002",
    release: "1234567890abcdef",
    stage: "production" as const,
  };
  expect(buildBrowserOperationEvent({ ...input, outcome: "succeeded" })).toMatchObject({
    durable_receipt: true,
    event_name: "quest_started",
    operation_event: "quest_started",
    outcome: "succeeded",
    trace_id: input.operationId,
  });
  expect(
    buildBrowserOperationEvent({ ...input, errorClass: "TypeError", outcome: "failed" }),
  ).toMatchObject({
    durable_receipt: false,
    error_class: "TypeError",
    event_name: "learning_operation_failed",
    operation_event: "quest_started",
    outcome: "failed",
    trace_id: input.operationId,
  });
});

test("the final exporter rejects unknown events, private fields, and invalid stages", () => {
  expect(redactTelemetryCapture({ event: "pageview", properties: {} })).toBeNull();
  const valid = buildCompletionEvent({
    durationMs: 850,
    family: "bridge",
    mode: "standard",
    operationId,
    outcome: "succeeded",
    proofKind: "text",
    questId,
    release: "1234567890abcdef",
    retryCount: 0,
    stage: "development",
    xpAwarded: 8,
  });
  const { event_name: event, ...properties } = valid;
  expect(
    redactTelemetryCapture({
      event,
      properties: {
        ...properties,
        $browser: "Microsoft Edge",
        $session_id: "123e4567-e89b-42d3-a456-426614174003",
        $window_id: "123e4567-e89b-42d3-a456-426614174004",
        token,
      },
    }),
  ).not.toBeNull();
  expect(
    redactTelemetryCapture({
      event,
      properties: { ...properties, private_note: "must not leave", token },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event,
      properties: { ...properties, environment: "production", stage: "development", token },
    }),
  ).toBeNull();
});

test("manual exceptions keep source-map frames but remove private error content", () => {
  const privateError = new TypeError("proof text leaked");
  privateError.stack =
    "TypeError: proof text leaked\n    at submit (https://unthink.vercel.app/assets/app-abc123.js:10:20)\n    at secret (https://private.example/proof.js:1:2)";
  const sanitized = sanitizedBrowserError(privateError);
  expect(sanitized.message).toBe("Unexpected browser error");
  expect(sanitized.stack).toContain("https://unthink.vercel.app/assets/app-abc123.js:10:20");
  expect(sanitized.stack).not.toContain("proof text leaked");
  expect(sanitized.stack).not.toContain("private.example");

  const metadata = sanitizeUnexpectedError(
    new TypeError("proof text leaked"),
    "browser-error-123e4567-e89b-42d3-a456-426614174005",
  );
  expect(metadata).not.toContain("proof text leaked");
  expect(metadata.error_class).toBe("TypeError");

  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: {
        ...metadata,
        $exception_level: "error",
        $exception_list: [
          {
            mechanism: { handled: true, synthetic: false, type: "generic" },
            stacktrace: {
              frames: [
                {
                  colno: 20,
                  filename: "https://unthink.vercel.app/assets/app-abc123.js",
                  function: "submit",
                  in_app: true,
                  lineno: 10,
                  platform: "web:javascript",
                },
              ],
              type: "raw",
            },
            type: "TypeError",
            value: "Unexpected browser error",
          },
        ],
        environment: "production",
        release: "1234567890abcdef",
        stage: "production",
        token,
      },
    }),
  ).not.toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: {
        ...metadata,
        $exception_list: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "https://private.example/proof.js",
                  platform: "web:javascript",
                },
              ],
              type: "raw",
            },
            type: "TypeError",
            value: "proof text leaked",
          },
        ],
        stage: "production",
        token,
      },
    }),
  ).toBeNull();
});

test("invalid completion boundaries fail closed", () => {
  for (const value of [
    { email: "owner@example.com" },
    { proof_text: "private" },
    { capsule: "private" },
    { url: "https://private.example" },
    { token: "secret" },
    { prompt: "private" },
  ]) {
    expect(() => buildCompletionEvent(value)).toThrow("TELEMETRY_INPUT_INVALID");
  }
});
