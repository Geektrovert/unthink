import { expect, test } from "vitest";

import {
  buildCompletionEvent,
  redactTelemetryCapture,
  sanitizeUnexpectedError,
} from "../../src/telemetry";

test("completion telemetry contains only the approved redacted operation fields", () => {
  expect(
    buildCompletionEvent({
      durationMs: 850,
      environment: "development",
      family: "bridge",
      mode: "standard",
      operationId: "complete-2026-08-13",
      outcome: "succeeded",
      proofKind: "text",
      questId: "opaque-quest-id",
      release: "local",
      retryCount: 1,
      route: "/quest/opaque-quest-id",
      xpAwarded: 8,
    }),
  ).toEqual({
    $insert_id: "unthink:complete-2026-08-13",
    auth_state: "authenticated",
    duration_ms: 850,
    environment: "development",
    event_name: "learning_operation_completed",
    family: "bridge",
    mode: "standard",
    operation_id: "complete-2026-08-13",
    operation_name: "complete_quest",
    outcome: "succeeded",
    proof_kind: "text",
    quest_id: "opaque-quest-id",
    redaction_version: 1,
    release: "local",
    retry_count: 1,
    route: "/quest/opaque-quest-id",
    sample_rate: 1,
    schema_version: 1,
    service_name: "unthink-web",
    xp_awarded: 8,
  });
});

test("the final exporter redactor rejects unknown events, keys, URLs, and email-shaped text", () => {
  expect(redactTelemetryCapture({ event: "pageview", properties: {} })).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "learning_operation_completed",
      properties: {
        $config_defaults: "2025-05-24",
        $insert_id: "unthink:complete-operation",
        $browser: "Microsoft Edge",
        $is_identified: false,
        $session_id: "123e4567-e89b-42d3-a456-426614174000",
        $window_id: "123e4567-e89b-42d3-a456-426614174001",
        auth_state: "authenticated",
        duration_ms: 850,
        environment: "development",
        family: "bridge",
        mode: "standard",
        operation_id: "complete-operation",
        operation_name: "complete_quest",
        outcome: "succeeded",
        proof_kind: "text",
        quest_id: "opaque-quest-id",
        redaction_version: 1,
        release: "release-1234",
        retry_count: 0,
        route: "/quest/:questId",
        sample_rate: 1,
        schema_version: 1,
        service_name: "unthink-web",
        token: "phc_1234567890abcdefghijklmnop",
        xp_awarded: 8,
      },
    }),
  ).toEqual({
    event: "learning_operation_completed",
    properties: expect.not.objectContaining({ $config_defaults: expect.anything() }),
  });
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: {
        error_class: "TypeError",
        operation_id: "safe-operation",
        private_note_from_sdk_plugin: "must be rejected",
        redaction_version: 1,
        token: "phc_1234567890abcdefghijklmnop",
      },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "TypeError", email: "owner@example.com" },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "TypeError", $lib: { nested: "private" } },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "TypeError", $feature_flag: "private" },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "https://private.example" },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: {
        $lib: "web",
        distinct_id: "123e4567-e89b-42d3-a456-426614174002",
        token: "phc_1234567890abcdefghijklmnop",
        error_class: "TypeError",
        operation_id: "safe-operation",
        redaction_version: 1,
      },
    }),
  ).not.toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: {
        distinct_id: "my-private-proof-note",
        error_class: "TypeError",
        operation_id: "safe-operation",
        redaction_version: 1,
        token: "phc_1234567890abcdefghijklmnop",
      },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "TypeError", private_value: "hidden" },
    }),
  ).toBeNull();
  expect(
    redactTelemetryCapture({
      event: "$exception",
      properties: { token: "public", error_class: "TypeError", $current_url: "/proof/private" },
    }),
  ).toBeNull();
});

test("unexpected errors retain a class and operation id but reject private content", () => {
  expect(sanitizeUnexpectedError(new TypeError("proof text leaked"), "operation-1234")).toEqual({
    error_class: "TypeError",
    operation_id: "operation-1234",
    redaction_version: 1,
  });
  expect(sanitizeUnexpectedError({ name: "owner@example.com" }, "operation-1234").error_class).toBe(
    "UnknownError",
  );
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
