# Production Readiness / First Production Program

## Status

R3 implementation is closed. Exact `main` after R3.7 is `aaebd50ab6ffd5fd0ab71faa6e92b534ad90dd66`; exact-main verify-foundation run #284 passed typecheck, unit/static contracts, PostgreSQL contracts, production build, Chromium, source-instrumented E2E, and production-artifact E2E.

This document governs the path from **deployable R3 artifact** to **first real production use**. It is operational readiness, not R3.8 feature development.

Current canonical schema identity remains `r3.6-recovery.1`. R3.7 is schema-neutral.

## Governing principle

Production is not true because:
- CI is green;
- `vite preview` works;
- Cloudflare serves the page;
- Supabase tables exist;
- login succeeds once.

Production becomes eligible only after this chain is proven against real hosted services:

```text
FROZEN R3 CANDIDATE
  -> HOSTED SCHEMA TRUTH
  -> REAL AUTH / RLS / STORAGE
  -> REAL PORTABLE BACKUP
  -> RESTORE DRILL
  -> CLOUDFLARE CANDIDATE
  -> DEPLOYED DAILY-DRIVER SMOKE
  -> KNOWN-GOOD ROLLBACK
  -> EXPLICIT CUTOVER
```

No post-R3 product feature may enter this critical path merely because it is desirable.

---

## Free-tier operating assumptions

These are planning assumptions observed on 2026-09-07 and MUST be revalidated before execution because provider plans can change.

### Supabase Free

Current official pricing/docs state:
- two active Free projects;
- 500 MB database per project;
- 1 GB file storage;
- Free projects may be paused after roughly one week of insufficient activity;
- automatic backups and PITR are not included on Free;
- Supabase recommends Free users regularly run `supabase db dump` and keep off-site backups;
- database backups contain Storage metadata, not the actual Storage object bytes.

Operational consequence for Nilai SMP: capacity is not the immediate design risk for a single teacher; **durability and recovery discipline are**.

Recommended zero-cost topology during readiness:

```text
Supabase project A = production candidate / later production
Supabase project B = empty recovery-drill target when needed
GitHub Actions      = deterministic local/ephemeral PostgreSQL verification
Cloudflare Workers  = static SPA delivery only
```

Project B does not need to be permanent staging. It can remain empty/cold except for restore drills, preserving the two-project Free allowance.

### Cloudflare Workers Static Assets

Current official Cloudflare docs state static asset requests are free and unlimited. The repository already uses `assets.directory = ./dist` with `not_found_handling = single-page-application`, matching the supported SPA delivery model.

Nilai SMP does not need a dynamic Cloudflare Worker backend for first production. Supabase remains the academic backend.

### Research references

Revalidate these before cutover:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/storage/security/access-control
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/

---

# P0 — R3 closure and candidate freeze

**Status: COMPLETE.**

Frozen evidence:
- exact main: `aaebd50ab6ffd5fd0ab71faa6e92b534ad90dd66`;
- schema: `r3.6-recovery.1`;
- ordered migrations through `202609070001_recovery_portable_backup.sql`;
- production `dist/` boundary proven separately from source-instrumented browser torture;
- Daily Driver integration present.

### P0 law

If `main` changes before first production, the candidate SHA changes and the complete verification chain must be re-established for the new exact candidate.

A documentation-only future plan does not authorize product or schema mutation.

---

# P1 — Hosted Supabase schema truth

## Goal

Establish one fresh hosted Supabase project whose real service state is demonstrably generated from repository migrations rather than dashboard improvisation.

## Required execution

1. Create/select the intended hosted Supabase production-candidate project.
2. Install/use an authenticated Supabase CLI outside the browser bundle.
3. Link explicitly to the correct project.
4. Run `supabase db push --dry-run` first.
5. Review the exact pending migration list.
6. Run `supabase db push` only after the dry run matches repository intent.
7. Do **not** use production seed data.
8. Do **not** use `supabase db reset --linked` on production. Official Supabase guidance defines it as destructive and says never to use it on production.

