# Architecture

## Status

R3.0 application foundation and the R3.1 canonical academic spine are implemented. Teaching, assessment, offline Pending Safe, sync, reporting, artifacts, backup/restore implementation, and legacy migration remain frozen-but-unimplemented.

## Target boundaries

```text
Browser
  React + Vite
    application/bootstrap
    presentation/components
    domain/academic types
    services/academic data access
      Supabase browser client
        Auth + Data API
          PostgreSQL + RLS + constraints
            auth.users -> workspaces -> academic spine

Delivery: Cloudflare Workers Static Assets
Later local durability: IndexedDB + Dexie Pending Safe (not implemented)
```

Supabase is canonical operational truth. Cloudflare is delivery/glue, not the academic backend. Browser filtering is never the authorization boundary.

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

`src/config/schema.ts` declares `r3.1-academic-spine.1`. The authenticated app reads singleton `public.app_schema_version`. A mismatch fails closed before academic data access. The R3.1 migration advances that row only after the canonical schema, constraints, RLS, grants, indexes, and bootstrap function have been constructed.

## Legacy

The Streamlit implementation is preserved under `legacy/streamlit/`. It is behavior/migration evidence only and must not be mechanically translated into React or treated as the R3 grade model.
