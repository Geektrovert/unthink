/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function createOwnerWithEarnedXp() {
  const backend = convexTest(schema, modules);
  const owner = backend.withIdentity({ subject: "owner" });
  const ownerToken = "https://convex.test|owner";
  await backend.run(async (ctx) => {
    await ctx.db.insert("profiles", {
      establishedDomainKeys: ["backend", "systems"],
      onboardingComplete: true,
      onboardingStep: "complete",
      ownerToken,
      revival: "drawing",
      rewardPreferences: {
        celebration: true,
        rewardSuggestions: true,
        showXp: true,
        sound: false,
      },
      timezone: "UTC",
      updatedAt: 1,
    });
    for (const [index, amount] of [5, 5, 5].entries()) {
      const questId = await ctx.db.insert("quests", {
        activeStep: "proof",
        allowedProofKinds: ["text", "reference", "file"],
        capacityVariants: { deep: "Done deeply", rescue: "Done small", standard: "Done" },
        checkMethod: "Inspect",
        completedAt: index + 1,
        createdOperationId: `prepare-operation-${index}`,
        dayKey: `2026-08-${String(index + 10).padStart(2, "0")}`,
        domainKeys: ["testing"],
        doneCondition: "Done",
        evidenceLabels: ["product-hypothesis"],
        family: "review",
        helpLevel: 0,
        mode: "standard",
        objective: "Test reward behavior",
        ownerToken,
        possibleXpTags: ["proof"],
        seedKey: `seed-${index}`,
        seedVersion: 1,
        status: "completed",
        stepSpec: { connect: "c", feedback: "f", make: "m", proof: "p", retrieve: "r" },
        title: "Fixture quest",
        updatedAt: index + 1,
        whyNow: "Fixture",
      });
      await ctx.db.insert("rewardLedger", {
        amount,
        awardIdempotencyKey: `award-${index}`,
        awardKind: "proof",
        createdAt: index + 1,
        localDay: `2026-08-${String(index + 10).padStart(2, "0")}`,
        operationId: `complete-${index}`,
        ownerToken,
        questId,
      });
    }
  });
  return owner;
}

test("an earned unlock is redeemed once without spending lifetime XP", async () => {
  const owner = await createOwnerWithEarnedXp();
  const before = await owner.query(api.rewards.listAvailable, {});
  expect(before.find(({ rewardKey }) => rewardKey === "choose-next-intent")?.state).toBe(
    "available",
  );
  expect(before.find(({ rewardKey }) => rewardKey === "protected-studio-session")?.state).toBe(
    "locked",
  );

  const receipt = await owner.mutation(api.rewards.redeem, {
    catalogueVersion: 1,
    choiceKey: "bridge",
    idempotencyKey: "redeem-choose-next-intent-1",
    operationId: "reward-operation-1",
    rewardKey: "choose-next-intent",
  });
  const retried = await owner.mutation(api.rewards.redeem, {
    catalogueVersion: 1,
    choiceKey: "bridge",
    idempotencyKey: "redeem-choose-next-intent-1",
    operationId: "reward-operation-1",
    rewardKey: "choose-next-intent",
  });
  expect(retried).toEqual(receipt);
  expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
    operationId: "reward-operation-1",
    state: "claimed",
  });
  expect((await owner.query(api.rewards.getSummary, { dayKey: "2026-08-13" })).lifetimeXp).toBe(15);
  await expect(
    owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      idempotencyKey: "redeem-locked-reward-1",
      operationId: "reward-operation-2",
      rewardKey: "protected-studio-session",
    }),
  ).rejects.toThrow("REWARD_LOCKED");
  await expect(
    owner.mutation(api.rewards.redeem, {
      catalogueVersion: 0,
      choiceKey: "bridge",
      idempotencyKey: "redeem-stale-catalogue-1",
      operationId: "reward-operation-3",
      rewardKey: "choose-next-intent",
    }),
  ).rejects.toThrow("REWARD_CATALOGUE_STALE");
  await expect(
    owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      idempotencyKey: "redeem-unknown-reward-1",
      operationId: "reward-operation-4",
      rewardKey: "unknown",
    }),
  ).rejects.toThrow("REWARD_UNKNOWN");

  await owner.mutation(api.profile.updateRewardSettings, {
    preferences: {
      celebration: false,
      motion: false,
      rewardCategories: ["creative"],
      rewardSuggestions: true,
      showXp: false,
      sound: false,
    },
  });
  const creativeOnly = await owner.query(api.rewards.listAvailable, {});
  expect(creativeOnly.map(({ rewardKey }) => rewardKey)).toEqual(["protected-studio-session"]);
  await expect(
    owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      choiceKey: "bridge",
      idempotencyKey: "redeem-hidden-category-1",
      operationId: "reward-operation-hidden",
      rewardKey: "choose-next-intent",
    }),
  ).rejects.toThrow("REWARD_CATEGORY_HIDDEN");
});

