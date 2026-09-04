# Architecture

## Status

R3.0 Foundation, R3.1 Academic Spine + Teaching Core, R3.2 Safe Work durability core, and R3.3 Assessment Canonical Core are implemented. Rapid-correction UX, Today/Continue, reporting, artifacts, backup/restore implementation, legacy migration, collaboration, AI, and full offline remain unimplemented.

## Target boundaries

```text
Browser / React + Vite
  explicit domain + services
  Safe Work recovery state: IndexedDB + Dexie (Student rename proof only)
    Supabase browser client
      Auth + Data API / narrow domain RPCs
        PostgreSQL + RLS + constraints
          auth.users -> workspaces
            -> Academic Spine
            -> Teaching Core
            -> Assessment Core
          server canonical truth
Delivery: Cloudflare Workers Static Assets
```

Supabase is canonical operational truth. Browser filtering is never authorization. Dexie is recovery state, not a second academic database or full-offline subsystem.

## Ownership and schema compatibility

`auth.users -> workspaces -> all protected academic records` remains the ownership root. RLS derives callers from `auth.uid()` and workspace-aware composite FKs reject cross-workspace composition. Browser code receives no service-role credential.

`src/config/schema.ts` declares `r3.3-assessment-core.1`; startup fails closed if `app_schema_version` differs. Migrations remain append-only and advance compatibility only after their full contract exists.

## Academic and Teaching Core

Personal Workspace -> Academic Year -> Academic Period -> Class remains canonical, with separate Student and Enrollment identities. Material -> Lesson -> append-only LessonVersion remains separate from actual Meeting/Checkpoint. Activity is classroom work and may span Meetings; Activity != Assessment.

## R3.3 Assessment Core

Canonical graph:

```text
Workspace -> ScoringProfile
Workspace -> Assessment -> Class + AcademicPeriod
                     -> optional Activity
                     -> optional ScoringProfile
Assessment + Enrollment -> Result -> Attempt(s)
```

Assessment is stable teacher-owned UUID identity and never derives identity from category/topic/display label/spreadsheet position. It can exist without Activity. Class + AcademicPeriod consistency is structural.

ScoringProfile is reusable scoring semantics/configuration. Its JSON object is intentionally boring and reconstruction-friendly; negative scoring is valid and there is no global 0..100 constraint.

Result is the single current interpreted outcome for Assessment × Enrollment. State is explicit: `UNCHECKED | GRADED | MISSING | EXCUSED`. Only GRADED carries a non-null score, so graded zero survives as zero while unchecked/missing/excused remain null. Attendance does not infer Result state.

Attempt is preserved evidence/history under Result with ordered kinds `ORIGINAL | MAKEUP | REMEDIAL | CORRECTION`. MAKEUP != REMEDIAL. Result is not derived by silently selecting the latest Attempt.

`record_assessment_judgement()` is a narrow SECURITY DEFINER transaction: it derives the owned workspace, validates Assessment and Enrollment share the owned Class, upserts the one current Result, and optionally appends Attempt evidence in the same PostgreSQL transaction. Result/Attempt tables are browser-read-only; direct split writes are not granted. This RPC is server-canonical and is deliberately **not** wired into R3.2 Safe Work/Dexie yet.

## R3.2 Safe Work layer

Safe Work remains unchanged: only revision-checked Student rename is durable-queued. `PENDING_SAFE` follows IndexedDB commit; FAILED/CONFLICT remain explicit. R3.3 does not create a generic mutation framework or claim offline grading.

## Legacy

`legacy/streamlit/` remains migration evidence only and cannot redefine R3 canonical identities or semantics.
