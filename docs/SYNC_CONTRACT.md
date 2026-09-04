# Sync Contract

## R3.3 Rapid Correction status
Safe Work now supports two narrow operation kinds: the R3.2 Student rename proof and `assessment.judgement`. This remains **not full offline mode**. PostgreSQL is long-term canonical truth; Dexie is a temporary durable recovery buffer.

## Truth law
`TRANSIENT -> successful IndexedDB transaction -> PENDING_SAFE -> server synchronization -> SAVED`.

Pending Safe is truthful only after the Dexie transaction commits. A Dexie failure remains transient/error and must never be labelled Pending Safe. `FAILED` and `CONFLICT` are durable manual-recovery states; only `PENDING_SAFE` auto-syncs.

## Academic operation
`assessment.judgement` carries stable `op_id`, Assessment + Enrollment identity, explicit Result state/score, optional Attempt evidence, and `expected_revision`. The server RPC `apply_assessment_judgement_operation()` atomically accepts the AppliedOperation, updates/inserts the current Result, and optionally appends Attempt evidence. A lost ACK retried with the same op_id replays the prior success and cannot duplicate Attempt evidence.

## Ordering and conflicts
The local causal key is `assessment_result:<assessment_id>:<enrollment_id>`. An unresolved retryable/FAILED/CONFLICT operation blocks later operations for that Result while independent Results may continue. Result revisions are monotonic. Stale expected revision returns CONFLICT and never overwrites server truth. No Last Write Wins exists.

## Recovery
FAILED/CONFLICT remain visible near correction with affected Enrollment, local intended state/score and server Result context when available. Retry explicitly returns an operation to Pending Safe. Discard explicitly removes the local intention and leaves canonical server truth untouched.

## Namespace/privacy
Operations are scoped by `auth_user_id + workspace_id`; foreign namespaces are never queried into the active correction workflow. Logout warns when unsynced work exists and does not silently delete it. No auth secret is stored in Dexie.

## Deterministic classes
`PGRST301`/`28000` are retryable auth; `PGRST000`/offline are retryable network; P3202 is permanent op-id mismatch; P3401/P3402/P3403 are permanent workspace/Assessment/Enrollment integrity failures; `22023` is invalid operation; revision mismatch is explicit CONFLICT.
