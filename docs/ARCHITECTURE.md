# Architecture

## Status

R3.0 foundation is implemented. Later product domains remain frozen-but-unimplemented.

## Target boundaries

```text
Browser
  React + Vite
    application/bootstrap
    presentation/components
    domain/features (added only when authorized)
    services/data access
      Supabase browser client
        Auth + Data API + Storage
          PostgreSQL + RLS + constraints

Delivery: Cloudflare Workers Static Assets
Later local durability: IndexedDB + Dexie Pending Safe (not implemented in R3.0)
```

Supabase is canonical operational truth. Cloudflare is delivery/glue, not the academic backend. Browser authorization must ultimately be enforced by RLS/database constraints, not hidden controls.

## Browser privilege boundary

Only `VITE_SUPABASE_URL` and a Supabase publishable/anon key are accepted in client configuration. `VITE_*` values are public bundle inputs. Service-role/elevated credentials are forbidden.

## Auth baseline

The app restores the persisted Supabase session, subscribes to auth changes, supports conservative email/password sign-in, and supports logout. No custom role matrix, invites, collaboration, or account-management suite is present.

## Schema compatibility

`src/config/schema.ts` declares the frontend's expected version. The authenticated app reads singleton `public.app_schema_version`. A mismatch fails closed before the placeholder workspace is exposed. Migrations are the only intended writers of this version row.

This is a compatibility foundation, not a migration orchestrator.

## Legacy

The Streamlit implementation is preserved under `legacy/streamlit/`. It is behavior evidence only and must not be mechanically translated into React.
