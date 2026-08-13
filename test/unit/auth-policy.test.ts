import { expect, test } from "vitest";

import { parseAllowedEmails, resolveAuthPolicy } from "../../convex/domain/auth_policy";

test("production authentication uses only the canonical Vercel application origin", () => {
  expect(
    resolveAuthPolicy({
      appEnvironment: "production",
      convexSiteUrl: "https://dutiful-toad-275.convex.site",
      siteUrl: "https://synkey.dev",
    }),
  ).toEqual({
    appOrigin: "https://synkey.dev",
  });

  for (const siteUrl of [
    "https://dutiful-toad-275.convex.site",
    "https://www.synkey.dev",
    "https://preview.vercel.app",
    undefined,
  ]) {
    expect(() =>
      resolveAuthPolicy({
        appEnvironment: "production",
        convexSiteUrl: "https://dutiful-toad-275.convex.site",
        siteUrl,
      }),
    ).toThrow("AUTH_ORIGIN_INVALID");
  }
});

test("local authentication accepts the fixed localhost origin and rejects IP or wildcard hosts", () => {
  expect(
    resolveAuthPolicy({
      appEnvironment: "development",
      convexSiteUrl: "https://quixotic-hound-287.convex.site",
      siteUrl: "http://localhost:5173",
    }),
  ).toEqual({
    appOrigin: "http://localhost:5173",
  });

  for (const siteUrl of ["http://127.0.0.1:5173", "http://localhost:*", "http://localhost:3000"]) {
    expect(() =>
      resolveAuthPolicy({
        appEnvironment: "development",
        convexSiteUrl: "https://quixotic-hound-287.convex.site",
        siteUrl,
      }),
    ).toThrow("AUTH_ORIGIN_INVALID");
  }
  expect(() =>
    resolveAuthPolicy({
      appEnvironment: "production",
      convexSiteUrl: "https://dutiful-toad-275.convex.site",
      siteUrl: "http://localhost:5173",
    }),
  ).toThrow("AUTH_ORIGIN_INVALID");
});

test("the owner allowlist is normalized from a non-empty JSON array", () => {
  expect(parseAllowedEmails('["Owner@Example.com", " recovery@example.com "]')).toEqual(
    new Set(["owner@example.com", "recovery@example.com"]),
  );
  expect(() => parseAllowedEmails("[]")).toThrow("AUTH_ALLOWLIST_INVALID");
  expect(() => parseAllowedEmails('"owner@example.com"')).toThrow("AUTH_ALLOWLIST_INVALID");
});
