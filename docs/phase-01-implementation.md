# Phase 01 implementation record

Status: **implemented locally, acceptance pending**.

This record describes the checked-in product boundary. It is not evidence that the
development deployment, production deployment, or five-quest owner pilot passed.

## Route contracts

| Route                                           | Contract                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/auth/sign-in`                                 | Generic owner sign-in and supervised, configuration-gated bootstrap                                  |
| `/onboarding/:step`                             | Promise, goals, supports, reward display, and calibration with persisted resume                      |
| `/today`                                        | Returns or prepares one owner-local daily quest, then resizes the same identity                      |
| `/quest/:questId`                               | Fixed Retrieve → Make → Connect → Feedback → Proof workspace with Rescue shortening                  |
| `/proofs` and `/proofs/:proofId`                | Private evidence list/detail, signed file access, reward receipt, selected deletion                  |
| `/rewards`                                      | Two source-controlled deterministic unlocks with append-only redemption receipts                     |
| `/settings/{learning,rewards,security,privacy}` | Editable learning/reward preferences, sessions, export, deletion, and the closure compatibility gate |

Every route except sign-in is guarded by the Convex-authenticated session. Convex
functions derive the actor from the authenticated token identifier and re-check
ownership for object IDs.

## Canonical tables

- `profiles`: one owner profile, onboarding position, preferences, and calibration.
- `quests` and `questAttempts`: one quest per owner/day plus bounded drafts and exact position.
- `evidence`: immutable text, reference, or private-file proof and memory capsule.
- `pendingUploads`: owner/quest-bound file reservations with scheduled orphan cleanup.
- `rewardLedger` and `rewardRedemptions`: append-only awards and deterministic unlock receipts.
- `runs`: durable redacted completion receipts keyed by application operation ID.
- `privacyOperations`: versioned, idempotent export/deletion/closure receipts and reconciliation state.

The Phase 01 schema replaced the provisional empty `learners`/`quests` model only
after both development tables were rechecked as empty. If another deployment has
rows, it requires an expand/backfill/contract migration rather than applying that
empty-data assumption.

## Implemented evidence boundary

- Offline Vitest projects cover pure policy/redaction and authenticated Convex workflows.
- Completion writes evidence, reward rows, terminal quest state, and a run receipt in one mutation.
- Privacy operations require a server-signed session creation time no older than five minutes.
- Browser telemetry is opt-in, fixed-schema, content-free, and cannot fail a canonical completion.
- File proof bytes use a server-owned, owner/quest-bound action capped at 900 KB. The raw signed-upload
  URL seam is deliberately not public because Convex cannot discover and clean a blob when a browser
  disappears between raw upload and finalization; the bounded action deletes failed writes itself.
- No model provider, private plugin, MCP/OAuth surface, schedule, or Phase 02 renderer is present.

## Acceptance still required

- One authorized development-cloud sync and authenticated browser journey.
- Owner bootstrap followed immediately by bootstrap closure; real recovery/session checks.
- Live Better Auth account-deletion compatibility and an owner-approved closure dry run that stops
  before destructive confirmation.
- Optional PostHog event/error/source-map verification only if PostHog is configured for the pilot.
- Exact production Convex Free deployment/origin, rollback artifact, usage headroom, hard-cap and
  ambiguous-write exercises, DNS redirect checks, and an external verified production export.
- Five real quests across three families, one non-code proof, delayed recall, resume observations,
  deterministic redemption, and the owner's usefulness/pressure rating.

No Phase 02 work may begin from automated checks alone.
