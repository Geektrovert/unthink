const environment = process.env;

if (environment.VERCEL !== "1") process.exit(0);

const required = [
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "POSTHOG_PROJECT_ID",
  "VERCEL_GIT_COMMIT_SHA",
] as const;
const missing = required.filter((key) => !environment[key]);
if (missing.length > 0) {
  throw new Error(`POSTHOG_SOURCEMAP_ENV_MISSING:${missing.join(",")}`);
}

const host = new URL(environment.POSTHOG_HOST!);
if (host.protocol !== "https:" || host.origin !== environment.POSTHOG_HOST) {
  throw new Error("POSTHOG_SOURCEMAP_HOST_INVALID");
}

const release = environment.VERCEL_GIT_COMMIT_SHA!;
if (!/^[0-9a-f]{40}$/i.test(release)) {
  throw new Error("POSTHOG_SOURCEMAP_RELEASE_INVALID");
}

const upload = Bun.spawn(
  [
    "bunx",
    "posthog-cli",
    "--host",
    host.origin,
    "sourcemap",
    "process",
    "--directory",
    "dist",
    "--release-name",
    "unthink-web",
    "--release-version",
    release,
    "--delete-after",
  ],
  {
    env: {
      ...environment,
      POSTHOG_CLI_API_KEY: environment.POSTHOG_API_KEY!,
      POSTHOG_CLI_PROJECT_ID: environment.POSTHOG_PROJECT_ID!,
    },
    stderr: "inherit",
    stdout: "inherit",
  },
);

const exitCode = await upload.exited;
if (exitCode !== 0) throw new Error("POSTHOG_SOURCEMAP_UPLOAD_FAILED");
