# Data Model

## Status

**R3.1 CANONICAL ACADEMIC SPINE IMPLEMENTED.** Future teaching, assessment, sync, reporting, artifact, backup, and migration domains remain unimplemented.

## Ownership and hierarchy

```text
auth.users
  -> workspaces
       -> academic_years
            -> academic_periods
                 -> classes
       -> students
       -> enrollments -> students
                      -> classes
```

`workspaces` is the canonical personal ownership root. Every academic record stores `workspace_id`. Parent/child relationships use workspace-aware composite foreign keys where a cross-workspace reference would otherwise be possible.

## Implemented entities

- **Workspace:** one idempotently provisioned personal workspace per authenticated owner in R3.1. The schema does not add collaborators, invitations, roles, or school hierarchy.
- **Academic Year:** workspace-owned identity with display name, deterministic `sort_order`, optional dates, and `planned | active | archived` lifecycle.
- **Academic Period:** explicit child identity under one Academic Year, independently ordered within its year. It is not an alias for Academic Year.
- **Class:** belongs to one Academic Period. Class identity is unique only inside that period, so `VIII A` can legitimately recur in another semester/year.
- **Student:** workspace-scoped person identity with stable UUID. Names are mutable and deliberately non-unique. Optional NIS/NISN values are nullable; when present each is unique inside a workspace.
- **Enrollment:** stable Student-in-Class relationship with lifecycle `active | withdrawn | completed | archived`. Student and Class are explicit FKs and must belong to the same workspace. Student identity is never deleted merely because an enrollment ends.

## Canonical distinctions preserved

- Student != Enrollment
- Academic Period != Academic Year
- archive/inactive lifecycle != deletion
- duplicate student name != duplicate student identity
- Material != Lesson; Lesson != Meeting
- Activity != Assessment; Assessment != Result
- Workflow State != Score
- UNCHECKED != GRADED != MISSING != EXCUSED
- 0 != blank; Missing != 0
- Susulan != Remedial
- Raw Evidence != Reported Outcome
- Finalized != Archived; Archive != Backup
- Canonical Lesson != Artifact
- Schedule != Actual Meeting
- UI State != Local Durable State != Server Canonical State
- Provider != Data Ownership

The historical Streamlit tables and legacy grade identity `(student/class/category/topic)` remain migration evidence only.

## Integrity and lifecycle

Deletes are intentionally `RESTRICT` across the academic spine. Historical identity should be preserved through lifecycle state rather than accidental cascades. Enrollment has a database unique constraint on `(workspace_id, student_id, class_id)`, making duplicate Student/Class enrollment impossible under concurrency while retaining one stable lifecycle record.

## Migration governance

All database changes belong in ordered SQL files under `supabase/migrations/`. The R3.1 migration creates the complete spine, constraints, indexes, RLS and bootstrap RPC before advancing `app_schema_version` to `r3.1-academic-spine.1` as its final operation.
