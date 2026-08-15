import type { FunctionArgs } from "convex/server";
import { z } from "zod";

import { api } from "../../convex/_generated/api";
import {
  capacityModes,
  productTextLimits,
  rewardCategoryOptions,
  supportOptions,
} from "../../shared/product-contract";

export const learningSettingsSchema = z.object({
  anchor: z.string().trim().min(1, "Anchor is required.").max(productTextLimits.goal),
  defaultMode: z.enum(capacityModes),
  lowStimulation: z.boolean(),
  northStar: z.string().trim().min(1, "North Star is required.").max(productTextLimits.goal),
  revival: z.string().trim().max(productTextLimits.goal),
  supports: z.array(z.enum(supportOptions)).max(supportOptions.length),
  timerVisible: z.boolean(),
});

export const rewardSettingsSchema = z.object({
  celebration: z.boolean(),
  motion: z.boolean(),
  rewardCategories: z.array(z.enum(rewardCategoryOptions)).max(rewardCategoryOptions.length),
  rewardSuggestions: z.boolean(),
  showXp: z.boolean(),
  sound: z.boolean(),
});

export type LearningSettingsValues = z.infer<typeof learningSettingsSchema>;
export type RewardSettingsValues = z.infer<typeof rewardSettingsSchema>;

type LearningProfileSnapshot = {
  anchor?: string;
  learningPreferences?: {
    defaultMode: LearningSettingsValues["defaultMode"];
    lowStimulation: boolean;
    timerVisible: boolean;
  };
  northStar?: string;
  revival?: string;
  supports?: LearningSettingsValues["supports"];
};

type RewardProfileSnapshot = {
  rewardPreferences?: {
    celebration: boolean;
    motion?: boolean;
    rewardCategories?: RewardSettingsValues["rewardCategories"];
    rewardSuggestions: boolean;
    showXp: boolean;
    sound: boolean;
  };
};

type DraftState = {
  isDirty: boolean;
};

type Reconciliation<T> = { kind: "preserve-draft" } | { kind: "replace-from-profile"; values: T };

export function initialLearningSettings(): LearningSettingsValues {
  return {
    anchor: "",
    defaultMode: "standard",
    lowStimulation: false,
    northStar: "",
    revival: "",
    supports: [],
    timerVisible: false,
  };
}

export function initialRewardSettings(): RewardSettingsValues {
  return {
    celebration: true,
    motion: true,
    rewardCategories: [],
    rewardSuggestions: true,
    showXp: true,
    sound: false,
  };
}

export function reconcileLearningSettings(
  profile: LearningProfileSnapshot,
  draft: DraftState,
): Reconciliation<LearningSettingsValues> {
  if (draft.isDirty) return { kind: "preserve-draft" };
  return {
    kind: "replace-from-profile",
    values: {
      anchor: profile.anchor ?? "",
      defaultMode: profile.learningPreferences?.defaultMode ?? "standard",
      lowStimulation: profile.learningPreferences?.lowStimulation ?? false,
      northStar: profile.northStar ?? "",
      revival: profile.revival ?? "",
      supports: profile.supports ?? [],
      timerVisible: profile.learningPreferences?.timerVisible ?? false,
    },
  };
}

export function reconcileRewardSettings(
  profile: RewardProfileSnapshot,
  draft: DraftState,
): Reconciliation<RewardSettingsValues> {
  if (draft.isDirty) return { kind: "preserve-draft" };
  return {
    kind: "replace-from-profile",
    values: {
      celebration: profile.rewardPreferences?.celebration ?? true,
      motion: profile.rewardPreferences?.motion ?? true,
      rewardCategories: profile.rewardPreferences?.rewardCategories ?? [],
      rewardSuggestions: profile.rewardPreferences?.rewardSuggestions ?? true,
      showXp: profile.rewardPreferences?.showXp ?? true,
      sound: profile.rewardPreferences?.sound ?? false,
    },
  };
}

export function learningSettingsMutationArgs(
  settings: LearningSettingsValues,
  operationId: string,
): FunctionArgs<typeof api.profile.updateLearningSettings> {
  return {
    anchor: settings.anchor,
    learningPreferences: {
      defaultMode: settings.defaultMode,
      lowStimulation: settings.lowStimulation,
      timerVisible: settings.timerVisible,
    },
    northStar: settings.northStar,
    operationId,
    revival: settings.revival || undefined,
    supports: settings.supports,
  };
}

export function rewardSettingsMutationArgs(
  preferences: RewardSettingsValues,
  operationId: string,
): FunctionArgs<typeof api.profile.updateRewardSettings> {
  return { operationId, preferences };
}
