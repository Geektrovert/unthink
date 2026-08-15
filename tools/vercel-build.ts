const environment = process.env;
const productionRelease = environment.VERCEL === "1" && environment.VERCEL_ENV === "production";

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    env: environment,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`RELEASE_COMMAND_FAILED:${command[1] ?? command[0]}`);
}

if (!productionRelease) {
  await run(["bun", "run", "build"]);
  process.exit(0);
}

const missing = ["CONVEX_DEPLOY_KEY", "VERCEL_GIT_COMMIT_SHA"].filter((key) => !environment[key]);
if (missing.length > 0) throw new Error(`VERCEL_RELEASE_ENV_MISSING:${missing.join(",")}`);

const release = environment.VERCEL_GIT_COMMIT_SHA!;
if (!/^[0-9a-f]{40}$/i.test(release)) throw new Error("VERCEL_RELEASE_SHA_INVALID");

await run([
  "bunx",
  "convex",
  "deploy",
  "--typecheck",
  "enable",
  "--typecheck-components",
  "--cmd-url-env-var-name",
  "VITE_CONVEX_URL",
  "--cmd",
  "bun run build",
  "--message",
  `Deploy ${release}`,
]);

await run(["bunx", "convex", "env", "set", "APP_RELEASE", release]);
