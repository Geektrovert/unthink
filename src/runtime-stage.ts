import { isTelemetryStage, type TelemetryStage } from "../shared/telemetry-contract";

export type RuntimeStage = TelemetryStage;

type BrowserStageInput = {
  mode: string;
  vercelEnvironment?: string;
};

export function resolveBrowserStage({
  mode,
  vercelEnvironment,
}: BrowserStageInput): TelemetryStage {
  switch (vercelEnvironment) {
    case "production":
      return "production";
    case "preview":
      return "staging";
    case "development":
      return "development";
    case undefined:
      return mode === "test" ? "test" : "local";
    default:
      return "local";
  }
}

export function isRuntimeStage(value: string): value is RuntimeStage {
  return isTelemetryStage(value);
}
