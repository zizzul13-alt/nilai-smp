# Sync Contract

## Teaching Continuity Checkpoint
Teaching Continuity extends the existing R3.2 Safe Work truth law with one narrow append-only operation:

```text
TRANSIENT
-> durable IndexedDB transaction
-> PENDING_SAFE
-> apply_meeting_checkpoint_operation()
-> server ACK
-> SAVED
```

`STOPPED AT` is validated before enqueue. Pending Safe is truthful only after the Dexie transaction commits. `NEXT STEP` is normalized to NULL when blank. The local operation keeps one stable op_id across reconnect/auth/network retries. A lost acknowledgement therefore replays the same server operation instead of appending a duplicate Checkpoint.

Checkpoint causal ordering is per Meeting. The server serializes the Meeting checkpoint stream and assigns deterministic `sequence_no=max+1`. Multiple queued checkpoints for the same Meeting sync in local creation order. A checkpoint may only be appended while the canonical Meeting remains `in_progress`; completed/cancelled Meeting history is not silently rewritten.

On reload, the app reads both canonical continuity and Pending Safe/Failed local checkpoint operations. Local durable context is visible as recovery data until server confirmation. The UI never calls React state Saved. Complete/Cancel is disabled while the current Meeting still has unsynced checkpoint work.

## Meeting lifecycle
Start/Complete/Cancel are online canonical operations, not bulk offline work. Start uses one client operation id across an uncertain retry, while the database also serializes by Workspace × Class and enforces one active Meeting. Even a different duplicate Start operation reuses the existing `in_progress` Meeting instead of creating another actual occurrence.

Complete/Cancel are explicit. Browser close, reload, navigation, component unmount and logout have no lifecycle side effect. Lost-ACK lifecycle retries use the same prepared operation id in the current UI attempt; canonical state remains authoritative after re-entry.

## Rapid Correction
Rapid Correction continues the R3.2 truth law: `TRANSIENT -> durable IndexedDB transaction -> PENDING_SAFE -> server -> SAVED`. Pending Safe is truthful only after Dexie commit. `assessment.judgement` has per-Result causal ordering, idempotent op_id replay and explicit revision Conflict recovery.

## Bulk Entry / Excel Import
Bulk Import has deliberately stronger and simpler semantics and does **not** use the Safe Work queue:

```text
local parse/edit -> Preview -> Validate -> online atomic Commit -> server ACK -> Saved
```

Preview is not Commit. Parsed spreadsheet state may be lost before Commit and is not labelled Pending Safe. Commit requires connectivity. `apply_assessment_bulk_operation()` accepts one stable batch op_id and one Assessment batch; PostgreSQL either commits every intended academic mutation plus its ledger record or commits none.

## Revision/conflict
Each bulk preview row carries the current canonical Result revision, or 0 when no Result exists. The RPC serializes each logical Assessment × Enrollment key, checks all revisions before mutation, and if any is stale returns batch `conflict` with canonical enrollment/revision/state/score snapshots. No row is silently overwritten and no partial batch is accepted. Teacher refreshes Preview and explicitly creates a new batch.

## Idempotency
Lost ACK + retry of the same op_id and exact payload replays the saved result without duplicate semantic effects. Same op_id with changed scope/payload fails closed. Filename, browser session and component identity are never operation identity.

## Namespace/privacy
Server derives caller/workspace from auth. Teaching/Class/Meeting/Lesson identity must resolve in the caller-owned workspace. Safe Work namespaces remain `auth_user_id + workspace_id`; no service-role secret is stored in browser state.
