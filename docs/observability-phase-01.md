# Phase 01 observability compatibility matrix

This matrix separates implemented paths from deployment evidence. Learning and auth
content remains in Convex; telemetry is optional and cannot affect a canonical write.
At this implementation checkout, no PostHog public configuration keys are present,
so browser export and source-map reporting are disabled rather than claimed.

| Surface                  | Implemented boundary                                                                                      | Live evidence required before acceptance                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Browser completion       | One `learning_operation_completed` event after a durable receipt; fixed fields only                       | Configure the public key/host, complete a quest, and inspect one sampled event  |
| Browser errors           | A new sanitized error contains only class, operation ID, and redaction version                            | Trigger a synthetic safe release error and verify the uploaded source map       |
| Browser privacy          | Autocapture, pageview/pageleave capture, person profiles, persistence, and session recording are disabled | Inspect the loaded SDK configuration and sampled payloads                       |
| Convex                   | Durable `runs` receipt with operation ID and redaction version                                            | Correlate one run with the recent CLI/Dashboard request ID when exposed         |
| Managed Convex internals | No invented span, trace ID, log stream, or managed exception export                                       | Record request-ID availability; Pro-only streaming/export stays unavailable     |
| PostHog source maps      | Release is injected by `VITE_RELEASE`; public build emits no maps by default                              | Build and upload maps for the exact deployed release, then verify symbolication |

Durable completion and privacy-operation receipts are retained at 100% as product
truth. Deliberately captured sanitized app errors are initially retained at 100%.
Healthy diagnostics may be sampled only after measured volume justifies it. Managed
platform exceptions can exist only in recent platform logs on the Free floor.
