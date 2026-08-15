# Observability contract

Unthink uses PostHog for a small set of privacy-safe product events and unexpected
error reports. Convex remains the source of truth. Telemetry may describe that an
operation happened; it must never contain the learner's goals, answers, drafts,
proof text, capsule text, reference URLs, files, email address, or display name.

## One journey across browser and backend

Every instrumented user action receives one journey ID. The browser sends one
terminal observation and Convex sends one committed result using that same ID as
both `operation_id` and `trace_id`. PostHog can therefore show the browser and
backend hops together without reconstructing a story from unrelated log lines.

The framework-free contract in `shared/telemetry-contract.ts` owns every journey's
event name, operation name, route template, ID format, stage vocabulary, schema
version, and PostHog de-duplication ID. Frontend and backend adapters derive those
values from the shared journey name; call sites do not repeat them.

The shared fields are bounded operational facts: stage, release, service and hop,
outcome, duration, durable-receipt state, idempotent-replay state, and finite product
dimensions such as quest family or proof kind. The final browser and Convex
exporters reject events that do not match the allowlisted shape.

Expected validation failures remain product states. Unexpected exceptions are
reduced to a safe error class and fixed message before export. Browser stack frames
retain only application asset locations so uploaded source maps can recover useful
source lines without exporting private content.

## Stage and release sources

The browser derives stage from Vercel's built-in `VITE_VERCEL_ENV`:

- `production` becomes `production`.
- `preview` becomes `staging`.
- `development` becomes `development`.
- a normal local Vite run becomes `local`; tests become `test`.

The browser release is Vercel's `VITE_VERCEL_GIT_COMMIT_SHA`. Convex uses the
deployment's existing `APP_ENVIRONMENT` and optional `APP_RELEASE`. The production
Vercel release command deploys the backend and then sets `APP_RELEASE` to the same
Git SHA. Vercel variables are not otherwise visible inside Convex.

## Environment names

Vercel browser runtime and build:

- `VITE_CONVEX_URL`
- `VITE_POSTHOG_KEY` — the ordinary PostHog project token
- `VITE_POSTHOG_HOST`
- `POSTHOG_API_KEY` — build-only personal key scoped to error-tracking write access
- `POSTHOG_PROJECT_ID`
- `POSTHOG_HOST`
- `CONVEX_DEPLOY_KEY` — Sensitive, Production only, and scoped to the existing
  production deployment

Vercel supplies `VITE_VERCEL_ENV`, `VITE_VERCEL_GIT_COMMIT_SHA`, `VERCEL`, and
`VERCEL_GIT_COMMIT_SHA` as system environment variables. None should be copied into
application configuration.

Convex deployment:

- `POSTHOG_PROJECT_TOKEN` — the same project token as `VITE_POSTHOG_KEY`
- `POSTHOG_HOST`
- `APP_ENVIRONMENT`
- `APP_RELEASE`

No PostHog personal API key is required in Convex because Unthink does not use the
component's local feature-flag synchronization.

## Source maps

Vite 8 continues to build with Rolldown. On a Vercel build, Vite produces hidden
source maps, then the official `@posthog/cli` processes the completed `dist`
directory, associates symbols with `unthink-web` and the Vercel Git SHA, uploads
them, removes the map files, and strips map references. Missing build credentials
fail the Vercel build; ordinary local builds neither generate nor upload maps.

## Component ownership and removal

The backend adapter uses the official MIT-licensed `@posthog/convex` package pinned
to an exact version. The component owns only its delivery queue and optional feature
flag cache; it does not own learning or reward data. Upgrade by reviewing the pinned
package source and release notes, changing the exact version, regenerating Convex
bindings, and rerunning the full checks. Remove it by deleting the component mount
and adapter, removing its dependency and environment declarations, regenerating
bindings, and confirming product writes still succeed without telemetry.

Live ingestion, exception grouping, source-map symbolication, stage labels, and the
two-hop journey view are deployment acceptance checks. Local tests prove only the
contract and fail-closed redaction behavior.
