# Data Model

## Status

**FOUNDATION IMPLEMENTED; CANONICAL ACADEMIC MODEL NOT YET IMPLEMENTED.**

R3.0 intentionally creates only `public.app_schema_version`, a singleton compatibility marker. It does not create academic-domain tables.

## Frozen distinctions that later schema work must preserve

- Student != Enrollment
- Material != Lesson
- Lesson != Meeting
- Activity != Assessment
- Assessment != Result
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

The historical Streamlit tables and the legacy grade identity `(student/class/category/topic)` are migration evidence only. They are not authority for the R3 canonical schema.

## Migration governance

All database changes belong in ordered SQL files under `supabase/migrations/`. Later migrations must include tables, constraints, indexes, RLS, functions/RPC, and storage policies as applicable. Dashboard-only schema changes are not canonical.
