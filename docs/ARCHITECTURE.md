# Architecture

## Status

R3.0 application foundation, the R3.1 canonical academic spine, and the R3.2 narrow Safe Work durability core are implemented. Teaching, assessment, reporting, artifacts, backup/restore implementation, legacy migration, and full offline mode remain frozen-but-unimplemented.

## Target boundaries

```text
Browser
  React + Vite
    application/bootstrap
    presentation/components
    domain/academic types
    services/academic data access
    Safe Work recovery state: IndexedDB + Dexie
      Supabase browser client
        Auth + Data API / narrow RPCs
          PostgreSQL + RLS + constraints
            auth.users -> workspaces -> academic spine
            server canonical truth + applied-operation idempotency

Delivery: Cloudflare Workers Static Assets
```

Supabase is canonical operational truth. Cloudflare is delivery/glue, not the academic backend. Browser filtering is never the authorization boundary. Dexie is local recovery state, not a second academic database, replica, backup, or full-offline subsystem.

## Ownership boundary

`auth.users -> workspaces -> all protected academic records` is enforced below the UI. RLS derives the caller from `auth.uid()`. Workspace-aware composite foreign keys prevent cross-workspace parent/child and Student/Class pairings even if privileged or buggy code bypasses browser filtering.

The browser may use an owned workspace UUID as a query key after bootstrap, but possession or guessing of that UUID does not grant access.

## Workspace bootstrap

`bootstrap_personal_workspace()` is a narrowly scoped `SECURITY DEFINER` RPC with a fixed search path. It accepts no owner/workspace argument, derives ownership exclusively from `auth.uid()`, rejects anonymous callers, and upserts against a unique owner constraint. This makes first use, retries, and concurrent calls converge on the same workspace. No service-role credential is exposed to the browser.

## Browser privilege boundary

Only `VITE_SUPABASE_URL` and a Supabase publishable/anon key are accepted in client configuration. `VITE_*` values are public bundle inputs. Service-role/elevated credentials are forbidden.

## Auth baseline

The app restores the persisted Supabase session, subscribes to auth changes, supports conservative email/password sign-in, and supports logout. No custom role matrix, invites, collaboration, or account-management suite is present.

## Schema compatibility

`src/config/schema.ts` declares `r3.2-safe-work.1`. The authenticated app reads singleton `public.app_schema_version`. A mismatch fails closed before academic data access. Ordered migrations advance that row only after their schema, constraints, RLS, grants, indexes, and functions have been constructed.

## R3.2 Safe Work layer

Dexie wraps browser IndexedDB as temporary durable recovery state. UI state, local durable state, and server canonical state remain distinct. `PENDING_SAFE` is only observable after the local Dexie transaction commits.

The only R3.2 proof mutation is revision-checked Student rename. The sync worker automatically processes only `PENDING_SAFE`. `FAILED` and `CONFLICT` remain durable manual-recovery states and causally block later operations for the same entity. Startup and reconnect may resume pending work, but must not revive permanent failures.

The Student rename RPC derives ownership from `auth.uid()`, locks the Student row, checks expected revision, updates name/revision/updated_at and inserts `applied_operations` in the same PostgreSQL transaction. Stable `op_id` replay gives lost-ACK idempotency. Revision mismatch returns an explicit conflict; deterministic server error classes distinguish actual auth loss from permanent workspace/op-id/target failures. No service-role credential is exposed.

## Legacy

The Streamlit implementation is preserved under `legacy/streamlit/`. It is behavior/migration evidence only and must not be mechanically translated into React or treated as the R3 grade model.
