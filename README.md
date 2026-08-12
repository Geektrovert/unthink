# Unthink

An ADHD-informed learning/growth management system that evolves itself with user's necessity.

## Stack

- Bun, Vite, React, TanStack Router, React Compiler
- Tailwind CSS with Base UI primitives
- Convex for data, auth integration, schedules, storage, and static hosting
- TypeScript 7 with type-aware Oxlint and Oxfmt

The production floor is ordinary Convex Free. Static hosting serves the app at its
generated `https://<deployment>.convex.site` URL. Cloudflare may redirect
`synkey.dev` to that canonical origin; no Cloudflare runtime or Convex Pro feature is
required.

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

`bun run deploy` builds the SPA, deploys Convex, and uploads `dist/` through
`@convex-dev/static-hosting`.

For Zed, install its official **TypeScript Language Server** extension; the project
settings select its `typescript-ls` server and pin it to the repository's TypeScript
version. VS Code will recommend the corresponding native TypeScript preview.

Phase 01 implements a fail-closed owner bootstrap and password recovery path. The
live browser ceremony and production-origin verification remain acceptance gates;
the bootstrap flag must never stay enabled after the one allowed owner is created.

