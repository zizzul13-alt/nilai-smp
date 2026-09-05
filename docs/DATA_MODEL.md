# Data Model

## Status
R3.1 Academic + Teaching Core, R3.2 Safe Work metadata, R3.3 Assessment Core/Rapid Correction/Bulk Assessment and R3.4 Teaching Continuity Core are implemented.

## Ownership graph
```text
auth.users -> workspaces
  -> academic_years -> academic_periods -> classes
  -> students -> enrollments -> classes
  -> materials -> lessons -> lesson_versions
  -> meetings -> checkpoints
  -> activities <-> meetings
  -> scoring_profiles
  -> assessments -> assessment_results(revision) -> assessment_attempts
  -> correction_sessions (workflow progress, not evidence)
  -> applied_operations (idempotency metadata, not academic history)
```
Every protected record is workspace-owned; composite FKs defend graph integrity.

## Teaching continuity truth
Canonical continuity is `Class -> actual Meeting -> optional Lesson -> optional exact LessonVersion -> Checkpoint(s)`.

A browser/session is not a Meeting. `meetings.status` carries the explicit lifecycle `planned | in_progress | completed | cancelled | archived`; R3.4 runtime uses an actual `in_progress` Meeting for the active teaching occurrence. At most one in-progress Meeting may exist per Workspace × Class. Completing/cancelling preserves the row as history; a later Start creates a new Meeting identity.

Checkpoint is append-only continuity data with deterministic positive `sequence_no`, required nonblank `stopped_at`, optional nonblank `next_step`, and canonical `recorded_at`. Latest continuity is reconstructed from the highest sequence of the relevant Meeting, not from UI state.

## Assessment truth
ScoringProfile is an immutable-ruleset identity. Assessment is stable UUID identity with Class/Period and optional Activity/Profile. Result is one current interpreted outcome per Assessment × Enrollment with monotonic revision. Attempt is ordered preserved evidence with ORIGINAL/MAKEUP/REMEDIAL/CORRECTION kinds.

Result state/score laws: UNCHECKED/MISSING/EXCUSED have NULL score; GRADED has non-NULL numeric score, including 0 and negative values. Blank spreadsheet input maps to UNCHECKED/no judgement, never zero or Missing.

## Spreadsheet identity
Spreadsheet row != Student identity and header != Assessment identity. The owned template carries `Assessment_ID` and `Enrollment_ID`; NIS/NISN/name are teacher-readable/supporting identity only. Duplicate names are legal. Ambiguous or unmatched rows never commit. Spreadsheet data is untrusted input and never canonical storage.

## Applied operations
`meeting.start`, `meeting.status`, and `meeting.checkpoint` are R3.4 idempotency records. Start targets a Class and records the canonical Meeting identity in result metadata. Checkpoint targets a Meeting and uses result revision as the committed sequence number. Same op_id with changed scope/payload fails closed.

`assessment.judgement` remains the rapid single-Result operation. `assessment.bulk` uses one stable batch op_id targeting one Assessment; request metadata contains the exact canonical batch payload and result metadata stores deterministic summary. No per-row spreadsheet identity is added to the canonical academic graph.

## Migration chain
```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
-> r3.3-rapid-correction.1
-> r3.3-bulk-assessment.1
-> r3.4-continuity-core.1
```
Migrations remain append-only.