## Hosted proof required

Prove on the real project:
- migration history is complete and ordered;
- `app_schema_version` resolves exactly to `r3.6-recovery.1`;
- authenticated/anonymous grants match expected boundaries;
- `artifact-files` exists;
- `artifact-files` is private;
- 20 MB object limit is present;
- allowed MIME types match repository contract;
- owner-derived Storage INSERT/SELECT policies exist;
- no browser Storage UPDATE/DELETE policy was accidentally introduced.

## Configuration law

Browser runtime may receive only:
- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Never expose service-role keys, database passwords, personal access tokens, Cloudflare API tokens, or other privileged secrets via `VITE_*`.

`supabase/config.toml` should not be invented merely to appear complete. If added later, generate/reconcile it against the real hosted environment and commit only non-secret reproducible configuration.

## P1 exit gate

`HOSTED_SCHEMA_TRUTH = PASS` only when a clean hosted project created from repository migrations matches the expected schema/version/storage contracts with no manual drift required.

---

# P2 — Real Auth, RLS, and private Storage smoke

## Goal

Prove the browser application can perform its intended daily workflow using real hosted Auth/Data API/RPC/Storage while forbidden cross-owner operations remain forbidden.

## Identity setup

Use at least:
- **Teacher A**: production-candidate owner flow;
- **Teacher B**: temporary adversarial/negative-test account.

Teacher B is evidence tooling, not a product collaboration feature.

## Positive smoke — Teacher A

From the real browser client:
1. sign in with email/password;
2. bootstrap exactly one owned personal workspace;
3. create Academic Year;
4. create Academic Period;
5. create Class;
6. create Student;
7. create Enrollment;
8. create Material/Lesson/LessonVersion;
9. Start Class;
10. write a durable Checkpoint;
11. reload/re-enter and prove continuity;
12. Complete/Cancel only through explicit lifecycle action;
13. create Assessment;
14. save ordinary Result without fabricating AttemptKind;
15. create explicit ORIGINAL/MAKEUP/REMEDIAL/CORRECTION only when intentionally selected;
16. run Rapid Correction;
17. run desktop Bulk Entry/XLSX preview + atomic commit;
18. generate provisional Reporting snapshot;
19. verify UNCHECKED blocks Finalize;
20. finalize after explicit states exist;
21. create Artifact + ArtifactVersion;
22. reserve ArtifactObject;
23. upload exact DOCX/PDF bytes with `upsert:false`;
24. confirm READY with SHA-256 + byte size;
25. obtain owner-visible signed download URL;
26. download and verify exact byte equality.

## Negative smoke — Teacher B / anonymous

Prove the real hosted environment rejects or hides:
- Teacher A Student/Enrollment/Class;
- Teacher A Meetings/Checkpoints;
- Teacher A Assessment/Result/Attempt;
- Teacher A Reporting rows/snapshots;
- Teacher A Artifact metadata;
- Teacher A private Storage objects;
- owner-only mutation RPC targets;
- anonymous reads/writes that repository contracts deny.

No service-role credential may be used to make browser smoke pass.

## Auth URL configuration

Before deployed smoke, Supabase Auth Site URL must point to the intended production URL, not localhost. Production redirect allow-lists should prefer exact URLs. This becomes especially important if password reset, email confirmation, or external providers are added later.

## P2 exit gate

`REAL_AUTH_RLS_STORAGE = PASS` only when positive daily-driver behavior works and negative isolation attacks fail as designed on hosted Supabase.

---

# P3 — Real backup and restore proof

## Goal

Prove recovery from real hosted data, including actual private Artifact bytes.

Nilai SMP intentionally uses **three different safety layers**. They are complementary, not substitutes.

### Layer A — portable canonical backup

