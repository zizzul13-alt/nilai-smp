# Data Model

## Status

**R3.1 ACADEMIC SPINE + TEACHING CORE IMPLEMENTED; R3.2 SAFE WORK METADATA IMPLEMENTED.** Assessment/grading, reporting, artifact, backup, migration, collaboration, AI and full-offline domains remain unimplemented.

## Ownership and hierarchy

```text
auth.users -> workspaces
  -> academic_years -> academic_periods -> classes
  -> students
  -> enrollments -> students + classes
  -> materials -> lessons -> lesson_versions
  -> meetings -> classes + optional lesson/version context
       -> checkpoints
  -> activities -> classes
       <-> meetings through activity_meetings
  -> applied_operations (Safe Work idempotency metadata, not academic history)
```

Every protected academic record stores `workspace_id`. Relationships use workspace-aware composite foreign keys wherever cross-workspace composition must be impossible.

## Academic Spine

Workspace is the personal ownership root. Academic Year and Academic Period are distinct ordered identities. Class belongs to a period and can recur by identity in another period. Student is stable workspace person identity with non-unique name and optional workspace-unique NIS/NISN. Enrollment is explicit Student/Class membership with lifecycle; Student != Enrollment.

## Teaching Core

- **Material:** stable workspace teaching concept with title and `active | archived` lifecycle.
- **Lesson:** stable reusable teaching unit belonging to Material. Its identity survives revisions.
- **LessonVersion:** immutable-distinguishable version identity under one Lesson. `(workspace_id, lesson_id, version_number)` is unique. Minimal `content_text` proves version history without introducing a curriculum/AI schema.
- **Meeting:** actual Class occurrence with timestamp and lifecycle. Lesson and LessonVersion context are optional. Lessonless Meeting is valid. If a version is supplied it must belong to the referenced Lesson and workspace.
- **Checkpoint:** ordered stop/next continuity under Meeting. Multiple checkpoints per Meeting are valid; `recorded_at` plus sequence reconstruct latest continuity.
- **Activity:** stable Class classroom-work identity with lifecycle. It contains no Assessment, score, result, attempt or grading fields.
- **ActivityMeeting:** explicit link allowing one Activity to span multiple Meetings. Composite FKs require both sides to share workspace and Class; duplicate Activity/Meeting links are rejected.

## R3.2 Safe Work additions

`students.revision bigint` proves stale-write conflict handling. `applied_operations` is workspace-scoped idempotency metadata, not an event store/audit log. Local Dexie operations are recovery records, not canonical entities. `PENDING_SAFE` is automatic sync work; `FAILED` and `CONFLICT` remain durable until explicit recovery/resolution. Teaching Core does not expand the Safe Work mutation set.

## Canonical distinctions preserved

- Student != Enrollment
- Material != Lesson; Lesson != Meeting
- stable Lesson != LessonVersion
- planned/canonical lesson context != actual Meeting occurrence
- Activity != Assessment; Assessment != Result
- Canonical Lesson != Artifact
- Schedule != Actual Meeting
- Workflow State != Score
- UNCHECKED != GRADED != MISSING != EXCUSED
- 0 != blank; Missing != 0
- Susulan != Remedial
- Raw Evidence != Reported Outcome
- Finalized != Archived; Archive != Backup
- UI State != Local Durable State != Server Canonical State
- Provider != Data Ownership

## Integrity and lifecycle

Academic and Teaching Core parent relationships use `RESTRICT`; lifecycle/archive state is preferred over accidental cascade deletion. Composite uniqueness supplies workspace-aware FK targets. LessonVersion numbers and ActivityMeeting pairs have database uniqueness so concurrency cannot create duplicate semantic identity.

## Migration governance

Ordered migrations remain append-only. R3.0 creates compatibility foundation; R3.1 Academic Spine establishes ownership; R3.2 adds Student Safe Work proof; R3.1 Teaching Core then adds the remaining canonical teaching graph and advances compatibility to `r3.1-teaching-core.1` only after its complete structure/RLS exists. The later migration does not remove R3.2 semantics.
