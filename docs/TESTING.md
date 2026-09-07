# Testing Strategy

## Tiers
1. **Vitest:** frozen semantic/static architecture contracts plus identity, derivation, schema/doc drift and storage-integrity laws.
2. **Real PostgreSQL:** ordered migration chain plus RLS, lifecycle, revision, idempotency, concurrency and atomic transaction attacks.
3. **Playwright against built `dist`:** browser Safe Work/Teaching/Today/Assessment/Reporting/Artifact/Recovery workflow acceptance on the production application artifact.
4. **Build/typecheck:** production TypeScript/Vite boundary.

## Production-artifact browser law
`npm run test:e2e` first runs `npm run build`. Playwright then serves the generated `dist/` through `vite preview`; it never starts the Vite development server. The same `dist/` boundary is configured for Cloudflare Workers Static Assets.

The browser suite runs on both Pixel 7 mobile emulation and Desktop Chrome. Existing Safe Work, Teaching Continuity, Today, Rapid Correction, Bulk Assessment, Reporting, Artifact and Recovery browser acceptance therefore executes against built production code rather than `/src/*` modules or `@vite/client`. A dedicated deep re-entry test verifies SPA fallback and production asset loading.

This proof does **not** fake hosted Supabase Storage. Exact private Artifact byte upload/download, signed object delivery, hosted Auth and hosted RLS remain real-environment smoke requirements before cutover.

## Teaching Continuity / Today / Pacing
Continuity contracts cover active Meeting priority, historical visibility, latest meaningful Checkpoint reconstruction, durable Pending Safe truth, lifecycle locking and stale re-entry without fabricating schedule truth. Today tests cover bounded dispatcher reads, direct Continue/Resume routing, local checkpoint overlay, no-work truth and append-only Start From Today baselines. Pacing tests cover Effective Meetings, teacher override, CORE/Practice/Stretch behavior and real async selection races.

## Rapid Correction / Bulk Assessment
Golden 40 paper coverage retains arbitrary physical order, duplicate names, zero, negative, Missing, Excused, Skip and Pending Safe restart semantics. Bulk tests use stable Enrollment identity, local bounded XLSX parse/preview and online atomic commit. Real PostgreSQL contracts prove all-or-none mutation, explicit Attempt semantics, revision conflicts, idempotent replay, cross-workspace denial and rollback.

## Reporting acceptance
Vitest/static contracts keep versioned Reporting Policy semantics explicit and prevent raw Attempt evidence from becoming reported outcome. Real PostgreSQL torture proves one consistent source snapshot, `UNCHECKED` finalization block, append-only provisional/finalized history, audited Reopen, RLS, idempotency and finalization waiting behind concurrent canonical Result writes. Playwright holds a Class A report request open, switches to Class B, releases A and proves the stale completion cannot overwrite the selected Class.

## Artifact acceptance
Vitest/static contracts prove stable Artifact != ArtifactVersion != ArtifactObject, exact LessonVersion/ReportSnapshot provenance, manual-first operation, stale-source derivation, private storage policy, checksum/size requirements, no overwrite and byte-verification on already-existing PENDING uploads.

Real PostgreSQL Artifact torture proves:
- stable Artifact + immutable append-only versions;
- exact source ownership and cross-workspace rejection;
- current-version graph integrity;
- revision conflict instead of overwrite;
- same-op concurrent append applies once and replays once after the advisory lock;
- object-kind/MIME validation and 20 MB bound;
- one object kind per ArtifactVersion;
- PENDING_UPLOAD has no fake checksum;
- same-op concurrent confirm makes READY once and replays once;
- READY retains SHA-256/size/MIME and cannot be directly rewritten;
- archive preserves all versions/objects and blocks later append;
- audit history and RLS remain closed;
- plain PostgreSQL CI safely tolerates absence of Supabase `storage.*` while production migrations configure the private bucket when available.

Playwright covers Artifact creation from exact LessonVersion provenance, stale-source warning, append-as-new-version and archive history preservation. Production Supabase Storage byte transfer remains a real hosted-environment smoke requirement rather than being faked as privileged storage in PostgreSQL CI.

## Recovery acceptance
Portable backup/restore is part of the implemented R3.6 baseline. PostgreSQL recovery contracts verify canonical export/restore semantics and separate-target restoration. Browser Recovery acceptance, backup download and restore-import UI now run against the built `dist` artifact. Exact hosted Artifact bytes remain part of the final real-environment backup/restore proof.

## Commands
```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```
`npm run test:e2e` performs its own production build as a fail-closed standalone command. CI intentionally also has an explicit Production Build step before browser acceptance so build failure is visible as its own gate.

CI uses ephemeral PostgreSQL; no production database or service-role browser credential is required.

## Still out of scope / post-R3
Legacy migration remains conditional for cutover rather than a canonical R3 semantic dependency. AI/Teacher Brief, collaboration/multi-teacher, full offline, schedule engine, automatic homework, gamification and generic global search are not part of R3.7 production-artifact verification.
