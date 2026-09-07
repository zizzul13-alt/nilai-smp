# P1 Hosted Supabase Truth — Operator Runbook

## Purpose

This runbook establishes `HOSTED_SCHEMA_TRUTH = PASS` for the first real Supabase production candidate.

It does **not** deploy Cloudflare, create real teacher data, prove cross-owner RLS behavior, or authorize cutover. Those belong to later P2+ gates.

Current candidate baseline:

- repository main at P1 start: `49141183f7e1b77dc7f6f4cf240afeeebd7ba788`;
- schema compatibility: `r3.6-recovery.1`;
- expected repository migrations: 17, ending at `202609070001_recovery_portable_backup.sql`.

## Hard laws

- Remote schema changes come from committed migration files only.
- Never manually forge `public.app_schema_version`.
- Never use `supabase migration repair` to pretend an unapplied migration ran.
- Never use `supabase db reset --linked` on the production candidate.
- Never use `--include-seed` on the production candidate.
- Browser configuration receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase access tokens, database passwords and secret/service-role keys stay outside Git and outside `VITE_*`.
- The P1 SQL verifier is read-only and must be executed with `ON_ERROR_STOP` semantics.

## 0. Freeze the exact candidate

Before touching hosted services:

```bash
git switch main
git pull --ff-only
git rev-parse HEAD
```

Expected for this P1 package before any later main change:

```text
49141183f7e1b77dc7f6f4cf240afeeebd7ba788
```

If `main` has advanced, stop using this SHA as evidence. Reconcile the new exact main first.

## 1. Supabase CLI

Use a supported stable Supabase CLI. Record the exact version in the P1 evidence report.

Official Supabase guidance supports either:

- project-local npm installation, invoked with `npx supabase ...`; or
- a supported global installation such as Scoop on Windows.

Do not add or upgrade the CLI dependency casually during the hosted execution itself. Toolchain changes belong in a reviewed repository package.

Verify:

```bash
supabase --version
```

or, for a project-local CLI:

```bash
npx supabase --version
```

The examples below use `supabase`. Substitute `npx supabase` consistently if that is the installed form.

## 2. Initialize local CLI metadata only if needed

The repository intentionally entered P1 without a fabricated `supabase/config.toml`.

If the CLI requires initialization:

```bash
supabase init
```

This creates local-development configuration. Do **not** treat generated local defaults as proof of hosted configuration and do not commit them during the live P1 operation merely because they exist.

`supabase link` writes local link state beneath `supabase/.temp/`; that state is machine-specific evidence plumbing, not repository truth.

## 3. Authenticate and identify the exact project

```bash
supabase login
supabase projects list
```

Record, outside public logs:

- project ref;
- project name;
- region;
- intended role: `production-candidate`.

Do not continue if there is any ambiguity about which project is the intended candidate.

## 4. Link explicitly

```bash
supabase link --project-ref <PROJECT_REF>
```

Use the database password only through the CLI prompt/native credential path or an operator-only environment variable. Do not put it in `.env.local`, Git, a shell-history command line, or any `VITE_*` variable.

After linking, confirm the selected project again:

```bash
supabase projects list
```

## 5. Migration preflight

First inspect migration history:

```bash
supabase migration list
```

For a fresh candidate project, there should be no Nilai SMP application migrations remotely before the first push.

Then run the mandatory dry run:

```bash
supabase db push --dry-run
```

Expected pending repository chain, in order:

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
```

Stop if:

- ordering differs;
- an unexpected remote migration exists;
- a repository migration is missing;
- CLI suggests migration repair before the cause is understood;
- dry-run wants seed data;
- the linked project is not the intended candidate.

## 6. Apply the migration chain

Only after the dry-run is reconciled:

```bash
supabase db push
```

Do not add `--include-seed`.

After successful push:

```bash
supabase migration list
supabase db push --dry-run
```

The second dry-run must report the linked project up to date.

Migration history must show the exact 17 Nilai SMP migration versions and no fabricated/repaired entries.

## 7. Public-schema drift check

Run a linked diff against repository migrations:

```bash
supabase db diff --linked --schema public
```

Expected result: no application schema changes.

This is useful but **not sufficient** for P1. Supabase CLI documentation explicitly notes that schema diffing has known gaps, including Storage bucket changes. Therefore Storage truth is verified separately below.

Do not save a surprise remote diff into a new migration and normalize it away during P1. A surprise diff is drift evidence and must be explained first.

## 8. Run the read-only hosted verifier

Use an operator PostgreSQL connection string from the intended Supabase project. Keep it in the current shell/process environment only.

Example:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
```

PowerShell example:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/verification/p1_hosted_truth.sql
```

The verifier starts a read-only transaction and fails closed if any required P1 invariant is missing.

It checks:

1. exact 17-version `supabase_migrations.schema_migrations` history;
2. exact `public.app_schema_version = r3.6-recovery.1`;
3. every ordinary `public` table has RLS enabled;
4. `anon` has no `public` table grants;
5. authenticated direct DML is absent on canonical tables intentionally routed through narrow operations;
6. `storage.buckets` and `storage.objects` exist;
7. `artifact-files` exists and is private;
8. `artifact-files.file_size_limit = 20000000`;
9. MIME allow-list is exactly PDF, DOCX, and `application/octet-stream`;
10. exactly one authenticated owner INSERT policy and one owner SELECT policy exist for Artifact Storage;
11. no matching authenticated Artifact Storage UPDATE/DELETE policy exists.

Expected success includes:

```text
P1_HOSTED_TRUTH PASS
```

A verifier exception means P1 is **not** passed even if the Dashboard looks correct.

### If `psql` is unavailable

A read-only execution through the Supabase SQL editor may be used only as an operator fallback. Paste the committed verifier file unchanged; do not edit it into a repair script. Preserve the complete result as private P1 evidence.

Installing/standardizing a repository-local CLI/psql toolchain can be a later bounded tooling package; it must not be improvised into browser dependencies.

## 9. Evidence record

Create a private operator record containing at least:

```text
P1_EXECUTED_AT=<timestamp with timezone>
GIT_SHA=<exact candidate SHA>
SCHEMA_EXPECTED=r3.6-recovery.1
SUPABASE_PROJECT_REF=<ref>
SUPABASE_REGION=<region>
SUPABASE_CLI_VERSION=<version>
MIGRATION_COUNT=17
DRY_RUN_BEFORE=<reviewed exact pending chain>
DB_PUSH=<success>
MIGRATION_LIST_AFTER=<exact chain>
DRY_RUN_AFTER=<up to date>
PUBLIC_SCHEMA_DIFF=<empty>
HOSTED_VERIFIER=<PASS>
MANUAL_SCHEMA_REPAIR=FALSE
MIGRATION_REPAIR_USED=FALSE
SEED_USED=FALSE
```

Do not place:

- database passwords;
- access tokens;
- secret/service-role keys;
- connection strings containing credentials;
- student data;
- private Storage object URLs

in the evidence report.

## 10. P1 exit gate

Set:

```text
HOSTED_SCHEMA_TRUTH = PASS
```

only if **all** are true:

- correct project identity recorded;
- exact candidate SHA recorded;
- dry-run reviewed before mutation;
- 17 migrations applied in exact order;
- second dry-run reports up to date;
- public schema drift check is empty;
- committed hosted verifier passes;
- no manual schema repair was required;
- no migration-history forgery/repair was used;
- no production seed was used.

Otherwise:

```text
HOSTED_SCHEMA_TRUTH = FAIL / BLOCKED
```

and P2 is not authorized.
