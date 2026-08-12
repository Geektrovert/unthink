/// <reference types="vite/client" />
/// <reference types="node" />

import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createAuthBoundary() {
  const backend = convexTest(schema, modules);
  betterAuthTest.register(backend);
  return backend;
}

async function withAuthEnvironment(run: () => Promise<void>) {
  const previous = {
    AUTH_ALLOWED_EMAILS: process.env.AUTH_ALLOWED_EMAILS,
    APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
    AUTH_BOOTSTRAP_ENABLED: process.env.AUTH_BOOTSTRAP_ENABLED,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
    SITE_URL: process.env.SITE_URL,
  };
  Object.assign(process.env, {
    AUTH_ALLOWED_EMAILS: '["owner@example.com"]',
    APP_ENVIRONMENT: "development",
    AUTH_BOOTSTRAP_ENABLED: "true",
    BETTER_AUTH_SECRET: "test-only-secret-that-is-longer-than-thirty-two-characters",
    CONVEX_SITE_URL: "https://unthink-test.convex.site",
    SITE_URL: "http://localhost:5173",
  });
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function authRequest(body: Record<string, string>, cookie = "") {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "Better-Auth-Cookie": cookie,
      Origin: "http://localhost:5173",
    },
    method: "POST",
  } satisfies RequestInit;
}

test("the supervised owner bootstrap signs in and closes without revealing the allowlist", async () => {
  await withAuthEnvironment(async () => {
    const backend = createAuthBoundary();
    const unknown = await backend.fetch(
      "/api/auth/sign-up/email",
      authRequest({
        email: "unknown@example.com",
        name: "Owner",
        password: "correct-horse-battery-staple",
      }),
    );
    expect(unknown.status).toBeGreaterThanOrEqual(400);

    const created = await backend.fetch(
      "/api/auth/sign-up/email",
      authRequest({
        email: "OWNER@example.com",
        name: "Owner",
        password: "correct-horse-battery-staple",
      }),
    );
    expect(created.status).toBe(200);

    process.env.AUTH_BOOTSTRAP_ENABLED = "false";
    const closed = await backend.fetch(
      "/api/auth/sign-up/email",
      authRequest({
        email: "owner@example.com",
        name: "Owner",
        password: "different-secure-password",
      }),
    );
    expect(closed.status).toBeGreaterThanOrEqual(400);

    const signedIn = await backend.fetch(
      "/api/auth/sign-in/email",
      authRequest({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    );
    expect(signedIn.status).toBe(200);
    const sessionCookie = signedIn.headers.get("set-better-auth-cookie") ?? "";
    expect(sessionCookie).toContain("session_token");

    const session = await backend.fetch("/api/auth/get-session", {
      headers: { "Better-Auth-Cookie": sessionCookie, Origin: "http://localhost:5173" },
    });
    expect(session.status).toBe(200);
    expect((await session.json())?.session).toBeTruthy();

    const recoverySignIn = await backend.fetch(
      "/api/auth/sign-in/email",
      authRequest({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    );
    expect(recoverySignIn.status).toBe(200);
    const recoveryCookie = recoverySignIn.headers.get("set-better-auth-cookie") ?? "";
    const revoked = await backend.fetch(
      "/api/auth/revoke-other-sessions",
      authRequest({}, recoveryCookie),
    );
    expect(revoked.status).toBe(200);
    const revokedSession = await backend.fetch("/api/auth/get-session", {
      headers: { "Better-Auth-Cookie": sessionCookie, Origin: "http://localhost:5173" },
    });
    expect(await revokedSession.json()).toBeNull();
    const recoverySession = await backend.fetch("/api/auth/get-session", {
      headers: { "Better-Auth-Cookie": recoveryCookie, Origin: "http://localhost:5173" },
    });
    expect((await recoverySession.json())?.session).toBeTruthy();

    const signedOut = await backend.fetch("/api/auth/sign-out", authRequest({}, recoveryCookie));
    expect(signedOut.status).toBe(200);
    const endedSession = await backend.fetch("/api/auth/get-session", {
      headers: { "Better-Auth-Cookie": recoveryCookie, Origin: "http://localhost:5173" },
    });
    expect(await endedSession.json()).toBeNull();

    process.env.AUTH_ALLOWED_EMAILS = '["replacement@example.com"]';
    const expectedDenialLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const removedFromAllowlist = await backend.fetch(
      "/api/auth/sign-in/email",
      authRequest({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
    );
    expect(removedFromAllowlist.status).toBeGreaterThanOrEqual(400);
    expect(expectedDenialLog).toHaveBeenCalled();
    expectedDenialLog.mockRestore();
    process.env.AUTH_ALLOWED_EMAILS = '["owner@example.com"]';

    const forbiddenOrigin = await backend.fetch("/api/auth/sign-in/email", {
      ...authRequest({
        email: "owner@example.com",
        password: "correct-horse-battery-staple",
      }),
      headers: {
        ...authRequest({}).headers,
        Origin: "https://synkey.dev",
      },
    });
    expect(forbiddenOrigin.headers.get("access-control-allow-origin")).not.toBe(
      "https://synkey.dev",
    );
  });
});