The product backup is the primary application-level recovery artifact because it contains:
- canonical academic/teaching/assessment/reporting/artifact history;
- exact READY Artifact bytes;
- per-object SHA-256;
- whole-manifest checksum;
- stable domain identities.

This is the only Nilai SMP recovery artifact that intentionally bridges canonical DB rows and exact Artifact bytes.

### Layer B — `supabase db dump`

Free Supabase has no automatic backups. Maintain a logical database dump off-site as infrastructure-level defense.

A DB dump is **not enough by itself** because Supabase database backups do not contain Storage object bytes.

### Layer C — XLSX human escape

Keep the XLSX escape export as a provider-independent human-readable fallback. It is not canonical round-trip recovery.

## Real restore drill

Use a separate empty hosted target project where practical:
1. produce portable backup from Teacher A with at least one READY private ArtifactObject;
2. save backup outside the source Supabase project;
3. verify manifest before restore;
4. apply exact compatible schema to empty target;
5. sign in as target owner;
6. restore portable canonical rows;
7. prove target workspace ownership is remapped to target `auth.uid()`;
8. prove stable academic/document UUIDs survive;
9. prove Artifact paths are rewritten into target workspace scope;
10. prove restored binary metadata starts PENDING, not fake READY;
11. upload backed-up exact bytes;
12. confirm READY;
13. signed-download restored object;
14. verify SHA-256 + byte size exactly match source backup;
15. prove source project remained unchanged;
16. prove replay of the same restore is idempotent;
17. prove non-empty target restore fails closed.

## Backup custody law

Backups contain student data and possibly teacher documents. Do not publish them to Git, GitHub Actions artifacts, public cloud buckets, or shared links by default.

Keep at least one independent off-site copy under user control. File encryption is recommended when the storage location is not already strongly private.

## P3 exit gate

`REAL_RECOVERY = PASS` only when a real READY Artifact survives source -> portable backup -> empty hosted target -> PENDING -> exact byte restore -> READY -> signed download verification.

---

# P4 — Cloudflare production candidate

## Goal

Serve the exact tested SPA artifact through actual Cloudflare Workers Static Assets without moving academic truth into Cloudflare.

## Required shape

Keep the current architecture:

```text
Browser
  -> Cloudflare Static Assets (`dist/`)
  -> Supabase Auth/Data API/RPC/Storage
```

Do not add Worker-side state, KV, D1, Durable Objects, queues, or Edge logic merely to deploy the SPA.

## First deployment discipline

For first production, prefer a deliberate/manual authenticated `wrangler deploy` over automatic deploy-on-every-main-push.

Reason: a single-teacher app benefits more from a bounded candidate -> smoke -> promote discipline than from high-frequency continuous delivery.

Record:
- Git commit SHA;
- build command;
- Wrangler version;
- Cloudflare Worker version/deployment ID;
- public URL;
- Supabase project ref used by the bundle;
- deployment timestamp.

Do not store privileged Cloudflare tokens in the browser bundle or repository.

## P4 exit gate

`CLOUDFLARE_CANDIDATE = PASS` only when the deployed URL serves the expected `dist` SPA, deep re-entry works, and no Vite dev runtime/source module path is required.

---

# P5 — Deployed Daily Driver smoke

## Goal

Prove the real URL is usable under the actual form factors and interruption patterns that matter.

## Mobile-first smoke

On the deployed URL:
- sign in;
- Today opens first;
- Safe Work summary is truthful;
- Start Class;
- checkpoint;
- refresh;
- recover continuity;
- Rapid Correction arbitrary paper order;
- transient network interruption produces Pending Safe only after IndexedDB durability;
- reconnect replays same operation ID;
- explicit lifecycle action remains required to Complete/Cancel.

## Desktop smoke

On desktop Chromium-class browser:
- Data & Setup;
- Assessment;
- Bulk Entry;
- generated Nilai SMP XLSX template;
- local parse/preview;
- reject invalid identity rows;
- online atomic commit;
- Reporting;
- Artifact upload/download;
- Recovery export.

