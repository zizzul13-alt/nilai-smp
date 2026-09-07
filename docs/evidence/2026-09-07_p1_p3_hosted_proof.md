# Nilai SMP — Hosted P1 / P3 Evidence Record

Date: 2026-09-07

This record captures real hosted evidence established after R3 closure. It does not authorize production cutover.

## Repository candidate

- Repository: `zizzul13-alt/nilai-smp`
- P1 ACL repair PR: #35
- Accepted PR head: `284db4af4f59b6cd4c027de05763e2a2b1120fb2`
- Exact-head CI: run #302 — SUCCESS
- Merge commit: `3273dd79956d2c323a2e43b55e7c426f831df337`
- Exact-main CI: run #303 — SUCCESS
- Full gate covered typecheck, 138 unit/static contracts, PostgreSQL RLS/constraint contracts, production build, Chromium, source-instrumented E2E, and production-artifact E2E.

## Hosted projects used

Source / production-candidate data project:

- project ref: `ifnnmmilurqtvvxywrlo`
- project name: `nilai rampor`
- hosted status observed: ACTIVE_HEALTHY

Recovery-drill target:

- project ref: `pnfhmsfvylhilzbkrjrm`
- hosted status observed: ACTIVE_HEALTHY

No database password, service-role key, access token, private object URL, or student data is recorded here.

## P1 hosted schema truth

The additive repair migration is:

`202609071405_p1_existing_function_acl_hardening.sql`

It closes inherited `PUBLIC`/`anon`/`authenticated` EXECUTE on the pre-hardening trigger helper `public.reject_scoring_profile_config_rewrite()` without changing compatibility identity.

After merge and exact-main CI, migration #19 was applied to both hosted projects.

Both hosted projects then proved:

- migration ledger = 19 logical migrations in exact repository order;
- migration names are unique;
- `app_schema_version = r3.6-recovery.1`;
- expected public canonical tables remain RLS protected;
- `anon`/`PUBLIC` have no public-table grants;
- canonical functions expose no anonymous/PUBLIC EXECUTE;
- authenticated table privileges remain bounded;
- private `artifact-files` bucket remains private with 20 MB limit;
- exact owner-derived Storage INSERT and SELECT policies remain present;
- no browser Storage UPDATE/DELETE policy exists;
- the trigger-helper anonymous EXECUTE count is zero.

Result:

`HOSTED_SCHEMA_TRUTH = PASS`

## Security Advisor state

Security Advisor was rerun after the DDL repair.

No unresolved Advisor `ERROR` finding was observed.

Remaining Advisor warnings/info include managed/environmental or intentional conditions such as:

- `pg_net` extension placement in `public`;
- authenticated SECURITY DEFINER RPC warnings for deliberately authenticated, ownership-checked canonical boundaries;
- leaked-password protection disabled;
- legacy source tables with RLS enabled but no policy.

These warnings are not treated as evidence that browser bypass exists. The committed hosted verifier remains the fail-closed application boundary proof.

## Cross-project canonical recovery drill

A synthetic recovery fixture was created on the source project. It is test-only and contains no real student data.

A portable canonical manifest was exported and restored into the recovery target.

First restore result:

- restored canonical rows: 17;
- `replayed = false`.

Post-restore proof established:

- stable academic/domain UUIDs preserved;
- personal workspace ownership remapped to the recovery target owner;
- actor/creator ownership remapped;
- graded Result score 88 preserved;
- no Assessment Attempt was fabricated (`attempts = 0`);
- Artifact current-version identity preserved;
- restored ArtifactObject metadata is `PENDING_UPLOAD`;
- restored ArtifactObject path is rewritten to target workspace scope;
- replay of the same restore operation returns `replayed = true`;
- a new restore operation against the non-empty target fails closed with `P3701`;
- source fixture remains unchanged after the target restore.

A post-migration-#19 re-audit reconfirmed the source and target fixture semantics above.

Result:

`CANONICAL_DB_RECOVERY = PASS`

## Real HTTP evidence established

Sandbox DNS could not reach the Supabase project API directly, so the hosted database `pg_net` extension was used only as an external transport probe.

The recovery target successfully reached its real GoTrue/Auth endpoint:

- `/auth/v1/health` → HTTP 200;
- GoTrue identified itself successfully;
- anonymous passwordless signup probe → HTTP 422 `anonymous_provider_disabled`.

This proves hosted network reachability and the fact that anonymous sign-ins are disabled. It does not substitute for a signed-in teacher-session proof.

## Remaining boundary: authenticated Storage bytes

A positive authenticated private-Storage byte round-trip is **not yet proven**.

Why it remains open:

- creating a throwaway email/password Auth user through the available tool path was blocked by credential safety controls;
- anonymous sign-in is disabled by the real project;
- hosted DB does not expose a usable JWT signing secret/config;
- `pg_net.http_post` only accepts JSON bodies and therefore cannot perform the raw binary upload required by the Storage object API;
- the available Supabase connector can deploy but cannot delete Edge Functions, so a temporary proof Edge Function would leave operational residue and was intentionally not introduced.

Therefore no object was marked READY by SQL, no Storage row was forged, and no metadata-only result is being represented as byte durability.

The remaining proof must use a real authenticated teacher/test session or another cleanup-safe authenticated client path to establish:

`upload exact bytes -> READY confirmation -> portable backup contains exact bytes -> restore -> upload target bytes -> READY -> private download -> exact byte size and SHA-256 equality`.

## Gate interpretation

Current evidence state:

- `R3_IMPLEMENTATION = CLOSED`
- `R3_EXACT_MAIN_GREEN = TRUE` for merge commit `3273dd79956d2c323a2e43b55e7c426f831df337`
- `HOSTED_SCHEMA_TRUTH = PASS`
- `CANONICAL_DB_RECOVERY = PASS`
- `REAL_AUTH_RLS_STORAGE = NOT YET PASS`
- `REAL_RECOVERY = NOT YET PASS` because authenticated Storage byte proof is still open
- `PRODUCTION_CUTOVER = FALSE`

Do not weaken these remaining gates merely because database recovery succeeded.
