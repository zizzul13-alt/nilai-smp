# Troubleshooting

## Configuration/login
Use `.env.local` with browser-safe Supabase URL + publishable key only. Never substitute a service-role key.

## Database incompatible
Stop writes and apply ordered migrations. Current runtime expects `r3.3-bulk-assessment.1` after foundation -> academic spine -> safe work -> teaching core -> assessment core -> rapid correction -> bulk assessment. Do not manually pre-set the version.

## Rapid Pending Safe / FAILED / CONFLICT
Pending Safe belongs to Rapid Correction/Safe Work and means the operation committed to IndexedDB, not PostgreSQL. Preserve browser storage. FAILED/CONFLICT require explicit recovery; logout warns and preserves the user/workspace namespace.

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
