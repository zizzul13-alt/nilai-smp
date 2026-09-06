# Troubleshooting

## Configuration/login
Use `.env.local` with browser-safe Supabase URL + publishable key only. Never substitute a service-role key.

## Database incompatible
Stop writes and apply ordered migrations through R3.5 Artifact Core: foundation -> academic spine -> safe work -> teaching core -> assessment core -> rapid correction -> bulk assessment -> continuity core -> continuity lifecycle guard -> continuity write boundary -> today re-entry -> pacing final torture -> reporting core -> artifact core -> artifact integrity hardening. Current runtime expects `r3.5-artifact-core.2`. Do not manually edit or pre-set `app_schema_version`; the ordered migrations own the version and runtime/database must agree.

## Today read failure / stale context
A Today read failure is unknown state, not "no work". Use the Today Retry action; do not infer schedule or class activity from missing data.

Re-entry freshness uses local calendar weeks rather than an hour timer: continuity from the current or immediately previous local calendar week is treated as recent; context older than the start of the previous local week is stale. Stale context remains visible as historical truth and offers Quick Update / Start From Today. Both append a new continuity baseline; neither edits or deletes historical Meetings, Checkpoints, unfinished correction sessions, or Safe Work.

## Pacing / Effective Meetings
Pacing is teacher-owned class+lesson intent, not a schedule engine. `Effective Meetings = Available Meetings - Correction reserve`. Only actual `in_progress` / `completed` Meetings count as observed Meetings; planned, cancelled, or archived Meeting rows do not become evidence.

The recommendation is deterministic: effective capacity above Normal Meetings suggests RELAXED, equal suggests NORMAL, and below suggests COMPRESSED. A teacher override always wins. COMPRESSED means reduce breadth first: Stretch is deferred before CORE/Practice comprehension and Minimum Exit Criteria. The app never auto-generates homework and never silently marks exit criteria as met.

If active correction sessions are shown, they are workflow evidence only. The app does not guess how many Meetings correction consumes; set Correction reserve explicitly. If a pacing save reports a revision conflict, reload the latest plan, review it, and save a new teacher judgement rather than overwriting a newer revision.

## Reporting provisional / finalized / reopen
Reporting snapshots are derived from canonical Assessment `Result` truth; they are not a second gradebook. A Reporting Policy is versioned and makes `SIMPLE_MEAN`, Missing behavior, rounding, and KKM explicit. KKM is a threshold display and is not mixed into the arithmetic formula.

R3.5-01 uses `CURRENT_RESULT` for remedial reporting. A REMEDIAL/MAKEUP/CORRECTION `Attempt.raw_score` remains raw evidence and is never automatically promoted into a reported outcome, even when that raw value is higher than the current Result score. Richer remedial reporting must wait for an explicit comparable interpreted outcome instead of guessing from Attempt evidence or ScoringProfile JSON.

`UNCHECKED` blocks Finalize because unknown evidence cannot be silently converted to zero or ignored. `MISSING` and `EXCUSED` remain explicit states; the selected policy determines how Missing contributes while EXCUSED is excluded in R3.5-01. A provisional snapshot may show UNCHECKED so the teacher can see exactly what is unfinished.

A snapshot source is materialized from one PostgreSQL statement so every enrollment row comes from one committed MVCC source view. Finalization additionally serializes against concurrent Class/Assessment/Result/Enrollment/Student source writes until the transaction commits. If Finalize waits briefly while another academic write is committing, let it finish; do not bypass the RPC.

A FINALIZED reporting cycle is intentionally closed. Do not overwrite or recalculate it in place. If a factual correction is required, use **Reopen**, enter a concrete reason, correct the canonical Result/Attempt evidence, then create a new provisional/finalized snapshot. The old FINALIZED snapshot remains append-only history and the Reopen reason is recorded in `audit_events`.

If a reporting operation reports a revision conflict, reload the latest cycle/snapshot and review before trying again. Do not bypass the RPC by directly editing `reporting_cycles`, `report_snapshots`, or `report_snapshot_rows`.

## Artifact versions / private files
Artifact identity is stable; every regeneration or factual revision creates a new `ArtifactVersion`. Do not rewrite an older version to make history look current. `STALE SOURCE` means an ArtifactVersion points to an older exact LessonVersion than the latest LessonVersion currently available; it is a warning to create a new version, not permission to mutate history.

Manual artifacts remain valid without AI. Lesson-sourced and report-sourced versions retain exact source IDs and provenance. READY DOCX/PDF objects are private, checksumed and overwrite-resistant. A READY object cannot be replaced on the same version; create a new ArtifactVersion instead.

`PENDING_UPLOAD` means metadata has been reserved but the binary has not yet been confirmed READY. Retry with the exact same file size/kind. If Storage reports that the path already exists, the app downloads that owner-visible private object and verifies the bytes/SHA-256 before confirming; it must never confirm a different local file merely because the path exists. If the pending reservation belongs to a different file, keep the old history and create a new ArtifactVersion rather than forging metadata. Signed download URLs are short-lived and generated only through the authenticated private bucket.

Do not manually edit `artifact_objects`, Storage paths, SHA-256, or READY state. Do not make the `artifact-files` bucket public. Browser Storage UPDATE/DELETE is intentionally absent for artifact objects.

## Safe Work Pending Safe / FAILED / CONFLICT
Pending Safe is a Safe Work state, not a Rapid Correction-only concept. It is used by Rapid Correction, Meeting Checkpoint / Teaching Continuity, and other Safe Work operations where applicable.

- `Saved` = server confirmed.
- `Pending Safe` = durably committed to local IndexedDB, but not yet server confirmed.
- `FAILED` / `CONFLICT` = durable local work that requires explicit recovery.

Today may summarize these states but never relabel Pending Safe as Saved. Preserve browser storage. Logout warns and preserves the user/workspace namespace; a bootstrap or network failure does not delete Pending Safe work.

## Bulk XLSX parse/validation
Use a Nilai SMP-owned `.xlsx` template for one Assessment. Maximum input is 2 MB / 500 rows. Formula cells are rejected rather than executed. Missing required columns, wrong Assessment_ID, duplicate Enrollment rows, malformed values, unmatched/ambiguous identity and foreign class/workspace identity must be corrected before Commit. Display name alone is never an identity resolver.

Blank means UNCHECKED/no judgement. `0` is GRADED 0. Negative numeric values are valid. Use `MISSING` or `EXCUSED` explicitly; blank is neither.

## Bulk commit conflict
Bulk Preview can become stale. If Commit reports conflict, no batch mutation is accepted. Reload the Assessment, inspect canonical state/score/revision, regenerate Preview and explicitly submit a new batch. Do not retry stale revisions forever and do not bypass the atomic RPC with direct Result writes.

## Bulk connectivity
Bulk Commit is intentionally online-only and never claims Pending Safe. If the network fails before acknowledgement, retry the same stable operation ID only when the client still owns that commit attempt; server replay is idempotent. A successful UI summary is shown only after server acknowledgement.

## Verification
```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```
Use Node 22 LTS first and do not bypass lockfile disagreement.
