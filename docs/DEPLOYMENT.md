# Deployment

Static delivery foundation is implemented; production cutover remains separately governed.

## Clean build
```bash
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:e2e
```
Only browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach the client. Never expose service-role/database/deployment credentials.

## Delivery
`wrangler.jsonc` serves `./dist` with SPA fallback. Cloudflare is delivery, not academic backend. Supabase/PostgreSQL remains canonical.

## Migration order
Apply every source-controlled migration strictly in filename order:

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
```

The final migration-owned `app_schema_version` and `src/config/schema.ts` must agree on `r3.4-pacing-final.1` before deploying the matching frontend. Do not manually edit, pre-set, or forge `app_schema_version`; ordered migrations own that value and the browser fails closed on mismatch.

Today uses bounded ownership-derived PostgreSQL RPC reads plus local IndexedDB Safe Work summary; it does not download Teaching Core history. Re-entry baselines are append-only facts and do not rewrite Meeting/Checkpoint history.

R3.4 pacing plans are canonical class+lesson teacher judgements. `Effective Meetings = Available Meetings - Correction reserve`; the app never converts timetable rows into actual Meetings. `RELAXED / NORMAL / COMPRESSED` recommendation is explainable from that explicit capacity, while an explicit teacher mode override wins. COMPRESSED reduces breadth first; CORE, Practice for comprehension, and Minimum Exit Criteria remain visible. Pacing plans do not rewrite immutable LessonVersion content and do not create homework automatically.

Safe Work requires IndexedDB for durable Pending Safe operations, including Rapid Correction and Teaching Continuity meeting checkpoints. Bulk Import additionally requires normal browser File/Blob, DOMParser and DecompressionStream support for bounded XLSX parsing, and live server connectivity at Commit. No spreadsheet/server secret is embedded in generated templates.