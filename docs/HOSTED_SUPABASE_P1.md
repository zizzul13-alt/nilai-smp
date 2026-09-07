# P1 Hosted Supabase Truth — Operator Runbook

## Purpose

This runbook establishes `HOSTED_SCHEMA_TRUTH = PASS` for the first real Supabase production candidate.

It does **not** deploy Cloudflare, create real teacher data, prove cross-owner RLS behavior, or authorize cutover. Those belong to later P2+ gates.

Current compatibility baseline:

- schema compatibility: `r3.6-recovery.1`;
- expected repository migrations: 18;
- final migration: `202609070918_p1_authenticated_privilege_hardening.sql`;
- R3.7 remains schema-neutral.

The 18th migration was added after the real hosted verifier proved that the Supabase project default ACL had left unintended `authenticated` privileges on canonical tables. It changes privilege boundaries only; it does not change the application schema compatibility identity.

## Hard laws

- Remote schema changes come from committed migration files only.
- Never manually forge `public.app_schema_version`.
- Never use `supabase migration repair` to pretend an unapplied migration ran.
- Never use `supabase db reset --linked` on the production candidate.
- Never use `--include-seed` on the production candidate.
- Browser configuration receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase access tokens, database passwords and secret/service-role keys stay outside Git and outside `VITE_*`.
- The P1 SQL verifier is read-only and must be executed with `ON_ERROR_STOP` semantics.
- A Dashboard appearance is never evidence of schema/security truth.
- Do not rewrite hosted migration history to make provenance look prettier.

## 0. Freeze the exact candidate

Before touching hosted services:

```bash
git switch main
git pull --ff-only
git rev-parse HEAD
```

Record that exact SHA in the private P1 evidence. Never keep using a copied SHA after `main` advances.

## 1. Supabase CLI

Use a supported stable Supabase CLI and record its exact version.

```bash
supabase --version
```

or, if the project-local invocation is used:

```bash
npx supabase --version
```

Do not casually add/upgrade the CLI dependency during hosted execution. Toolchain changes belong in reviewed repository work.

## 2. Initialize/link only if needed

If the CLI requires local metadata:

```bash
supabase init
```

Then identify and link the intended production candidate explicitly:

```bash
supabase login
supabase projects list
supabase link --project-ref <PROJECT_REF>
supabase projects list
```

Record privately:

- project ref;
- project name;
- region;
- intended role: `production-candidate`.

Do not continue if project identity is ambiguous.

## 3. Migration preflight

Inspect history first:

```bash
supabase migration list
supabase db push --dry-run
```

Expected repository chain, in order:

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

Stop if ordering differs, a migration is missing, an unexplained remote migration exists, seed data is proposed, or a migration-repair command is suggested before the cause is understood.

### Provenance representation

Supabase CLI normally records the repository migration timestamp as `schema_migrations.version`. Supabase MCP `apply_migration` may instead record an execution timestamp as `version` while preserving the complete canonical repository migration identity in `name`.

The committed verifier accepts only these two observed representations and still requires all 18 logical migrations, exact canonical identities, and exact order. **Never use migration repair merely to convert one legitimate representation into the other.**

## 4. Apply the exact pending migration(s)

Only after preflight reconciliation:

```bash
supabase db push
```

Do not add `--include-seed`.

After success:

```bash
supabase migration list
supabase db push --dry-run
```

The second dry-run must report up to date. Migration history must represent the exact 18 canonical migrations without fabricated/repaired entries.

## 5. Public-schema drift check

```bash
supabase db diff --linked --schema public
```

Expected result: no unexplained application schema changes.

This is useful but **not sufficient** for P1. Supabase schema diffing has gaps, including Storage bucket changes and operational privilege/default-ACL truth, so the committed verifier remains authoritative.

Do not normalize surprise drift into a new migration until the cause is understood.

## 6. Privilege model required by P1

The hosted project must prove all of these:

