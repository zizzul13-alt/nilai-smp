# Sync Contract

## R3.2 status
Safe Work core is implemented for one proof mutation: Student rename. This is **not full offline mode**.

## Truth states
- `TRANSIENT`: UI memory only; may be lost. Never call it safe.
- `PENDING SAFE`: the operation transaction has committed to IndexedDB/Dexie; server acceptance is not confirmed.
- `SAVED`: server confirmed canonical acceptance (including idempotent replay of an already-applied `op_id`).
- `FAILED`: attention is required; durable work is retained unless server save was confirmed.
- `CONFLICT`: expected revision was stale. Server data is not overwritten.

Flow: `TRANSIENT -> durable local commit -> PENDING SAFE -> server -> SAVED`, with `FAILED`/`CONFLICT` explicit.

## Queue privacy
Operations are keyed and queried by `auth_user_id + workspace_id`. The worker receives the current authenticated namespace and refuses cross-namespace processing. No token, password, service-role key, or auth secret belongs in queue payload. Student rename stores only the target ID, new display name, expected revision and operational metadata.

Logout/account switch must preserve unsynced work while hiding it from another namespace. UI should warn before logout only when the current namespace has unsynced work. Successful server confirmation deletes the local operation payload.

## Idempotency and lost ACK
Every retry reuses the stable `op_id`. `applied_operations.op_id` is the canonical uniqueness boundary. The Student rename RPC checks a prior operation before applying business mutation. A lost response followed by retry returns prior-success semantics and does not rename/increment twice.

## Ordering/retry
The worker processes creation order and blocks later operations for an entity after retryable failure, permanent failure, or conflict. Independent entities remain architecturally parallelizable. Startup and browser `online` events may trigger retry; there is no high-frequency polling.
