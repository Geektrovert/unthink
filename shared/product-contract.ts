export const capacityModes = ["rescue", "standard", "deep"] as const;
export const frictionResponses = ["yes", "sometimes", "no", "skip"] as const;
export const proofKinds = ["text", "reference", "file"] as const;
export const rewardCategoryOptions = ["creative", "choice"] as const;
export const supportOptions = [
  "exact-resume",
  "written-outline",
  "low-stimulation",
  "optional-timer",
] as const;

export const productTextLimits = {
  calibration: 1_000,
  goal: 120,
  questDraft: 4_000,
} as const;
