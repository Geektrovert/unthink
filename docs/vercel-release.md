# Vercel production release

This runbook prepares the first Vercel release without treating a successful build
as live product acceptance. `https://synkey.dev` is the only user-facing production
origin. Convex remains the data, storage, scheduling, and authentication backend.

## Checked-in release boundary

- Vercel installs with the pinned Bun lockfile and builds the Vite app into `dist/`.
- Deep links fall back to `index.html` so every TanStack Router route can load directly.
- `/api/auth/*` is rewritten to the production Convex HTTP action origin without
  changing the address in the browser.
- The frontend uses the same relative auth path locally and in production. Vite
  supplies the local-only proxy from the ignored development environment.
- The Vercel deployment Git SHA becomes the telemetry release when no explicit
  release override is present.
- Vercel previews can prove installation, build output, and route rendering. Owner
  authentication intentionally remains closed on preview domains.

## Authorized live cutover order

Each numbered step mutates a live service and needs an exact target check immediately
before it runs.

1. Import the `Geektrovert/unthink` repository into the intended Vercel account, keep
   the repository root, and confirm the Vite framework settings detected from
   `vercel.json`.
2. Add the public frontend connection settings in Vercel by matching the ignored local
   configuration by key name. Do not copy server-only authentication settings into
   Vercel.
3. Create a preview deployment and verify the build, static assets, and direct loading
   of every application route. Treat preview sign-in rejection as intentional.
4. Add `synkey.dev` to the Vercel project and record the exact DNS records Vercel asks
   for without changing Cloudflare yet.
5. Prepare the matching production Convex release so its exact application origin is
   `https://synkey.dev`. Verify the personal team, project, deployment, row counts,
   Free-plan assumptions, and rollback artifact before deploying it.
6. Deploy the reviewed Convex and Vercel revisions, remove the old Cloudflare redirect,
   and replace the apex DNS records with Vercel's exact requested records. Keep the
   Cloudflare proxy disabled unless a later reviewed architecture explicitly adopts it.
7. Verify that `https://synkey.dev` stays in the address bar through sign-in, sign-out,
   refresh, and a direct deep link. Confirm that the old generated Convex site no longer
   serves or redirects the application.
8. Run the production owner recovery, one real quest, export, telemetry, and rollback
   checks. Only then label the release accepted.

If any auth or canonical-origin check fails during the cutover, restore the prior DNS
and frontend release together. Do not reopen cross-domain browser auth as a shortcut.
