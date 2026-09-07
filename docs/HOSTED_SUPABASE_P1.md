# P1 Hosted Supabase Truth — Operator Runbook

## Purpose

This runbook establishes `HOSTED_SCHEMA_TRUTH = PASS` for the first real Supabase production candidate. It does not authorize Cloudflare deployment or cutover.

Current compatibility baseline:

- schema compatibility: `r3.6-recovery.1`;
- expected repository migrations: 18;
- final migration: `202609070918_p1_authenticated_privilege_hardening.sql`;
- R3.7 remains schema-neutral.

The 18th migration exists because the real hosted verifier found unintended `authenticated` privileges inherited from the project's public-schema default ACLs. A first hosted apply also proved that application migrations cannot and should not mutate managed `supabase_admin` default privileges. Hosted ownership evidence showed every canonical Nilai SMP public table and all 25 Nilai SMP public functions are owned by `postgres`. P1 therefore binds default-ACL hardening to the proven application creator role and fails if canonical ownership drifts.

## Hard laws

- Remote schema changes come from committed migration files only.
- Never manually forge `public.app_schema_version`.
- Never use `supabase migration repair` to pretend an unapplied migration ran.
- Never use `supabase db reset --linked` on the production candidate.
- Never use `--include-seed` on the production candidate.
- Never edit a managed platform role merely to make an application verifier green.
- Browser configuration receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Secrets/service-role/database credentials stay outside Git and outside `VITE_*`.
- The P1 SQL verifier is read-only and fails closed.
- A Dashboard appearance is never evidence of schema/security truth.
- Do not rewrite hosted migration history to make provenance look prettier.

## Migration chain

The exact ordered chain is:

```text
202609030001_foundation_schema_version.sql
202609040001_academic_spine.sql
202609040002_safe_work_engine.sql
202609040003_teaching_core.sql
202609040004_assessment_core.sql
202609040005_rapid_correction_safe_writes.sql
202609040006_bulk_assessment.sql
202609050001_continuity_core.sql
202609050002_continuity_lifecycle_guard.sql
202609050003_continuity_write_boundary.sql
202609060001_today_reentry.sql
202609060002_pacing_final_torture.sql
202609060003_reporting_core.sql
202609060004_artifact_core.sql
202609060005_artifact_integrity_hardening.sql
202609060006_artifact_governor_repairs.sql
202609070001_recovery_portable_backup.sql
202609070918_p1_authenticated_privilege_hardening.sql
```

Supabase CLI normally records the repository migration timestamp as `schema_migrations.version`. Supabase MCP `apply_migration` may record an execution timestamp as `version` while preserving the full canonical repository identity in `name`. The verifier accepts only those two observed representations and still requires all 18 logical migrations in exact order. Never use migration repair merely to convert one legitimate representation into the other.

## Privilege model required by P1

The hosted project must prove:

- every ordinary `public` table has RLS enabled;
- `anon`/`PUBLIC` have no public-table grants;
- every canonical Nilai SMP table and function remains owned by `postgres`;
- `postgres` public table/sequence defaults do not auto-grant browser roles;
- `postgres` has an explicit GLOBAL function default overriding PostgreSQL's built-in PUBLIC EXECUTE, plus no public-schema browser EXECUTE default;
- managed `supabase_admin` defaults are not treated as Nilai SMP application defaults unless canonical ownership ever changes to that role, in which case P1 fails ownership proof first;
- `authenticated` has no `TRUNCATE`, `REFERENCES`, or `TRIGGER` on public tables;
- RPC-owned/read-only tables have no browser `INSERT/UPDATE/DELETE`;
- `lesson_versions` remains append-only (`SELECT`,`INSERT` only);
- `correction_sessions` remains workflow-mutable without browser `DELETE`;
- authenticated SECURITY DEFINER RPCs are intentional ownership-checked boundaries, while anon execution remains closed.

The privilege migration revokes broad browser capability and reconstructs only the intended authenticated table surface. It does not bump `app_schema_version`.

## Public-schema drift check

A linked CLI operator may use:

```bash
supabase migration list
supabase db push --dry-run
supabase db diff --linked --schema public
```

This is useful but **not sufficient** for P1. Storage, privileges, default ACLs, and ownership are verified separately by the committed hosted verifier.

## Run the hosted verifier

Use the committed file unchanged:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
```

The Supabase SQL editor or MCP `execute_sql` is an acceptable operator fallback for this committed read-only verifier. Do not transform it into a repair script.

Expected success includes:

```text
P1_HOSTED_TRUTH PASS
```

Any verifier exception means P1 is not passed.

## Advisors

After the final migration, run Supabase Security Advisor. Authenticated SECURITY DEFINER warnings may be intentional because those functions are the narrow ownership-checked mutation/read boundaries. Unresolved `ERROR` findings remain blockers.

## Evidence record

```text
P1_EXECUTED_AT=<timestamp with timezone>
GIT_SHA=<exact candidate SHA>
SCHEMA_EXPECTED=r3.6-recovery.1
SUPABASE_PROJECT_REF=<ref>
MIGRATION_COUNT=18
MIGRATION_PROVENANCE=<CLI_CANONICAL | MCP_EXECUTION_VERSION_CANONICAL_NAME>
CANONICAL_OBJECT_OWNER=postgres
MIGRATION_APPLY=<success>
HOSTED_VERIFIER=<PASS>
SECURITY_ADVISOR_ERROR_COUNT=0
MANUAL_SCHEMA_REPAIR=FALSE
MIGRATION_REPAIR_USED=FALSE
SEED_USED=FALSE
```

Do not publish credentials, student data, or private Storage object URLs.

## P1 exit gate

Set:

```text
HOSTED_SCHEMA_TRUTH = PASS
```

only if all 18 canonical migrations are represented in exact order, compatibility remains `r3.6-recovery.1`, canonical ownership is proven, the committed verifier passes on the real project, Security Advisor has no unresolved ERROR, and no manual schema/migration-history forgery or seed was used.

Otherwise P1 remains blocked and P2 is not authorized.