test("a next-intent receipt waits for the next local day and records its applied seed", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    const owner = await createOwnerWithEarnedXp();
    const receipt = await owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      choiceKey: "bridge",
      idempotencyKey: "redeem-next-day-intent",
      operationId: "reward-next-day-operation",
      rewardKey: "choose-next-intent",
    });
    expect(receipt.targetDayKey).toBe("2026-08-14");

    await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-13",
      operationId: "prepare-same-day-operation",
    });
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]?.state).toBe("claimed");

    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const next = await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-14",
      operationId: "prepare-next-day-operation",
    });
    expect(next.quest.family).toBe("bridge");
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
      appliedSeedKey: next.quest.seedKey,
      state: "applied",
      targetDayKey: "2026-08-14",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("an intent that becomes ineligible gets an explicit prerequisite-safe fallback receipt", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    const owner = await createOwnerWithEarnedXp();
    await owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      choiceKey: "revival",
      idempotencyKey: "redeem-revival-next-day",
      operationId: "reward-revival-operation",
      rewardKey: "choose-next-intent",
    });
    await owner.mutation(api.profile.updateLearningSettings, {
      anchor: "backend",
      learningPreferences: {
        defaultMode: "standard",
        lowStimulation: true,
        timerVisible: false,
      },
      northStar: "physics",
      supports: ["exact-resume"],
    });

    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const next = await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-14",
      operationId: "prepare-fallback-operation",
    });
    expect(next.quest.family).not.toBe("revival");
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
      appliedSeedKey: next.quest.seedKey,
      fallbackReason: "INTENT_NO_LONGER_ELIGIBLE",
      state: "applied",
    });
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-15",
      operationId: "prepare-after-fallback-operation",
    });
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
      appliedSeedKey: next.quest.seedKey,
      fallbackReason: "INTENT_NO_LONGER_ELIGIBLE",
      state: "applied",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("a missed target day settles once with an explicit fallback receipt", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    const owner = await createOwnerWithEarnedXp();
    await owner.mutation(api.rewards.redeem, {
      catalogueVersion: 1,
      choiceKey: "bridge",
      idempotencyKey: "redeem-missed-target-day",
      operationId: "reward-missed-target-operation",
      rewardKey: "choose-next-intent",
    });

    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    const fallbackQuest = await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-15",
      operationId: "prepare-after-missed-target",
    });
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
      appliedSeedKey: fallbackQuest.quest.seedKey,
      fallbackReason: "TARGET_DAY_MISSED",
      state: "applied",
      targetDayKey: "2026-08-14",
    });

    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    await owner.mutation(api.quests.prepareToday, {
      dayKey: "2026-08-16",
      operationId: "prepare-day-after-fallback",
    });
    expect((await owner.query(api.rewards.listRedemptions, {}))[0]).toMatchObject({
      appliedSeedKey: fallbackQuest.quest.seedKey,
      fallbackReason: "TARGET_DAY_MISSED",
      state: "applied",
    });
  } finally {
    vi.useRealTimers();
  }
});
