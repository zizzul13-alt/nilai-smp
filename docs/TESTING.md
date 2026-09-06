# Testing Strategy

## Tiers
1. **Vitest:** frozen semantic/static architecture contracts plus identity, derivation, schema/doc drift and storage-integrity laws.
2. **Real PostgreSQL:** ordered migration chain plus RLS, lifecycle, revision, idempotency, concurrency and atomic transaction attacks.
3. **Playwright:** browser Safe Work/Teaching/Today/Assessment/Reporting/Artifact workflow acceptance.
4. **Build/typecheck:** production TypeScript/Vite boundary.

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

Playwright covers Artifact creation from exact LessonVersion provenance, stale-source warning, append-as-new-version and archive history preservation. Production Supabase Storage byte transfer remains covered by the browser service/static integrity contracts here and becomes part of the real deployment/final Daily Driver smoke rather than being faked as privileged storage in PostgreSQL CI.

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
CI uses ephemeral PostgreSQL; no production database or service-role browser credential is required.

## Still out of scope
Portable backup/restore, legacy migration, final Daily Driver production-artifact E2E, AI, collaboration, full offline, schedule engine, automatic homework, gamification and generic global search.
