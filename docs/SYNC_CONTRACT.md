# Sync Contract

## R3.2 status
Safe Work core remains implemented for one proof mutation: Student rename. This is **not full offline mode** and R3.3 does not broaden the Dexie queue.

## Canonical laws
- Server database remains canonical academic truth.
- UI State != Local Durable State != Server Canonical State.
- `PENDING SAFE` must never be claimed before durable IndexedDB commit.
- `0 != blank`; Missing != 0; workflow state != score.
- Assessment Result is current interpreted truth; Attempt is preserved raw evidence/history.

## Safe Work truth states
`TRANSIENT -> durable local commit -> PENDING_SAFE -> server -> SAVED`, with FAILED/CONFLICT explicit durable manual-recovery states. Only `PENDING_SAFE` auto-syncs. Namespace isolation, stable op-id replay, deterministic error classification, causal blocking, and Student revision semantics remain unchanged.

## R3.3 Assessment write boundary

Assessment Core is server-canonical first. ScoringProfile/Assessment use ordinary RLS-protected server writes. Result and Attempt tables expose SELECT but no direct authenticated INSERT/UPDATE/DELETE. A narrow `record_assessment_judgement()` SECURITY DEFINER RPC derives ownership from `auth.uid()`, validates Assessment × Enrollment Class consistency, updates/creates the one current Result, and optionally appends Attempt evidence inside one PostgreSQL transaction.

This prevents application code from intentionally issuing independent `Attempt saved` / `Result failed` browser writes. A PostgreSQL function error rolls back the whole statement/transaction. The RPC is **not** registered as a Safe Work operation, does not use IndexedDB, and must not be labelled Pending Safe. Future rapid-correction durability/idempotency may extend the established architecture only under a separate governed package.

## Existing Safe Work deterministic classification
- `PGRST301` / `28000` -> retryable auth
- `PGRST000` / offline -> retryable network
- `P3201` workspace integrity -> permanent
- `P3202` op-id mismatch -> permanent
- `P3203` target missing/not-owned -> permanent
- `22023` invalid operation -> permanent
- revision mismatch -> explicit CONFLICT

R3.3 RPC domain errors are server-canonical errors, not Safe Work queue classifications.
