# Data Model

## Status

**R3.1 ACADEMIC + TEACHING CORE, R3.2 SAFE WORK METADATA, AND R3.3 ASSESSMENT CORE IMPLEMENTED.** Reporting, artifacts, backup, migration, collaboration, AI and full-offline domains remain unimplemented.

## Ownership and hierarchy

```text
auth.users -> workspaces
  -> academic_years -> academic_periods -> classes
  -> students -> enrollments -> classes
  -> materials -> lessons -> lesson_versions
  -> meetings -> checkpoints
  -> activities <-> meetings through activity_meetings
  -> scoring_profiles
  -> assessments -> class + academic_period + optional activity/profile
       -> assessment_results -> enrollment
            -> assessment_attempts
  -> applied_operations (Safe Work idempotency metadata, not academic history)
```

Every protected academic record stores `workspace_id`; workspace-aware composite FKs prevent foreign graph composition.

## Assessment Core entities

- **ScoringProfile:** stable reusable scoring semantics. `config` is validated as a JSON object, supports rules such as `{correct:10, wrong:-5, blank:0}`, and does not impose 0..100 scoring.
- **Assessment:** stable UUID teacher-owned identity in one Class and its AcademicPeriod. Optional Activity and ScoringProfile are context, not identity. Assessment can exist without Activity. Category/topic/display label/spreadsheet position are not identity keys.
- **Result:** one current interpreted outcome per `(workspace_id, assessment_id, enrollment_id)`. It structurally requires Assessment and Enrollment to share Class.
- **Attempt:** ordered preserved raw evidence/history under Result. Attempt kinds are ORIGINAL, MAKEUP, REMEDIAL, CORRECTION. Additional evidence never deletes prior Attempt rows.

## Result semantics

State and score are separate canonical facts:

- `UNCHECKED` -> score NULL
- `MISSING` -> score NULL
- `EXCUSED` -> score NULL
- `GRADED` -> score non-NULL, including valid `0` and negative values

Therefore `0 != blank`, Missing != 0, and attendance does not silently determine Result state. Result != Attempt; current interpreted truth is not simply the latest Attempt row. Raw Evidence != Reported Outcome.

## Existing canonical distinctions

Student != Enrollment. Material != Lesson. Lesson != Meeting. Activity != Assessment. Assessment != Result. Result != Attempt. Workflow State != Score. UNCHECKED != GRADED != MISSING != EXCUSED. Susulan/MAKEUP != Remedial. Canonical Lesson != Artifact. Finalized != Archived. Archive != Backup. UI State != Local Durable State != Server Canonical State. Provider != Data Ownership.

## Integrity and lifecycle

Parent relationships use RESTRICT. Composite uniqueness supplies workspace-aware FK targets. Assessment Class/AcademicPeriod consistency, optional Activity/Class consistency, optional Profile ownership, Result Assessment/Enrollment/Class consistency, and Attempt/Result ownership are database-enforced. Result uniqueness prevents multiple current rows for one Assessment × Enrollment. Attempt sequence uniqueness preserves deterministic history.

Result/Attempt direct browser writes are not granted. The narrow `record_assessment_judgement()` transaction updates current interpreted Result and optionally appends Attempt evidence atomically. This is not a generic rule engine and is not yet a Safe Work mutation.

## Migration governance

Ordered migrations remain append-only:

```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
```