## Deep navigation smoke

Hard-refresh a non-root path/URL and prove Cloudflare SPA fallback returns the application rather than a 404.

## P5 exit gate

`DEPLOYED_DAILY_DRIVER = PASS` only when mobile continuity/correction and desktop bulk/artifact/recovery workflows work against real hosted services.

---

# P6 — Rollback proof and cutover decision

## Frontend rollback

Cloudflare Workers versions/deployments support rollback to a prior deployed version. Before first real use:
1. identify the known-good version ID;
2. deploy a controlled later candidate;
3. exercise the rollback procedure (`wrangler rollback <VERSION_ID>` or dashboard equivalent);
4. prove the known-good UI becomes active again.

## Critical schema law

Cloudflare rollback rolls back frontend/static assets, **not Supabase database state**.

Therefore after production data exists:
- schema migrations are forward-moving;
- do not destructively reset production;
- do not assume frontend rollback can undo a schema change;
- an older frontend may be rolled back only while it remains compatible with the current hosted schema;
- otherwise prefer forward repair.

R3.7 is schema-neutral, so the initial candidate has a particularly clean frontend rollback boundary against `r3.6-recovery.1`.

## Legacy migration decision gate

Before cutover choose exactly one path:

### Path A — no historical Streamlit data required

- preserve `legacy/streamlit/` as read-only evidence;
- take any required legacy export/archive;
- declare legacy migration **NOT REQUIRED FOR CUTOVER**;
- do not resurrect PR #27 as a blocker.

### Path B — historical data must move

Legacy migration becomes a real cutover blocker and must separately prove:
- extract;
- normalize;
- validate;
- dry run;
- deterministic identity mapping;
- row/count/reconciliation evidence;
- rollback/abort without damaging source;
- final migration report.

Never operate indefinite dual-write between legacy and R3.

## CUTOVER TRUE conditions

All must be true:

```text
R3_EXACT_MAIN_GREEN = TRUE
HOSTED_SCHEMA_TRUTH = PASS
REAL_AUTH_RLS_STORAGE = PASS
REAL_RECOVERY = PASS
CLOUDFLARE_CANDIDATE = PASS
DEPLOYED_DAILY_DRIVER = PASS
KNOWN_GOOD_ROLLBACK = PASS
LEGACY_DECISION = EXPLICIT
```

Only then may the governor declare `PRODUCTION_CUTOVER = TRUE`.

---

# P7 — Day-2 operations after cutover

First production is not the end of reliability work.

## Routine

Recommended for the current free-tier/single-teacher profile:
- portable canonical backup after meaningful reporting/term milestones and before risky upgrades;
- periodic `supabase db dump` off-site;
- periodic XLSX human escape export;
- restore drill at least after major recovery-format/schema changes;
- monitor Supabase project pause warnings during school holidays;
- verify quotas before large Artifact imports;
- keep one known-good Cloudflare deployment identified;
- dependency upgrades go through the existing exact-head + exact-main verification chain.

## School-holiday pause behavior

If a Free Supabase project is paused for low activity, resume it through the provider dashboard and then run a bounded application smoke before relying on it for class. Do not respond to inactivity risk by fabricating fake academic traffic inside the product.

## Upgrade law

Any future schema package must state explicitly:
- compatibility with the currently deployed frontend;
- whether frontend rollback remains possible after migration;
- backup required before migration;
- recovery-format compatibility;
- forward-repair strategy.

---

# What production readiness deliberately does NOT add

This program does not authorize:
- AI/Teacher Brief;
- collaboration/multi-teacher roles;
- full offline replica/sync;
- schedule engine;
- automatic homework;
- gamification;
- generic global search;
- unrelated UI redesign.

Those are governed separately by `docs/FUTURE_ROADMAP.md` and may begin only after first production is stable unless a concrete production blocker proves otherwise.
