# Troubleshooting

## Configuration/login
Use `.env.local` with browser-safe Supabase URL + publishable key only. Never substitute a service-role key.

## Database incompatible
Stop writes and apply ordered migrations through Teaching Continuity: foundation -> academic spine -> safe work -> teaching core -> assessment core -> rapid correction -> bulk assessment -> continuity core -> continuity lifecycle guard -> continuity write boundary. Current runtime expects `r3.4-continuity-core.1`. Do not manually edit or pre-set `app_schema_version`; the ordered migrations own the version and runtime/database must agree.

## Safe Work Pending Safe / FAILED / CONFLICT
Pending Safe is a Safe Work state, not a Rapid Correction-only concept. It is used by Rapid Correction, Meeting Checkpoint / Teaching Continuity, and other Safe Work operations where applicable.

- `Saved` = server confirmed.
- `Pending Safe` = durably committed to local IndexedDB, but not yet server confirmed.
- `FAILED` / `CONFLICT` = durable local work that requires explicit recovery.

Preserve browser storage. Logout warns and preserves the user/workspace namespace; a bootstrap or network failure does not delete Pending Safe work.

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
