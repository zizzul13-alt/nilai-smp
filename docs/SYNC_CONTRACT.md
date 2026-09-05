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

Rapid Correction is workflow identity only; it does not imply `CORRECTION`, `ORIGINAL`, `MAKEUP`, or `REMEDIAL` Attempt evidence. When no academic evidence kind is explicitly supplied, Rapid Correction queues `attempt_kind=NULL`, `raw_score=NULL`, and no Attempt evidence payload. The canonical Result may still be GRADED (including 0 or a negative score), MISSING, or EXCUSED. The server creates an `assessment_attempts` row only when an explicit AttemptKind is supplied.

Legacy durable Rapid Correction operations are normalized during the append-only Dexie v3 upgrade only when the old fabricated fingerprint (`assessment.judgement` + `attempt_kind=CORRECTION` + `evidence.source=rapid-correction`) is still `PENDING_SAFE` with `attempt_count=0`. Only the academic evidence fields are cleared; the same op_id, causal identity, revision expectation and durability metadata are preserved. A matching `PENDING_SAFE` row that has already been attempted is quarantined as `FAILED / LEGACY_ATTEMPT_KIND_UNCERTAIN` with its original payload and op_id unchanged, because the server may already have committed that exact payload. Existing FAILED/CONFLICT legacy rows are not guessed or rewritten. Generic Retry and local-as-new conflict recovery fail closed for uncertain legacy fabricated payloads; discard/use-server remain explicit safe exits.

## Safe Work drain and wakeups
Within one mounted application runtime, Safe Work uses one shared `SafeWorkSyncWorker` owned by `SignedIn`. Startup sync, reconnect sync, Teaching Continuity, and Rapid Correction all use that same worker instance. That worker maintains at most one active runner for each `(auth_user_id, workspace_id)` namespace. A same-namespace sync request that arrives while a runner is active joins the existing promise and marks a coalesced rerun request instead of being dropped or starting a parallel runner. Different namespaces keep independent runner state, so a busy workspace cannot swallow another workspace's wakeup.

After each pass, the runner checks for newly eligible durable `PENDING_SAFE` work. This lets work enqueued mid-flight, an explicitly retried FAILED operation, and causal successors exposed by a predecessor becoming Saved participate in the same overall coalesced run without requiring an unrelated later trigger. Per-causal-key blocking remains unchanged: an unsaved predecessor, FAILED row, or CONFLICT row prevents a later operation on the same causal key from leapfrogging it.

Retry suppression is deliberately narrow. Only an operation that returned a retryable network/auth result during the current overall sync run is deferred for the remainder of that run. It remains truthfully `PENDING_SAFE` and is not hammered by coalesced wakeups. FAILED and CONFLICT states continue to require explicit recovery; if a non-legacy FAILED operation is explicitly changed back to `PENDING_SAFE`, a sync request that joins an already-active runner may retry it in the follow-up drain. `LEGACY_ATTEMPT_KIND_UNCERTAIN` remains fail-closed and cannot be generically retried. Lost-ACK retries keep the original op_id and payload.

The single-runner guarantee is application-runtime scoped, not browser-global. Separate tabs/devices may each run their own worker; correctness across those runtimes relies on stable op_id plus server-side idempotency and canonical mutation contracts, not a cross-tab runner lock.

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
