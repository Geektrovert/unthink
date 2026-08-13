import { expect, test } from "vitest";

import { resolveBrowserStage } from "../../src/runtime-stage";

test("browser stage follows Vercel's built-in deployment environment", () => {
  expect(resolveBrowserStage({ mode: "production", vercelEnvironment: "production" })).toBe(
    "production",
  );
  expect(resolveBrowserStage({ mode: "production", vercelEnvironment: "preview" })).toBe("staging");
  expect(resolveBrowserStage({ mode: "development", vercelEnvironment: "development" })).toBe(
    "development",
  );
});

test("ordinary local and test runs do not impersonate a deployed stage", () => {
  expect(resolveBrowserStage({ mode: "production" })).toBe("local");
  expect(resolveBrowserStage({ mode: "development" })).toBe("local");
  expect(resolveBrowserStage({ mode: "test" })).toBe("test");
  expect(resolveBrowserStage({ mode: "production", vercelEnvironment: "unexpected" })).toBe(
    "local",
  );
});
