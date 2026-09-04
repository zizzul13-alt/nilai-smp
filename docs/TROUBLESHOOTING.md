# Troubleshooting

## App shows “Konfigurasi belum siap”

Copy `.env.example` to `.env.local`, set the Supabase URL and publishable/anon key, then restart Vite. Never substitute a service-role key.

## Login fails

The UI surfaces the Supabase Auth error. Verify the configured project, account credentials, and project auth settings. The foundation intentionally does not implement signup/recovery/admin account management.

## “Database belum kompatibel”

Do not continue writing academic data. Verify that the ordered migrations under `supabase/migrations/` have been applied and that `app_schema_version` matches `src/config/schema.ts`. The current runtime expects `r3.1-teaching-core.1`.

Compatibility history is cumulative:

```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
```

The final R3.1-labelled Teaching Core migration is intentionally after R3.2 because it closes a previously missed R3.1 Academic Core residual. Do not roll the database back to `r3.2-safe-work.1`; the Teaching Core head includes and preserves the merged R3.2 Safe Work contract.

## Pending locally

`Pending locally` means the IndexedDB/Dexie transaction committed but server confirmation has not. Keep the browser profile/storage intact. Network or genuine authentication/session interruption is retryable; startup/reconnect can resume `PENDING_SAFE`. This is not full-offline mode.

## Needs attention / FAILED

The durable operation remains local. Inspect `last_error_code`; do not delete browser storage before recovery. `FAILED` is a permanent/manual-recovery state and is **not automatically retried** on startup or reconnect. Workspace integrity failure, op-id mismatch, target missing/not-owned, invalid operation, and other permanent server errors belong here. An explicit future recovery action is required to retry or otherwise resolve it.

## Conflict

The server revision changed after the edit began. R3.2 never silently overwrites it. `CONFLICT` remains durable, is not automatically retried, and causally blocks later operations for that entity until explicit user resolution. Automatic merge is out of scope.

## Authentication versus authorization failures

Do not infer auth expiry from generic SQLSTATE `42501`. Safe Work treats gateway/session auth failure (`PGRST301`) and the RPC's explicit no-auth SQLSTATE (`28000`) as retryable `AUTH_REQUIRED`. The RPC emits separate stable permanent classes for workspace integrity (`P3201`), op-id scope/payload mismatch (`P3202`), and target missing/not-owned (`P3203`).

## Logout with pending work

Do not clear IndexedDB. Warn that unsynced work remains on this browser, sign out normally, and ensure a different account cannot query or sync the prior namespace. No warning is needed when the current user has no unsynced local work.

## Build/typecheck fails

Use the committed lockfile to reproduce a clean dependency installation:

```bash
node --version
npm --version
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

Use Node 22 LTS first because CI verifies that baseline. If `npm ci` reports that `package.json` and `package-lock.json` disagree, do not bypass the lockfile; reconcile the dependency change through normal review.

## Legacy behavior differs

Inspect `legacy/streamlit/` as migration evidence, but do not patch R3 semantics to match legacy shortcuts without Governor review.
