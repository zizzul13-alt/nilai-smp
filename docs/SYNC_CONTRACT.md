# Sync Contract

## Rapid Correction
Rapid Correction continues the R3.2 truth law: `TRANSIENT -> durable IndexedDB transaction -> PENDING_SAFE -> server -> SAVED`. Pending Safe is truthful only after Dexie commit. `assessment.judgement` has per-Result causal ordering, idempotent op_id replay and explicit revision Conflict recovery.

## Bulk Entry / Excel Import
Bulk Import has deliberately stronger and simpler semantics and does **not** use the Safe Work queue:

```text
local parse/edit -> Preview -> Validate -> online atomic Commit -> server ACK -> Saved
```

Preview is not Commit. Parsed spreadsheet state may be lost before Commit and is not labelled Pending Safe. Commit requires connectivity. `apply_assessment_bulk_operation()` accepts one stable batch op_id and one Assessment batch; PostgreSQL either commits every intended academic mutation plus its ledger record or commits none.

## Revision/conflict
Each preview row carries the current canonical Result revision, or 0 when no Result exists. The RPC serializes each logical Assessment × Enrollment key, checks all revisions before mutation, and if any is stale returns batch `conflict` with canonical enrollment/revision/state/score snapshots. No row is silently overwritten and no partial batch is accepted. Teacher refreshes Preview and explicitly creates a new batch.

## Idempotency
Lost ACK + retry of the same op_id and exact payload replays the saved summary without duplicate Result/Attempt effects. Same op_id with changed Assessment/payload fails closed with P3202. Filename is never operation identity.

## Namespace/privacy
Server derives caller/workspace from auth. Template/import identity must resolve inside the selected Assessment class/workspace. Rapid Dexie namespaces remain `auth_user_id + workspace_id`; bulk import adds no secrets or spreadsheet payloads to Dexie.
