# Architecture

## Status

R3.0 application foundation, the R3.1 Academic Spine, the R3.2 narrow Safe Work durability core, and the remaining R3.1 canonical Teaching Core are implemented. Assessment/grading, Today/Continue, reporting, artifacts, backup/restore implementation, legacy migration, collaboration, AI, and full offline remain unimplemented.

## Target boundaries

```text
Browser / React + Vite
  domain + explicit services
  Safe Work recovery state: IndexedDB + Dexie
    Supabase browser client
      Auth + Data API / narrow RPCs
        PostgreSQL + RLS + constraints
          auth.users -> workspaces
            -> Academic Spine
            -> Teaching Core
          server canonical truth + applied-operation idempotency
Delivery: Cloudflare Workers Static Assets
```

Supabase is canonical operational truth. Cloudflare is delivery/glue, not the academic backend. Browser filtering is never authorization. Dexie is local recovery state, not a second academic database, replica, backup, or full-offline subsystem.

## Ownership boundary

`auth.users -> workspaces -> all protected academic records` is enforced below the UI. RLS derives the caller from `auth.uid()`. Workspace-aware composite foreign keys prevent cross-workspace parent/child composition even if privileged or buggy code bypasses browser filtering. The browser may use an owned workspace UUID as a query key after bootstrap, but possession of that UUID grants nothing.

## Workspace bootstrap and browser privilege

`bootstrap_personal_workspace()` is a narrow `SECURITY DEFINER` RPC with fixed search path, no owner/workspace argument, and ownership derived from `auth.uid()`. Unique owner identity makes retries/concurrency converge. Only `VITE_SUPABASE_URL` and a publishable/anon key belong in the browser; service-role/elevated credentials are forbidden.

## Auth baseline

Persisted Supabase sessions, auth-state subscription, conservative email/password sign-in and logout are implemented. No role matrix, invites, collaboration, or school administration exists.

## Schema compatibility

`src/config/schema.ts` declares `r3.1-teaching-core.1`. Authenticated startup reads singleton `app_schema_version` and fails closed on mismatch. Ordered migrations advance compatibility only after structure, constraints, RLS, grants and indexes exist. The identifier denotes the newly completed R3.1 Teaching Core while cumulatively including merged R3.2 Safe Work.

## Academic Spine

The implemented spine is Personal Workspace -> Academic Year -> Academic Period -> Class, plus workspace Student identity and explicit Enrollment. Student is not Enrollment. Class identity may recur across periods. Archive/lifecycle state is preferred to destructive deletion.

## R3.1 Teaching Core

The canonical graph is `Material -> Lesson -> LessonVersion` alongside actual `Class -> Meeting -> Checkpoint` and `Class -> Activity -> ActivityMeeting -> Meeting`.

Material is a stable teacher-owned concept. Lesson is a stable reusable teaching-unit identity; mutable canonical content is versioned in immutable-distinguishable LessonVersion rows. A new LessonVersion never replaces Lesson identity or rewrites prior versions.

Meeting represents an actual occurrence and is structurally separate from Lesson. A Meeting may be lessonless. When LessonVersion context exists, composite constraints require that version to belong to the same referenced Lesson and workspace. Recording a Meeting does not mutate LessonVersion.

Checkpoint is an ordered continuity record under Meeting; multiple checkpoints are valid and latest continuity is reconstructable. Activity is classroom work, not Assessment. ActivityMeeting is explicit many-to-many linkage, allowing one Activity to span multiple Meetings while requiring Activity and Meeting to share both workspace and Class.

## R3.2 Safe Work layer

Dexie wraps IndexedDB as temporary durable recovery state. UI state, local durable state and server canonical state remain distinct. `PENDING_SAFE` is observable only after local commit. Automatic sync processes only `PENDING_SAFE`; `FAILED` and `CONFLICT` remain durable manual-recovery states and causally block later same-entity operations.

The only Safe Work proof mutation remains revision-checked Student rename. Stable `op_id` replay handles lost ACK; deterministic server error classes distinguish auth loss from permanent workspace/op-id/target failures. Teaching Core does not broaden Safe Work mutations.

## Legacy

The Streamlit implementation under `legacy/streamlit/` remains behavior/migration evidence only and does not redefine the R3 model.
