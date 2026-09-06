# Troubleshooting

## Configuration/login
Use `.env.local` with browser-safe Supabase URL + publishable key only. Never substitute a service-role key.

## Database incompatible
Stop writes and apply ordered migrations through R3.4 pacing final: foundation -> academic spine -> safe work -> teaching core -> assessment core -> rapid correction -> bulk assessment -> continuity core -> continuity lifecycle guard -> continuity write boundary -> today re-entry -> pacing final torture. Current runtime expects `r3.4-pacing-final.1`. Do not manually edit or pre-set `app_schema_version`; the ordered migrations own the version and runtime/database must agree.

## Today read failure / stale context
A Today read failure is unknown state, not "no work". Use the Today Retry action; do not infer schedule or class activity from missing data.

Re-entry freshness uses local calendar weeks rather than an hour timer: continuity from the current or immediately previous local calendar week is treated as recent; context older than the start of the previous local week is stale. Stale context remains visible as historical truth and offers Quick Update / Start From Today. Both append a new continuity baseline; neither edits or deletes historical Meetings, Checkpoints, unfinished correction sessions, or Safe Work.

## Pacing / Effective Meetings
Pacing is teacher-owned class+lesson intent, not a schedule engine. `Effective Meetings = Available Meetings - Correction reserve`. Only actual `in_progress` / `completed` Meetings count as observed Meetings; planned, cancelled, or archived Meeting rows do not become evidence.

The recommendation is deterministic: effective capacity above Normal Meetings suggests RELAXED, equal suggests NORMAL, and below suggests COMPRESSED. A teacher override always wins. COMPRESSED means reduce breadth first: Stretch is deferred before CORE/Practice comprehension and Minimum Exit Criteria. The app never auto-generates homework and never silently marks exit criteria as met.

If active correction sessions are shown, they are workflow evidence only. The app does not guess how many Meetings correction consumes; set Correction reserve explicitly. If a pacing save reports a revision conflict, reload the latest plan, review it, and save a new teacher judgement rather than overwriting a newer revision.

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