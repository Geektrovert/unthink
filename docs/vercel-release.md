# Vercel production release

This runbook prepares the first Vercel release without treating a successful build
as live product acceptance. `https://unthink.vercel.app` is the only user-facing
production origin. Convex remains the data, storage, scheduling, and authentication
backend.

## Checked-in release boundary

- Vercel installs with the pinned Bun lockfile and builds the Vite app into `dist/`.
- Deep links fall back to `index.html` so every TanStack Router route can load directly.
- `/api/auth/*` is rewritten to the production Convex HTTP action origin without
  changing the address in the browser.
- The frontend uses the same relative auth path locally and in production. Vite
  supplies the local-only proxy from the ignored development environment.
- The Vercel deployment Git SHA becomes the telemetry release when no explicit
  release override is present.
- A production build uses a sensitive deploy key for the existing Convex production
  deployment. It builds against that exact backend URL, deploys the backend, then
  records the same Git SHA as the backend release.
- Vercel previews can prove installation, build output, and route rendering. Owner
  authentication intentionally remains closed on preview domains, and previews never
  deploy Convex.

## Authorized live cutover order

Each numbered step mutates a live service and needs an exact target check immediately
before it runs.

1. Import the `Geektrovert/unthink` repository into the intended Vercel account, keep
   the repository root, and confirm the Vite framework settings detected from
   `vercel.json`.
2. Add the public frontend connection settings in Vercel by matching the ignored local
   configuration by key name. Create a deploy key for the exact existing Convex
   production deployment and pipe it directly into Vercel as the Sensitive,
   Production-only `CONVEX_DEPLOY_KEY`. Do not display it or copy server-only
   authentication settings into Vercel.
3. Create a preview deployment and verify the build, static assets, and direct loading
   of every application route. Treat preview sign-in rejection as intentional.
4. Confirm that the Vercel project owns the exact production alias
   `https://unthink.vercel.app`; no custom-domain or DNS configuration is part of the
   release.
5. Verify that the existing production Convex deployment's exact application origin is
   `https://unthink.vercel.app`. Verify the personal team, project, deployment, row counts,
   Free-plan assumptions, and rollback artifact before release.
6. Publish the reviewed revision. Vercel runs the coordinated Convex deployment and
   frontend build; a failed frontend build does not deploy Convex, while a failure after
   the backend deploy requires an explicit coordinated rollback. Cloudflare is not part
   of this release path.
7. Verify that `https://unthink.vercel.app` stays in the address bar through sign-in,
   sign-out, refresh, and a direct deep link. Confirm that the generated Convex site is
   used only by Vercel's hidden `/api/auth/*` rewrite and never becomes a browser destination.
8. Run the production owner recovery, one real quest, export, telemetry, and rollback
   checks. Only then label the release accepted.

If any auth or canonical-origin check fails during the cutover, roll back the frontend
and Convex releases together. Do not reopen cross-domain browser auth as a shortcut.
