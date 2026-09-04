# Data Model

## Status
R3.1 Academic + Teaching Core, R3.2 Safe Work metadata, R3.3 Assessment Core and Rapid Correction are implemented.

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

## Assessment truth
ScoringProfile is an immutable-ruleset identity. Assessment is stable UUID identity with Class/Period and optional Activity/Profile. Result is one current interpreted outcome per Assessment × Enrollment and now has monotonic `revision >= 1`. Attempt is ordered preserved evidence with ORIGINAL/MAKEUP/REMEDIAL/CORRECTION kinds.

Result state/score laws: UNCHECKED/MISSING/EXCUSED have NULL score; GRADED has non-NULL numeric score, including 0 and negative values. Skip is a workflow action and writes no Result, therefore remains UNCHECKED. Missing is never converted to zero.

## CorrectionSession
`correction_sessions` contains stable UUID, workspace, Assessment, Class, status `active|completed`, optional current Enrollment, started/updated timestamps and optional completed timestamp. Its Class/Assessment/Enrollment graph is workspace-aware. It records resumable teacher workflow context only and is never Attempt/Result evidence. Completion requires explicit `completed` + timestamp.

## Applied academic operation
`applied_operations` remains idempotency metadata. `assessment.judgement` uses Enrollment as ledger target plus full Assessment/Enrollment/payload/revision request metadata. Server acceptance stores resulting Result/Attempt metadata and result revision. Reusing op_id with changed scope/payload is rejected.

## Migration chain
```text
r3.0-foundation.1
-> r3.1-academic-spine.1
-> r3.2-safe-work.1
-> r3.1-teaching-core.1
-> r3.3-assessment-core.1
-> r3.3-rapid-correction.1
```
Migrations remain append-only.
