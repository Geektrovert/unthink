# Unthink

Unthink is an open-source, ADHD-informed learning system. It helps a learner make
small daily progress, retain what they learn, recover after missed days, and improve
the system from evidence instead of guilt.

## Product invariants

### Keep the loop humane

- Optimize for starting, finishing, and returning—not time spent in the app.
- A missed day is recovery input, not failure. Never punish broken streaks.
- Rewards acknowledge useful behavior; they do not create manipulative scarcity.
- Product language may be ADHD-informed, but must not claim diagnosis or treatment.

### Keep private data private

- The product is owner-only by default. Derive ownership from verified auth state,
  never from a client-supplied learner ID.
- Convex is the durable source of truth for learning state, rewards, and decisions.
- PostHog and telemetry receive redacted operational facts, not private learning text.
- Read only environment-variable names during diagnostics. Never print secret values.

### Keep the system small

Ambitious ideas are welcome; machinery must earn its place. Find the real constraint,
then implement the smallest model that makes correct behavior unsurprising. Apply
YAGNI aggressively, delete dead paths, and prefer a complete tracer bullet over a
framework for hypothetical work.

## Working agreement

1. Inspect the relevant code, configs, and current git state before editing.
2. Preserve user changes and keep the patch scoped to the request.
3. Keep shell, editor, and browser actions inside this repository unless the task
   explicitly requires another target. Open workspaces by exact path.
4. Follow the narrowest applicable specification. Do not copy private planning or
   research artifacts into the repository.
5. Add behavior through an existing seam when one is deep enough; create a new seam
   only when it removes real complexity.
6. Verify the smallest meaningful behavior during implementation, then run the
   appropriate repository gates once before handoff.
7. Report what is proven locally and what still needs a deployed or browser check.

Track development processes you start and stop only those exact processes. Avoid
broad name- or path-based process termination on a shared machine.

Do not commit, push, deploy, create a Convex project, or mutate GitHub unless the user
explicitly asks. For authorized GitHub work, use `gh` only with the `Geektrovert`
profile; verify the active profile before every GitHub operation.

## Architecture

- `src/` is a client-rendered Vite + React application using TanStack Router and the
  React Compiler.
- `src/styles.css` owns foundational tokens. `src/ui/` owns reusable primitives.
  Build product surfaces from these shared foundations so visual iteration stays
  centralized.
- Use Tailwind CSS for composition and Base UI for accessible primitives. Do not add
  shadcn or a second component system.
- `convex/` owns durable data, auth integration, server operations, storage, and HTTP
  boundaries.
- Top-level `convex/*.ts` modules are Convex framework adapters: registered functions,
  schema, auth, HTTP, and component configuration. Keep reusable business rules and
  external-call adapters in focused nested modules.
- `convex/_generated/` is generated output. Regenerate it; never hand-edit it.
- Vercel hosts the Vite SPA at the canonical `https://unthink.vercel.app` origin. Its only
  backend routing responsibility is the exact `/api/auth/*` external rewrite to the
  Convex HTTP action boundary plus the SPA fallback. Do not add Vercel Functions or a
  second backend without a separate product requirement.
- Cloudflare has no production role. Cloudflare DNS, redirects, proxying, Workers,
  Pages, runtime packages, and Wrangler are outside the architecture. The generated
  `https://<deployment>.convex.site` origin is backend transport only and must never
  become a user-facing navigation target.
- Ordinary Convex Free and Vercel's free tier are the production floor. Required
  behavior cannot depend on paid custom-domain features, log streams, managed
  exception forwarding, periodic backups, or OSS sponsorship.

## TypeScript

- Keep reusable business rules as plain deterministic TypeScript functions. Convex
  functions own backend execution; React and TanStack Router own client execution.
- Use native platform and Convex primitives for async work, validation, actions,
  workflows, retries, scheduling, rate limits, transactions, and observability.
- Convex `v` validators are authoritative for function arguments, returns, and stored
  documents. Validate untrusted external responses once at their adapter boundary.
- TypeScript 7, type-aware Oxlint through `oxlint-tsgolint`, and Oxfmt are the language
  toolchain. Keep editor diagnostics aligned with the repository scripts.
- Exact dependency pins are intentional. Do not change versions or add packages as a
  drive-by cleanup.
- Bun's automatic peer installation is disabled in `bunfig.toml`. Declare every
  required peer explicitly with an exact pin instead of accepting optional peer trees.

## Convex and auth

- Read `convex/_generated/ai/guidelines.md` completely before editing anything in
  `convex/`.
- Prefer a native Convex primitive. Admit a component only for a concrete requirement
  it solves more deeply, with an exact pin, source/license review, clear data owner,
  upgrade and removal path, and support for the repository's verification boundary.
