import { APP_ORIGINS } from "../../shared/deployment";

type AuthPolicyInput = {
  appEnvironment: string;
  convexSiteUrl: string;
  siteUrl?: string;
};

export type AuthPolicy = {
  appOrigin: string;
};

function parseExactOrigin(value: string, code: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(code);
  }
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(code);
  }
  return url;
}

export function resolveAuthPolicy({
  appEnvironment,
  convexSiteUrl,
  siteUrl,
}: AuthPolicyInput): AuthPolicy {
  const convexOrigin = parseExactOrigin(convexSiteUrl, "CONVEX_SITE_URL_INVALID");
  if (
    convexOrigin.protocol !== "https:" ||
    !convexOrigin.hostname.endsWith(".convex.site") ||
    convexOrigin.hostname.includes("*")
  ) {
    throw new Error("CONVEX_SITE_URL_INVALID");
  }

  if (appEnvironment === "development" && siteUrl === APP_ORIGINS.local) {
    return {
      appOrigin: APP_ORIGINS.local,
    };
  }

  if (appEnvironment === "production" && siteUrl === APP_ORIGINS.production) {
    return {
      appOrigin: APP_ORIGINS.production,
    };
  }

  throw new Error("AUTH_ORIGIN_INVALID");
}

export function parseAllowedEmails(value: string): ReadonlySet<string> {
  let decoded: JSONValue;
  try {
    // SAFETY: JSON.parse produces exactly the recursive JSONValue union. Individual entries are
    // decoded into normalized email strings before they cross the auth policy boundary.
    decoded = JSON.parse(value) as JSONValue;
  } catch {
    throw new Error("AUTH_ALLOWLIST_INVALID");
  }
  if (!Array.isArray(decoded) || decoded.length === 0) {
    throw new Error("AUTH_ALLOWLIST_INVALID");
  }

  const normalized = decoded.map((entry) => {
    if (Object.prototype.toString.call(entry) !== "[object String]" || Object(entry) === entry) {
      return "";
    }
    return String.prototype.trim.call(entry).toLowerCase();
  });
  if (normalized.some((email) => !email.includes("@") || email.length > 254)) {
    throw new Error("AUTH_ALLOWLIST_INVALID");
  }
  return new Set(normalized);
}

export function isBootstrapEnabled(value: string | undefined) {
  if (value === undefined || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  throw new Error("AUTH_BOOTSTRAP_SETTING_INVALID");
}
import type { JSONValue } from "convex/values";