- every ordinary `public` table has RLS enabled;
- `anon`/`PUBLIC` have no public-table grants;
- `authenticated` has no `TRUNCATE`, `REFERENCES`, or `TRIGGER` on canonical public tables;
- read-only/RPC-owned tables have no direct browser `INSERT/UPDATE/DELETE`;
- `lesson_versions` remains append-only (`SELECT`,`INSERT` only);
- `correction_sessions` remains workflow-mutable without browser `DELETE`;
- `postgres`/`supabase_admin` public default ACLs do not auto-grant future tables/sequences/functions to browser roles;
- authenticated `SECURITY DEFINER` RPCs remain intentional ownership-checked boundaries, while anon/PUBLIC execution stays closed.

The P1 privilege migration deliberately revokes broad defaults first and then reconstructs only the intended authenticated table capability. It does not bump `app_schema_version`.

## 7. Run the read-only hosted verifier

Use an operator PostgreSQL connection from the intended project:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
```

PowerShell:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
```

The verifier starts a read-only transaction and fails closed. It checks:

1. exact 18-migration provenance and order;
2. exact `public.app_schema_version = r3.6-recovery.1`;
3. RLS on every ordinary `public` table;
4. zero anonymous/PUBLIC public-table grants;
5. deny-by-default public ACLs for future browser objects;
6. zero anon execution on public SECURITY DEFINER functions;
7. bounded authenticated table privileges, including zero global `TRUNCATE/REFERENCES/TRIGGER`;
8. RPC/read-only/append-only direct-DML boundaries;
9. presence of Supabase Storage catalog;
10. private `artifact-files` bucket;
11. exact 20,000,000-byte file limit and MIME allow-list;
12. exact authenticated ownership-derived Artifact Storage INSERT/SELECT policies;
13. no authenticated Artifact Storage UPDATE/DELETE policy.

Expected success includes:

```text
P1_HOSTED_TRUTH PASS
```

Any verifier exception means P1 is **not passed**, even if the app loads or the Dashboard looks correct.

### If `psql` is unavailable

The Supabase SQL editor or an authenticated MCP `execute_sql` call may be used as an operator fallback **only for the committed read-only verifier**. Do not edit the verifier into a repair script. Preserve the complete result privately.

## 8. Advisors

After the final migration, run Supabase Security Advisor (and Performance Advisor when relevant).

Interpret results against architecture rather than mechanically changing intentional boundaries. For example, authenticated SECURITY DEFINER RPC warnings may be expected when the function itself checks `auth.uid()` and browser table mutation is deliberately denied. Security Advisor `ERROR` findings remain blockers until reconciled.

## 9. Evidence record

Create a private operator record containing at least:

```text
P1_EXECUTED_AT=<timestamp with timezone>
GIT_SHA=<exact candidate SHA>
SCHEMA_EXPECTED=r3.6-recovery.1
SUPABASE_PROJECT_REF=<ref>
SUPABASE_REGION=<region>
SUPABASE_CLI_VERSION=<version or MCP operator path>
MIGRATION_COUNT=18
MIGRATION_PROVENANCE=<CLI_CANONICAL | MCP_EXECUTION_VERSION_CANONICAL_NAME>
DRY_RUN_BEFORE=<reviewed exact pending chain or MCP equivalent evidence>
MIGRATION_APPLY=<success>
MIGRATION_LIST_AFTER=<exact chain>
DRY_RUN_AFTER=<up to date or MCP equivalent evidence>
PUBLIC_SCHEMA_DIFF=<empty/not-applicable with explanation>
HOSTED_VERIFIER=<PASS>
SECURITY_ADVISOR_ERROR_COUNT=0
MANUAL_SCHEMA_REPAIR=FALSE
MIGRATION_REPAIR_USED=FALSE
SEED_USED=FALSE
```

Do not place passwords, access tokens, secret/service-role keys, credential-bearing URLs, student data, or private Storage object URLs in public evidence.

## 10. P1 exit gate

Set:

```text
HOSTED_SCHEMA_TRUTH = PASS
```

only if **all** are true:

- exact project identity recorded;
- exact candidate SHA recorded;
- all 18 canonical migrations are represented in exact order;
- `r3.6-recovery.1` remains the runtime compatibility identity;
- committed hosted verifier passes against the real candidate;
- Security Advisor has no unresolved ERROR;
- no manual schema repair was used;
- no migration-history forgery/repair was used;
- no production seed was used.

Otherwise:

```text
HOSTED_SCHEMA_TRUTH = FAIL / BLOCKED
```

and P2 is not authorized.
