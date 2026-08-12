import { buildCompletionEvent, redactTelemetryCapture, sanitizeUnexpectedError } from "./telemetry";
import type { BeforeSendFn } from "posthog-js";

type CompletionInput = Parameters<typeof buildCompletionEvent>[0];

const publicKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const configuredHost = import.meta.env.VITE_POSTHOG_HOST as string | undefined;
const release = (import.meta.env.VITE_RELEASE as string | undefined) ?? "local";
let clientPromise: Promise<(typeof import("posthog-js"))["default"]> | undefined;

function loadClient() {
  clientPromise ??= import("posthog-js").then(({ default: posthog }) => posthog);
  return clientPromise;
}

function telemetryConfigured() {
  if (publicKey === undefined && configuredHost === undefined) return false;
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
  return true;
}

export function initializeTelemetry() {
  try {
    if (!telemetryConfigured()) return false;
  } catch {
    return false;
  }
  void loadClient()
    .then((posthog) => {
      posthog.init(publicKey!, {
        api_host: configuredHost,
        autocapture: false,
        before_send: redactTelemetryCapture as BeforeSendFn,
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

export function emitCompletionEvent(input: Omit<CompletionInput, "release">) {
  try {
    if (!telemetryConfigured()) return false;
    void loadClient()
      .then((posthog) => {
        const event = buildCompletionEvent({ ...input, release });
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

export function captureUnexpectedError(error: unknown, operationId: string) {
  try {
    if (!telemetryConfigured()) return false;
    void loadClient()
      .then((posthog) => {
        const sanitized = sanitizeUnexpectedError(error, operationId);
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
