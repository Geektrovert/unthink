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
import type * as domain_pilot_deck from "../domain/pilot_deck.js";
import type * as evidence from "../evidence.js";
import type * as http from "../http.js";
import type * as model_auth from "../model/auth.js";
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
  "domain/pilot_deck": typeof domain_pilot_deck;
  evidence: typeof evidence;
  http: typeof http;
  "model/auth": typeof model_auth;
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
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
