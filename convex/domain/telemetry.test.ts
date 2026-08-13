import { expect, test } from "vitest";

import { journeyDefinition } from "../../shared/telemetry-contract";
import {
  buildBackendWideEvent,
  redactBackendPostHogEvent,
  resolveBackendTelemetryEnvironment,
  sanitizedBackendError,
} from "./telemetry";

const operationId = "complete-quest-123e4567-e89b-42d3-a456-426614174011";
const environment = resolveBackendTelemetryEnvironment("staging", "1234567890abcdef");
if (environment === null) throw new Error("TEST_ENVIRONMENT_INVALID");

test("a committed backend hop shares the central journey ID and stage", () => {
  expect(environment).not.toBeNull();
  const definition = journeyDefinition("complete_quest");
  const properties = buildBackendWideEvent(
    {
      durationMs: 42,
      family: "bridge",
      journey: "complete_quest",
      mode: "standard",
      operationId,
      proofKind: "text",
      questId: "123e4567e89b42d3a456426614174012",
      xpAwarded: 8,
    },
    environment,
  );
  expect(
    redactBackendPostHogEvent(
      {
        distinctId: "123e4567e89b42d3a456426614174013",
        event: definition.eventName,
        properties,
      },
      environment,
    ),
  ).toMatchObject({
    properties: {
      environment: "staging",
      operation_id: operationId,
      operation_name: definition.operationName,
      service_hop: "backend",
      stage: "staging",
      trace_id: operationId,
    },
  });
});

test("the backend exporter rejects private additions and invalid stage configuration", () => {
  const definition = journeyDefinition("delete_proof");
  const properties = buildBackendWideEvent(
    {
      durationMs: 3,
      fileCount: 1,
      journey: "delete_proof",
      operationId: "delete-proof-123e4567-e89b-42d3-a456-426614174014",
      rowCount: 1,
    },
    environment,
  );
  const propertiesWithPrivateContent = { ...properties, proof_note: "private" };
  expect(
    redactBackendPostHogEvent(
      {
        distinctId: "123e4567e89b42d3a456426614174013",
        event: definition.eventName,
        properties: propertiesWithPrivateContent,
      },
      environment,
    ),
  ).toBeNull();
  expect(resolveBackendTelemetryEnvironment("preview", "1234567890abcdef")).toBeNull();
});

test("backend exceptions discard raw messages and stacks before capture", () => {
  const error = sanitizedBackendError(new TypeError("private proof text"));
  expect(error.name).toBe("TypeError");
  expect(error.message).toBe("Unexpected Convex operation failure");
  expect(error.stack).toBeUndefined();
});
