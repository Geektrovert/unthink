/// <reference types="vite/client" />

import posthogTest from "@posthog/convex/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { captureBackendOperation } from "./posthog";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("a valid backend wide event schedules the official PostHog component", async () => {
  vi.useFakeTimers();
  try {
    const backend = convexTest(schema, modules);
    posthogTest.register(backend);
    const owner = backend.withIdentity({ subject: "123e4567e89b42d3a456426614174020" });
    expect(
      await owner.mutation(
        async (ctx) =>
          await captureBackendOperation(ctx, {
            durationMs: 4,
            journey: "start_quest",
            operationId: "start-quest-123e4567-e89b-42d3-a456-426614174021",
          }),
      ),
    ).toBe(true);

    await backend.run(async (ctx) => {
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      expect(scheduled).toHaveLength(1);
      for (const job of scheduled) await ctx.scheduler.cancel(job._id);
    });
  } finally {
    vi.useRealTimers();
  }
});
