# P4/P6 Real Cloudflare Execution Proof — 2026-09-08

## Scope

This evidence records the real external Cloudflare deployment and rollback proof for the frozen Nilai SMP production candidate.

- Exact candidate SHA: `75eafd6824a4ea07101fe1b1f1b04d8775d4c218`
- Schema compatibility: `r3.6-recovery.1`
- Worker: `nilai-smp`
- Public URL: `https://nilai-smp.z-izzul13.workers.dev`
- GitHub Actions run: `34211834912`
- Workflow repair commit: `a4d2fa56049e446f2f71907ba1704e1540ffed25`
- Evidence artifact ID: `10050136280`
- Evidence artifact SHA-256: `3bd61f0258b80d1c89f9f7e3de630ba2db913a48b0ffd063fedaea13d2b565ed`

The workflow checks out the exact frozen candidate SHA above. The workflow-only repair changes bounded readiness handling after the first real deploy revealed a transient immediate `404`; it does not modify the production candidate.

## Real execution result

`P4_P6_REAL_EXECUTION = PASS`

The successful run proved, in order:

1. Permanent Cloudflare GitHub Actions credential gate PASS.
2. Exact candidate preflight PASS.
3. Real V1 deployment PASS.
4. Root and deep-SPA HTTP smoke PASS.
5. Chromium public-shell smoke PASS.
6. Controlled V2 deployment PASS.
7. Controlled V2 smoke PASS.
8. Rollback to V1 PASS, with V1 restored to 100% traffic.
9. Root and deep-SPA HTTP smoke after rollback PASS.
10. Mobile-sized Chromium smoke after rollback PASS.

## Version evidence

- Known-good V1: `26202e0a-3bbd-4992-8695-9d1830ddf3ac`
- Controlled V2: `c5ba68a7-10f3-4b86-b019-01a2d78964ef`
- Rollback target: `26202e0a-3bbd-4992-8695-9d1830ddf3ac`
- Post-rollback active allocation: V1 at `100%`

The controlled V2 differed only by a nonfunctional deployment probe asset. Its purpose was to prove a distinct Cloudflare Worker version could be deployed and then rolled back to the exact known-good V1.

## Smoke evidence

V1 HTTP/deep-SPA smoke passed against the public Workers URL. Chromium then rendered both the root and a deep-SPA path without Vite development/source-path leakage.

The same HTTP/deep-SPA smoke passed for controlled V2. After rollback, the HTTP/deep-SPA smoke passed again and a mobile-sized Chromium session rendered the rollback deep path successfully.

## Bounded propagation repair

The first real execution deployed successfully but the first immediate smoke request returned `404`. This was treated as an external readiness condition rather than as evidence that the frozen candidate was defective.

The ops workflow was therefore repaired to retry V1, controlled V2, and post-rollback smoke checks in a bounded window: at most 12 attempts, separated by 5 seconds. The subsequent successful run became ready on the first smoke attempt for all three phases. No candidate application code or R3 semantics were changed.

## Claims intentionally not made

This proof does **not** close the remaining authenticated/recovery gates:

- `authenticated_daily_driver_smoke = NOT_CLAIMED`
- `P2_REAL_AUTH_RLS_STORAGE = NOT_CLAIMED`
- `P3_REAL_RECOVERY = NOT_CLAIMED`
- `PRODUCTION_CUTOVER = FALSE`

The public-shell browser smoke proves deployed static delivery and browser rendering only. It is not a substitute for a real signed-in Teacher session, private Storage byte roundtrip, or authenticated binary recovery proof.

## Gate update

- `REAL_CLOUDFLARE_DEPLOY = PASS`
- `CLOUDFLARE_CANDIDATE = PASS`
- `KNOWN_GOOD_ROLLBACK = PASS`
- `P5_PUBLIC_SHELL_DEPLOYED_SMOKE = PASS`
- `DEPLOYED_DAILY_DRIVER = NOT YET PASS`
- `P2_REAL_AUTH_RLS_STORAGE = NOT YET PASS`
- `P3_REAL_RECOVERY = NOT YET PASS`
- `PRODUCTION_CUTOVER = FALSE`
