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
bun run setup # once, for a new Convex project
bun run dev
bun run dev:convex
bun run check
```

`bun run deploy` builds the SPA, deploys Convex, and uploads `dist/` through
`@convex-dev/static-hosting`.

For Zed, install its official **TypeScript Language Server** extension; the project
settings select its `typescript-ls` server and pin it to the repository's TypeScript
version. VS Code will recommend the corresponding native TypeScript preview.

The genesis scaffold deliberately enables no sign-in method and trusts only the
canonical Convex site origin. Phase 1 must prove an owner-controlled, verified
bootstrap, allowlist, and recovery path before enabling authentication or a local
auth origin.
