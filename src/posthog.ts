import { buildCompletionEvent, redactTelemetryCapture, sanitizeUnexpectedError } from "./telemetry";
import type { BeforeSendFn } from "posthog-js";
import type { CompletionEventInput } from "./telemetry";

type TelemetryConfiguration = {
  host: string;
  publicKey: string;
  release: string;
};

const publicKey = import.meta.env.VITE_POSTHOG_KEY;
const configuredHost = import.meta.env.VITE_POSTHOG_HOST;
const release =
  import.meta.env.VITE_RELEASE ?? import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? "local";
let clientPromise: Promise<(typeof import("posthog-js"))["default"]> | undefined;

const beforeSend: BeforeSendFn = (capture) => redactTelemetryCapture(capture);

function loadClient() {
  clientPromise ??= import("posthog-js").then(({ default: posthog }) => posthog);
  return clientPromise;
}

function telemetryConfiguration(): TelemetryConfiguration | null {
  if (publicKey === undefined && configuredHost === undefined) return null;
  if (publicKey === undefined || configuredHost === undefined) {
    throw new Error("POSTHOG_CONFIGURATION_INCOMPLETE");
  }
  if (release === "local" || release.trim().length < 7) {
    throw new Error("POSTHOG_RELEASE_REQUIRED");
  }
  const host = new URL(configuredHost);
  if (host.protocol !== "https:" || host.origin !== configuredHost) {
    throw new Error("POSTHOG_HOST_INVALID");
  }
  return { host: configuredHost, publicKey, release };
}

export function initializeTelemetry() {
  let configuration: TelemetryConfiguration | null;
  try {
    configuration = telemetryConfiguration();
  } catch {
    return false;
  }
  if (configuration === null) return false;
  void loadClient()
    .then((posthog) => {
      posthog.init(configuration.publicKey, {
        api_host: configuration.host,
        autocapture: false,
        before_send: beforeSend,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        loaded: () => undefined,
        person_profiles: "never",
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
    })
    .catch(() => {
      // Telemetry is deliberately outside the canonical product transaction.
    });
  return true;
}

export function emitCompletionEvent(input: Omit<CompletionEventInput, "release">) {
  let configuration: TelemetryConfiguration | null;
  try {
    configuration = telemetryConfiguration();
    if (configuration === null) return false;
    const activeConfiguration = configuration;
    void loadClient()
      .then((posthog) => {
        const event = buildCompletionEvent({ ...input, release: activeConfiguration.release });
        const { event_name: eventName, ...properties } = event;
        posthog.capture(eventName, properties);
      })
      .catch(() => {
        // A receipt already exists; analytics failure cannot revise it.
      });
    return true;
  } catch {
    return false;
  }
}

export function captureUnexpectedError(cause: unknown, operationId: string) {
  let configuration: TelemetryConfiguration | null;
  try {
    configuration = telemetryConfiguration();
    if (configuration === null) return false;
    void loadClient()
      .then((posthog) => {
        const sanitized = sanitizeUnexpectedError(cause, operationId);
        posthog.capture("$exception", sanitized);
      })
      .catch(() => {
        // Error reporting must not create another unhandled browser error.
      });
    return true;
  } catch {
    return false;
  }
}
