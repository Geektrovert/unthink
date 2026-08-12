/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createOwnerQuestBoundary() {
  const backend = convexTest(schema, modules);
  return {
    anonymous: backend,
    owner: backend.withIdentity({ subject: "owner" }),
  };
}

test("an anonymous visitor cannot read the private daily quest", async () => {
  const { anonymous } = createOwnerQuestBoundary();

  await expect(anonymous.query(api.quests.getToday, { dayKey: "2026-08-13" })).rejects.toThrow(
    "UNAUTHENTICATED",
  );
});
