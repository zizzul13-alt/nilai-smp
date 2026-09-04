# Architecture

## Status
R3.0 Foundation, R3.1 Academic Spine + Teaching Core, R3.2 Safe Work, R3.3 Assessment Core, and R3.3 Rapid Correction are implemented. Reporting/finalization, Today/Continue, artifacts, backup/restore implementation, legacy migration, collaboration, AI and full offline remain out of scope.

## Target boundaries
```text
Browser / React + Vite
  correction workflow + explicit academic services
  IndexedDB + Dexie Safe Work buffer
    Supabase browser client
      Auth + Data API + narrow RPCs
        PostgreSQL + RLS + constraints
          auth.users -> workspaces -> academic/teaching/assessment records
          correction_sessions (workflow progress only)
          applied_operations + canonical Result/Attempt
Delivery: Cloudflare Workers Static Assets
```
Supabase/PostgreSQL is canonical operational truth. Dexie is a temporary durable recovery buffer, not a second academic database, backup, or full-offline subsystem.

## Ownership and compatibility
`auth.users -> workspaces -> all protected records` remains the ownership root. RLS derives `auth.uid()` and workspace-aware FKs reject cross-workspace composition. Browser code receives no elevated credential. Compatibility is `r3.3-rapid-correction.1` and startup fails closed on mismatch.

## Frozen academic graph
Student != Enrollment. Material != Lesson. Lesson != Meeting. Activity != Assessment. Assessment != Result. Result != Attempt. Result is one current interpreted outcome per Assessment × Enrollment; Attempt is ordered preserved evidence. ScoringProfile config is immutable by identity. `UNCHECKED | GRADED | MISSING | EXCUSED` are explicit; only GRADED carries score. Zero and negative numeric values remain valid structurally.

## CorrectionSession
CorrectionSession is first-class teacher workflow progress with stable UUID, Assessment/Class ownership, active/completed lifecycle, timestamps and optional current Enrollment. It is not academic evidence. Browser close never completes it; completion is explicit and partial sessions are resumable.

## Rapid correction and Safe Work
Arbitrary physical paper order is supported by correction-local Student search and Enrollment identity; duplicate names remain legal. A judgement first commits an `assessment.judgement` operation to the current user/workspace Dexie namespace. Only after that transaction succeeds may UI say Pending Safe and advance to another paper.

The sync worker reuses R3.2 operation/idempotency concepts. Same-Result operations share a causal key and cannot leapfrog unresolved work; independent Results may proceed. `apply_assessment_judgement_operation()` revision-checks server truth and atomically performs Result update/insert + optional Attempt append + AppliedOperation ledger acceptance. Same op_id replay is idempotent. Stale revision is Conflict, never Last Write Wins.

FAILED/CONFLICT recovery remains deliberately workflow-local: identify affected Enrollment and local intention, compare with current server Result context, then explicit Retry or Discard/re-enter. Logout warns but preserves legitimate unsynced namespace work.

## Legacy
`legacy/streamlit/` remains migration evidence only and cannot redefine R3 canonical identities or semantics.
