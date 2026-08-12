import { expect, test } from "vitest";

import { resumableOnboardingStep } from "../../src/onboarding";

test("a partial final onboarding commit returns to calibration for a safe completion retry", () => {
  expect(resumableOnboardingStep("complete")).toBe("calibration");
});
