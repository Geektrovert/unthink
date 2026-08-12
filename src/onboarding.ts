export const onboardingSteps = ["promise", "goals", "supports", "rewards", "calibration"] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

export function resumableOnboardingStep(persistedStep: OnboardingStep | "complete") {
  return persistedStep === "complete" ? "calibration" : persistedStep;
}
