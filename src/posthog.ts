import posthog, { type BeforeSendFn } from "posthog-js";

import { createJourneyId, type JourneyName } from "../shared/telemetry-contract";
import { resolveBrowserStage } from "./runtime-stage";
import {
  buildBrowserOperationEvent,
  buildCompletionEvent,
  redactTelemetryCapture,
  sanitizedBrowserError,
  sanitizeUnexpectedError,
} from "./telemetry";
import type { BrowserOperationInput, CompletionEventInput } from "./telemetry";

type TelemetryConfiguration = {
  host: string;
  publicKey: string;
  release: string;
  stage: ReturnType<typeof resolveBrowserStage>;
};

type BrowserOperationTrackerInput = Pick<BrowserOperationInput, "journey" | "operationId">;

type CompletionJourneyInput = Pick<
  CompletionEventInput,
  "family" | "mode" | "operationId" | "proofKind" | "questId"
>;

const publicKey = import.meta.env.VITE_POSTHOG_KEY;
const configuredHost = import.meta.env.VITE_POSTHOG_HOST;
const stage = resolveBrowserStage({
  mode: import.meta.env.MODE,
  vercelEnvironment: import.meta.env.VITE_VERCEL_ENV,
});
const candidateRelease = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;
const release =
  candidateRelease !== undefined && /^[0-9a-f]{7,64}$/i.test(candidateRelease)
    ? candidateRelease
    : "local";
let identifiedUserId: string | undefined;

function telemetryConfiguration(): TelemetryConfiguration | null {
  if (
    publicKey === undefined ||
    publicKey.length === 0 ||
    configuredHost === undefined ||
    configuredHost.length === 0
  ) {
    return null;
  }
  const host = new URL(configuredHost);
  if (host.protocol !== "https:" || host.origin !== configuredHost) {
    throw new Error("POSTHOG_HOST_INVALID");
  }
  return { host: configuredHost, publicKey, release, stage };
}

const beforeSend: BeforeSendFn = (capture) => {
  if (capture === null) return null;
  const configuration = telemetryConfiguration();
  if (configuration === null) return null;
  return redactTelemetryCapture({
    ...capture,
    properties: {
      ...capture.properties,
      environment: configuration.stage,
      release: configuration.release,
      stage: configuration.stage,
    },
  });
};

export { posthog };

export function newJourneyId(journey: JourneyName) {
  return createJourneyId(journey);
}

export function initializeTelemetry() {
  let configuration: TelemetryConfiguration | null;
  try {
    configuration = telemetryConfiguration();
  } catch {
    return false;
  }
  if (configuration === null) return false;
  posthog.init(configuration.publicKey, {
    api_host: configuration.host,
    autocapture: false,
    before_send: beforeSend,
    capture_exceptions: false,
    capture_pageleave: false,
    capture_pageview: false,
    disable_session_recording: true,
    loaded: () => undefined,
    person_profiles: "identified_only",
    persistence: "memory",
    property_denylist: [
      "$current_url",
      "$initial_current_url",
      "$initial_referrer",
      "$initial_referring_domain",
      "$pathname",
      "$referrer",
      "$referring_domain",
    ],
  });
  return true;
}

export function identifyTelemetryUser(userId: string) {
  if (
    !/^(?:[a-z0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(
      userId,
    )
  ) {
    return false;
  }
  try {
    if (telemetryConfiguration() === null) return false;
    if (identifiedUserId === userId) return true;
    posthog.identify(userId);
    identifiedUserId = userId;
    return true;
  } catch {
    return false;
  }
}

export function resetTelemetryIdentity() {
  if (identifiedUserId === undefined) return true;
  identifiedUserId = undefined;
  try {
    if (telemetryConfiguration() === null) return false;
    posthog.reset();
    return true;
  } catch {
    return false;
  }
}

function captureBrowserOperation(input: BrowserOperationInput) {
  try {
    const configuration = telemetryConfiguration();
    if (configuration === null) return false;
    const event = buildBrowserOperationEvent({
      ...input,
      release: configuration.release,
      stage: configuration.stage,
    });
    const { event_name: eventName, ...properties } = event;
    posthog.capture(eventName, properties);
    return true;
  } catch {
    return false;
  }
}

export function beginBrowserJourney(
  journey: Exclude<JourneyName, "complete_quest">,
  operationId: string,
) {
  const input: BrowserOperationTrackerInput = { journey, operationId };
  const startedAt = performance.now();
  let finished = false;
  return {
    failed(cause: unknown) {
      if (finished) return false;
      finished = true;
      return captureBrowserOperation({
        ...input,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        errorClass: cause instanceof Error ? cause.name : undefined,
        outcome: "failed",
        release,
        stage,
      });
    },
    succeeded() {
      if (finished) return false;
      finished = true;
      return captureBrowserOperation({
        ...input,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        outcome: "succeeded",
        release,
        stage,
      });
    },
  };
}

export function beginCompletionJourney(input: CompletionJourneyInput) {
  const startedAt = performance.now();
  let finished = false;

  function finish(
    outcome: CompletionEventInput["outcome"],
    xpAwarded: number,
    retryCount: number,
    cause?: unknown,
  ) {
    if (finished) return false;
    finished = true;
    const event: CompletionEventInput = {
      ...input,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outcome,
      retryCount,
      xpAwarded,
    };
    if (cause instanceof Error) event.errorClass = cause.name;
    return emitCompletionEvent(event);
  }

  return {
    failed(cause: unknown) {
      return finish("failed", 0, 0, cause);
    },
    succeeded(xpAwarded: number, retryCount = 0) {
      return finish("succeeded", xpAwarded, retryCount);
    },
  };
}

export function emitCompletionEvent(input: CompletionEventInput) {
  try {
    const configuration = telemetryConfiguration();
    if (configuration === null) return false;
    const event = buildCompletionEvent({
      ...input,
      release: configuration.release,
      stage: configuration.stage,
    });
    const { event_name: eventName, ...properties } = event;
    posthog.capture(eventName, properties);
    return true;
  } catch {
    return false;
  }
}

export function captureUnexpectedError(cause: unknown, operationId: string) {
  try {
    const configuration = telemetryConfiguration();
    if (configuration === null) return false;
    posthog.captureException(sanitizedBrowserError(cause), {
      ...sanitizeUnexpectedError(cause, operationId),
      environment: configuration.stage,
      release: configuration.release,
      stage: configuration.stage,
    });
    return true;
  } catch {
    return false;
  }
}
