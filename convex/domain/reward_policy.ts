import type { QuestFamily } from "./pilot_deck";

export type EligibilityProfile = {
  establishedDomainKeys?: string[];
  northStar?: string;
  revival?: string;
};

export function eligibleQuestFamilies(profile: EligibilityProfile, hasProof: boolean) {
  return new Set<QuestFamily>([
    "anchor",
    ...(hasProof ? (["recall", "teach"] as const) : []),
    ...((profile.establishedDomainKeys?.length ?? 0) >= 2 ? (["bridge"] as const) : []),
    ...(profile.revival?.trim() ? (["revival"] as const) : []),
    ...(profile.northStar?.trim() ? (["north-star"] as const) : []),
    "review",
  ]);
}
