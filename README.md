# Unthink

An ADHD-informed learning/growth management system that evolves itself with user's necessity.

## Stack

- Bun, Vite, React, TanStack Router, React Compiler
- Tailwind CSS with Base UI primitives
- Convex for durable data, auth integration, schedules, and private storage
- Vercel for the Vite application served at `unthink.vercel.app`
- TypeScript 7 with type-aware Oxlint and Oxfmt

The production floor is ordinary Convex Free plus Vercel's free tier. Vercel serves
the application directly at `https://unthink.vercel.app` and forwards same-origin
`/api/auth/*` requests to the Convex HTTP boundary. The browser never navigates to a
generated Convex site URL. Cloudflare has no production role.

## Commands

```sh
bun install
bun run dev
bun run dev:convex
bun run test
bun run check
```

`bun run setup` is scaffold-only and must not be run in this configured repository;
it creates a new Convex project.

The fast suite uses the exact compatible `vitest`, `convex-test`, and
`@edge-runtime/vm` tuple. Vitest keeps pure deterministic policies in a normal
runtime project and authenticated Convex workflows in an edge-runtime project;
both run offline through `bun run test`. This is the smallest harness that tests
Convex transactions and authentication without a live deployment or a second
backend.

`vercel.json` contains the production Vite build, SPA fallback, and auth forwarding
boundary. Vercel's Git integration creates the frontend release; the Convex backend
is released separately so each live change can be verified and rolled back on its
own. See [the Vercel release runbook](docs/vercel-release.md) for the cutover order.
See [the observability contract](docs/observability.md) for the redacted PostHog
event lifecycle, stage sources, and release environment names.

For Zed, install its official **TypeScript Language Server** extension; the project
settings select its `typescript-ls` server and pin it to the repository's TypeScript
version. VS Code will recommend the corresponding native TypeScript preview.

Phase 01 implements a fail-closed owner bootstrap and password recovery path. The
live browser ceremony and production-origin verification remain acceptance gates;
the bootstrap flag must never stay enabled after the one allowed owner is created.
