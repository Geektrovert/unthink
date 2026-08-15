import { z } from "zod";

import {
  frictionResponses,
  productTextLimits,
  supportOptions,
} from "../../shared/product-contract";

export const frictionKeys = [
  "distract",
  "estimate",
  "overload",
  "remember",
  "resume",
  "start",
  "stop",
  "switch",
] as const;

export const calibrationTasks = [
  {
    key: "recall",
    prompt: "Close your notes and explain one idea you learned recently in three sentences.",
  },
  {
    key: "apply",
    prompt: "Use that idea in the smallest concrete example you can inspect.",
  },
  {
    key: "bridge",
    prompt: "Connect it to a domain you already know, then name where the analogy breaks.",
  },
  {
    key: "teach",
    prompt: "Explain the idea for a capable peer and include one likely failure mode.",
  },
  {
    key: "stop",
    prompt: "Stop at a clear done condition and record what made it enough.",
  },
] as const;

type FrictionKey = (typeof frictionKeys)[number];
type FrictionResponse = (typeof frictionResponses)[number];
type Support = (typeof supportOptions)[number];
type CalibrationTaskKey = (typeof calibrationTasks)[number]["key"];

export type OnboardingValues = {
  anchor: string;
  calibration: Record<CalibrationTaskKey, { correction: string; observation: string }>;
  celebration: boolean;
  domainKeys: string;
  friction: Record<FrictionKey, FrictionResponse>;
  northStar: string;
  revival: string;
  rewardSuggestions: boolean;
  showXp: boolean;
  sound: boolean;
  supports: Support[];
};

export const boundedGoal = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .max(productTextLimits.goal, "Keep this under 120 characters.");
export const optionalGoal = z
  .string()
  .trim()
  .max(productTextLimits.goal, "Keep this under 120 characters.");
export const domainKeysSchema = z.string().superRefine((value, context) => {
  const domains = parseDomainKeys(value);
  if (domains.length === 0)
    context.addIssue({ code: "custom", message: "Add at least one domain." });
  if (domains.length > 12) context.addIssue({ code: "custom", message: "Use at most 12 domains." });
  if (domains.some((domain) => domain.length > productTextLimits.goal)) {
    context.addIssue({ code: "custom", message: "Keep each domain under 120 characters." });
  }
});
export const observationSchema = z
  .string()
  .trim()
  .min(1, "Record what happened before continuing.")
  .max(productTextLimits.calibration, "Keep this under 1,000 characters.");
export const correctionSchema = z
  .string()
  .trim()
  .max(productTextLimits.calibration, "Keep this under 1,000 characters.");

export const emptyFriction = {
  distract: "skip",
  estimate: "skip",
  overload: "skip",
  remember: "skip",
  resume: "skip",
  start: "skip",
  stop: "skip",
  switch: "skip",
} satisfies Record<FrictionKey, FrictionResponse>;

export const emptyCalibration: OnboardingValues["calibration"] = {
  apply: { correction: "", observation: "" },
  bridge: { correction: "", observation: "" },
  recall: { correction: "", observation: "" },
  stop: { correction: "", observation: "" },
  teach: { correction: "", observation: "" },
};

export function parseDomainKeys(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  ];
}

export function initialOnboardingValues(): OnboardingValues {
  return {
    anchor: "backend systems",
    calibration: structuredClone(emptyCalibration),
    celebration: true,
    domainKeys: "backend, systems",
    friction: { ...emptyFriction },
    northStar: "physics",
    revival: "drawing",
    rewardSuggestions: true,
    showXp: true,
    sound: false,
    supports: ["exact-resume"],
  };
}