- Treat the Components directory as discovery, not a trust signal. Review the current
  package source and maintainer before admission; do not install a component merely
  because it is listed there.
- Keep product authorization in app-owned functions before crossing a component
  boundary. The dedicated Better Auth component may own authentication mechanics; no
  component becomes canonical truth for quests, evidence, rewards, or governed
  decisions unless the product model explicitly assigns it that role.
- Public Convex functions require argument and return validators. Keep internal
  operations internal and use indexed queries instead of in-memory filtering.
- Authenticate first, derive the owner from the verified identity, then perform an
  owner-scoped lookup. Cross-owner identifiers should behave as not found.
- Better Auth browser sessions and future MCP bearer tokens are separate security
  boundaries. Never authorize an MCP request with a browser cookie.
- `bun run setup` creates and configures a new Convex project. Once a deployment is
  configured, use `bun run dev:convex`; do not rerun setup.
- Better Auth accepts only the exact application origin for the active environment:
  `http://localhost:5173` in development and `https://unthink.vercel.app` in production.
  Vite and Vercel forward `/api/auth/*` from that same origin to Convex, so browser
  sessions never depend on cross-domain storage. Vercel preview origins and direct
  browser access to the Convex HTTP origin remain fail-closed. Trusted origins and
  future WebAuthn relying-party settings use exact origins/hostnames, never a
  wildcard.
- Treat Free limits as failure boundaries: use bounded indexed work, inspect deployment
  usage at release gates, preserve committed truth on quota errors, and take a manual
  export before risky data changes.
- Deployment, environment changes, migrations, deletion, and production data writes
  require explicit authorization and a read-only identity/scope check first.

## Agentic boundary

The application does not own model-provider API keys. When agentic work is in scope,
Codex runs the model under the owner's existing subscription and reaches Unthink only
through narrow, owner-authenticated, stateless MCP tools. Convex validates and commits
submitted data; Codex never becomes the source of truth.

Codex's external task control plane owns agent wakeups and scheduled execution.
Convex stores desired preferences and canonical decisions; the website must not claim
it created, paused, or removed a Codex task unless that state was actually verified.

Keep tool contracts enumerated and capability-specific. Do not add generic dispatch,
arbitrary repository tools, stateful MCP sessions, or unrequested MCP extensions.
Record model usage or cost only when Codex supplies authoritative metadata.

## UI quality

- Make the next useful action obvious and reachable without negotiating a dashboard.
- Keep motion purposeful, interruptible, and inexpensive. Respect reduced motion.
- Preserve keyboard access, visible focus, semantic HTML, and Base UI behavior.
- Design every async surface for loading, empty, error, success, retry, and recovery.
- Prefer CSS and SVG for interface visuals. Add image assets only when the product
  genuinely needs them.
- Use `emil-design-eng` when building or reviewing user-facing components,
  interactions, and motion. Apply its animation decision framework first: decide
  whether motion helps, then tune purpose, easing, duration, performance, and
  accessibility.
- Use `interface-craft` for systematic visual critique, readable multi-stage animation
  storyboards, or live tuning with DialKit. Load only its matching critique,
  storyboard, dial, or timeline branch; keep DialKit authoring controls out of the
  production surface.

## Agentic operational skills

Skill bodies use progressive disclosure. Match the task against available skill
descriptions, then read only the selected `SKILL.md` completely before acting. Load
only the references that skill routes to; never preload `.agents/skills/**` or import
skill bodies into `AGENTS.md`/`CLAUDE.md`.

Use `ask-matt` when the correct Matt Pocock workflow is unclear. Read
`docs/agentic-operational-skills.md` only when choosing or chaining skills across his
full operational tree.

## Testing and verification

- Test behavior through public boundaries and user-visible outcomes. Avoid tests that
  merely restate implementation details.
- Prefer deterministic fixtures, real domain code, and minimal mocking. Never wait on
  arbitrary sleeps when a receipt or observable state can prove completion.
- Convex behavior should use `convex-test` with authenticated success, unauthenticated,
  cross-owner, validation, and idempotency paths where relevant.
- Run focused tests and typechecking while working. Before handoff, run the relevant
  scripts from `package.json`; use `bun run check` when the full repository gate is
  proportionate to the change.
- Browser, deployed-auth, passkey, schedule, and telemetry-ingestion checks are
  separate acceptance evidence. Do not claim them from unit tests.
- If a gate already fails, show the exact pre-existing failure and prove the patch did
  not add another one.

## Completion checklist

- The requested behavior is complete, including its reverse/recovery path.
- Auth, privacy, and ownership boundaries are explicit.
- No unused dependency, abstraction, route, schema field, or compatibility layer was
  introduced.
- Relevant tests and static checks pass, or remaining failures are reported precisely.
- User-visible behavior and contributor workflows are documented when they changed.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
