# Sync Contract

## R3.2 status
Safe Work core is implemented for one proof mutation: Student rename. This is **not full offline mode**.

## Canonical laws
- Server database remains canonical academic truth.
- UI State != Local Durable State != Server Canonical State.
- Local durability is recovery state, not a second academic database, replica, backup, or provider-owned truth.
- Provider != Data Ownership.
- `PENDING SAFE` must never be claimed before durable IndexedDB commit.
- `0 != blank`; Missing != 0; workflow state and score remain separate future-domain concerns.

## Truth states
- `TRANSIENT`: UI memory only; may be lost. Never call it safe.
- `PENDING SAFE`: the operation transaction has committed to IndexedDB/Dexie; server acceptance is not confirmed. This is the **only** state eligible for automatic worker processing.
- `SAVED`: server confirmed canonical acceptance (including idempotent replay of an already-applied `op_id`).
- `FAILED`: attention is required. Durable work remains local and automatic startup/reconnect sync must not retry it.
- `CONFLICT`: expected revision was stale. Server data is not overwritten; automatic retry/merge is forbidden.

Flow: `TRANSIENT -> durable local commit -> PENDING SAFE -> server -> SAVED`, with `FAILED`/`CONFLICT` explicit durable manual-recovery states.

## Queue privacy
Operations are keyed and queried by `auth_user_id + workspace_id`. The worker receives the current authenticated namespace and refuses cross-namespace processing. No token, password, service-role key, or auth secret belongs in queue payload. Student rename stores only the target ID, new display name, expected revision and operational metadata.

Logout/account switch must preserve unsynced work while hiding it from another namespace. UI should warn before logout only when the current user has unsynced work. Successful server confirmation deletes the local operation payload.

## Idempotency and lost ACK
Every retry reuses the stable `op_id`. `applied_operations.op_id` is the canonical uniqueness boundary. The Student rename RPC checks a prior operation before applying business mutation and rechecks after row locking for concurrent retry safety. A lost response followed by retry returns prior-success semantics and does not rename/increment twice. Reusing an `op_id` with altered scope/payload is a permanent failure.

## Ordering/retry
The worker processes creation order. Only `PENDING_SAFE` can call the server automatically. A retryable network/auth interruption remains `PENDING_SAFE` and blocks later operations for that entity during the sync pass. `FAILED` and `CONFLICT` remain durable, are skipped by automatic sync, and causally block later pending operations for the same entity until explicit recovery/resolution. Independent entities remain architecturally parallelizable. Startup and browser `online` events may resume pending work; there is no high-frequency polling.

## Deterministic server/client classification
- Actual gateway/session auth loss (`PGRST301`) or RPC no-auth identity (`28000`) -> retryable `AUTH_REQUIRED` -> remain `PENDING_SAFE`.
- Network/unreachable (`PGRST000` or browser offline) -> retryable `NETWORK` -> remain `PENDING_SAFE`.
- Workspace integrity (`P3201`) -> permanent `FAILED`.
- `op_id` scope/payload mismatch (`P3202`) -> permanent `FAILED`.
- Target missing/not owned (`P3203`) -> permanent `FAILED`.
- Invalid operation (`22023`) -> permanent `FAILED`.
- Revision mismatch -> explicit `CONFLICT` result, not an exception and never silent overwrite.
- Generic SQLSTATE `42501` is **not** treated as authentication expiry.
