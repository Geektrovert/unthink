import { PostHog } from "@posthog/convex";

import {
  journeyDefinition,
  postHogInsertId,
  TELEMETRY_REDACTION_VERSION,
  TELEMETRY_SCHEMA_VERSION,
} from "../shared/telemetry-contract";
import { components } from "./_generated/api";
import { env } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import {
  buildBackendWideEvent,
  redactBackendPostHogEvent,
  resolveBackendTelemetryEnvironment,
  sanitizedBackendError,
} from "./domain/telemetry";
import type { BackendOperationInput, BackendPostHogEvent } from "./domain/telemetry";

type TelemetryCtx = Pick<ActionCtx, "auth" | "scheduler"> | Pick<MutationCtx, "auth" | "scheduler">;

function environment() {
  return resolveBackendTelemetryEnvironment(env.APP_ENVIRONMENT, env.APP_RELEASE);
}

const client = new PostHog(components.posthog, {
  beforeSend: (event) => {
    // SAFETY: This module's two capture helpers are the only users of the private client and both
    // build primitive-only properties before the component invokes beforeSend.
    const candidate = event as BackendPostHogEvent;
    return redactBackendPostHogEvent(candidate, environment());
  },
});

export async function captureBackendOperation(ctx: TelemetryCtx, input: BackendOperationInput) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return false;
  const telemetryEnvironment = environment();
  if (telemetryEnvironment === null) return false;
  try {
    await client.capture(ctx, {
      disableGeoip: true,
      distinctId: identity.subject,
      event: journeyDefinition(input.journey).eventName,
      properties: buildBackendWideEvent(input, telemetryEnvironment),
    });
    return true;
  } catch {
    return false;
  }
}

export async function captureBackendException(
  ctx: TelemetryCtx,
  input: Pick<BackendOperationInput, "durationMs" | "journey" | "operationId"> & {
    cause: unknown;
  },
) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return false;
  const telemetryEnvironment = environment();
  if (telemetryEnvironment === null) return false;
  try {
    const error = sanitizedBackendError(input.cause);
    const definition = journeyDefinition(input.journey);
    await client.captureException(ctx, {
      additionalProperties: {
        $exception_fingerprint: `unthink-convex:${error.name}`,
        $insert_id: postHogInsertId(input.operationId, "backend", "failed"),
        auth_state: "authenticated",
        durable_receipt: false,
        duration_ms: input.durationMs,
        environment: telemetryEnvironment.stage,
        error_class: error.name,
        lifecycle_phase: "failed",
        operation_id: input.operationId,
        operation_name: definition.operationName,
        outcome: "failed",
        redaction_version: TELEMETRY_REDACTION_VERSION,
        release: telemetryEnvironment.release,
        sample_rate: 1,
        schema_version: TELEMETRY_SCHEMA_VERSION,
        service_hop: "backend",
        service_name: "unthink-convex",
        stage: telemetryEnvironment.stage,
        trace_id: input.operationId,
      },
      distinctId: identity.subject,
      error,
    });
    return true;
  } catch {
    return false;
  }
}
