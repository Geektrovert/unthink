/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as domain_auth_policy from "../domain/auth_policy.js";
import type * as domain_calendar from "../domain/calendar.js";
import type * as domain_pilot_deck from "../domain/pilot_deck.js";
import type * as domain_privacy_policy from "../domain/privacy_policy.js";
import type * as domain_reward_policy from "../domain/reward_policy.js";
import type * as evidence from "../evidence.js";
import type * as http from "../http.js";
import type * as model_auth from "../model/auth.js";
import type * as model_documents from "../model/documents.js";
import type * as model_privacy_contract from "../model/privacy_contract.js";
import type * as model_privacy_delete from "../model/privacy_delete.js";
import type * as model_privacy_export from "../model/privacy_export.js";
import type * as model_privacy_snapshot from "../model/privacy_snapshot.js";
import type * as model_reward_totals from "../model/reward_totals.js";
import type * as privacy from "../privacy.js";
import type * as profile from "../profile.js";
import type * as quests from "../quests.js";
import type * as rewards from "../rewards.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "domain/auth_policy": typeof domain_auth_policy;
  "domain/calendar": typeof domain_calendar;
  "domain/pilot_deck": typeof domain_pilot_deck;
  "domain/privacy_policy": typeof domain_privacy_policy;
  "domain/reward_policy": typeof domain_reward_policy;
  evidence: typeof evidence;
  http: typeof http;
  "model/auth": typeof model_auth;
  "model/documents": typeof model_documents;
  "model/privacy_contract": typeof model_privacy_contract;
  "model/privacy_delete": typeof model_privacy_delete;
  "model/privacy_export": typeof model_privacy_export;
  "model/privacy_snapshot": typeof model_privacy_snapshot;
  "model/reward_totals": typeof model_reward_totals;
  privacy: typeof privacy;
  profile: typeof profile;
  quests: typeof quests;
  rewards: typeof rewards;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
