# Data Model

## Status
R3.1 Academic + Teaching Core, R3.2 Safe Work metadata, R3.3 Assessment Core/Rapid Correction/Bulk Assessment, R3.4 Teaching Continuity / Today / Pacing, R3.5 Reporting + Artifact Core, and R3.6 Portable Recovery Core are implemented.

## Ownership graph
```text
auth.users -> workspaces
  -> academic_years -> academic_periods -> classes
  -> students -> enrollments -> classes
  -> materials -> lessons -> lesson_versions
  -> lesson_pacing_plans (Class + Lesson teacher pacing intent)
  -> meetings -> checkpoints
  -> continuity_baselines (append-only re-entry facts)
  -> activities <-> meetings
  -> scoring_profiles
  -> assessments -> assessment_results(revision) -> assessment_attempts
  -> correction_sessions (workflow progress, not evidence)
  -> reporting_policies (versioned policy series)
  -> reporting_cycles -> report_snapshots -> report_snapshot_rows
  -> artifacts -> artifact_versions -> artifact_objects
  -> audit_events (important academic workflow history)
  -> applied_operations (idempotency metadata, not academic history)
```
Every protected record is workspace-owned; composite FKs defend graph integrity.

## Teaching continuity truth
Canonical continuity is `Class -> actual Meeting -> optional Lesson -> optional exact LessonVersion -> Checkpoint(s)`. Today may also use an append-only `continuity_baseline` as a forward re-entry fact; a baseline does not rewrite or delete old Meeting/Checkpoint history.

A browser/session is not a Meeting. `meetings.status` carries the explicit lifecycle `planned | in_progress | completed | cancelled | archived`; R3.4 runtime uses an actual `in_progress` Meeting for the active teaching occurrence. At most one in-progress Meeting may exist per Workspace × Class. Completing/cancelling preserves the row as history; a later Start creates a new Meeting identity.

Checkpoint is append-only continuity data with deterministic positive `sequence_no`, required nonblank `stopped_at`, optional nonblank `next_step`, and canonical `recorded_at`. Latest continuity is reconstructed from canonical history plus any newer durable local Safe Work overlay, not from React state.

## Pacing truth
`lesson_pacing_plans` is one canonical teacher pacing judgement per Workspace × Class × Lesson, optionally pinned to an exact immutable LessonVersion. It stores Normal Meetings, Available Meetings, Correction reserve, CORE/Practice/Stretch targets, Minimum Exit Criteria, optional explicit teacher mode override, and monotonic revision.

`Effective Meetings = Available Meetings - Correction reserve`. This is explicit teacher capacity, not a timetable derivation. Actual pacing evidence counts only `in_progress` / `completed` Meetings tied to the Class + Lesson; `planned`, `cancelled`, and `archived` Meeting rows never become actual evidence. CorrectionSession count is workflow pressure only and never academic evidence or an automatically guessed meeting cost.

Recommendation is deterministic `RELAXED | NORMAL | COMPRESSED`; explicit teacher override wins. COMPRESSED reduces breadth first: Stretch becomes DEFER_FIRST while CORE, Practice supporting comprehension, and Minimum Exit Criteria remain visible. Pacing does not rewrite LessonVersion content and does not auto-create homework.

## Assessment truth
ScoringProfile is an immutable-ruleset identity. Assessment is stable UUID identity with Class/Period and optional Activity/Profile. Result is one current interpreted outcome per Assessment × Enrollment with monotonic revision. Attempt is ordered preserved evidence with ORIGINAL/MAKEUP/REMEDIAL/CORRECTION kinds.

Result state/score laws: UNCHECKED/MISSING/EXCUSED have NULL score; GRADED has non-NULL numeric score, including 0 and negative values. Blank spreadsheet input maps to UNCHECKED/no judgement, never zero or Missing.

## Reporting truth
Reporting is derived, not a second gradebook. `reporting_policies` are versioned immutable semantic identities. R3.5 implements explicit `SIMPLE_MEAN` aggregation with policy-controlled Missing behavior (`EXCLUDE | ZERO`), fixed Remedial behavior (`CURRENT_RESULT`), rounding (`NONE | INTEGER | ONE_DECIMAL`), and an optional KKM threshold stored separately from arithmetic.

`Raw Evidence != Reported Outcome` remains a hard boundary. A REMEDIAL/MAKEUP/CORRECTION `assessment_attempts.raw_score` is preserved evidence and is never promoted automatically into a report score. Reporting consumes the current canonical interpreted `assessment_results.score`.

A snapshot source is materialized from one PostgreSQL statement so all enrollment rows see one committed MVCC source view. FINALIZED snapshot creation additionally serializes around canonical Class/Assessment/Result/Enrollment/Student source writes.

A `reporting_cycle` is one Class + Academic Period workflow identity with monotonic revision and `OPEN | FINALIZED` lifecycle. `report_snapshots` are append-only `PROVISIONAL | FINALIZED` calculations and `report_snapshot_rows` preserve stable Enrollment/Student IDs plus calculation evidence as it existed at snapshot time. `UNCHECKED` blocks Finalize. Reopen is explicit and audited; old snapshots remain untouched.

## Artifact truth
`Artifact != ArtifactVersion != ArtifactObject`.

`artifacts` carry stable teacher-document identity, status and monotonic revision. `artifact_versions` are append-only canonical document content with exact `MANUAL | LESSON_VERSION | REPORT_SNAPSHOT` provenance. Regeneration creates another version; it never rewrites historical canonical content.

`artifact_objects` are private binary metadata for one exact ArtifactVersion. A PENDING object has no SHA-256/confirmed timestamp. READY requires exact SHA-256, size and private Storage bytes. Storage paths are constrained to `workspace/artifact/version/...` scope. Archive prevents new versions/reservations but an already-reserved PENDING object may finish confirmation.

Source staleness is derived rather than written into history. Lesson-sourced staleness compares only newer LessonVersions for the same Lesson. Report-sourced staleness compares only newer ReportSnapshots in the same ReportingCycle.

## Portable recovery truth
Portable recovery is not a second canonical database. `export_portable_backup()` serializes the signed-in owner's known canonical graph; the browser adds exact READY ArtifactObject bytes and a whole-manifest SHA-256.

Restore is target-empty-only. Stable domain UUIDs survive; the target Workspace identity is newly owned by the signed-in target account. Workspace-owned rows are remapped to that target Workspace, circular current pointers are reattached after append-only child rows exist, and ArtifactObject storage paths are rewritten into target scope.

ArtifactObject metadata is restored as PENDING even when the source object was READY. The browser rereads target metadata, uploads the verified bytes to the rewritten target path, and only then uses the normal confirmation RPC to restore READY truth.

`applied_operations` are deliberately not portable. They are retry/idempotency metadata, not academic history. A recovered workspace starts a fresh retry ledger containing the deterministic `recovery.restore` operation and any later target-side writes/confirmations. `audit_events` remain portable history.

## Spreadsheet identity
Spreadsheet row != Student identity and header != Assessment identity. The owned template carries `Assessment_ID` and `Enrollment_ID`; NIS/NISN/name are teacher-readable/supporting identity only. Duplicate names are legal. Ambiguous or unmatched rows never commit. Spreadsheet data is untrusted input and never canonical storage.

## Applied operations
`meeting.start`, `meeting.status`, and `meeting.checkpoint` are R3.4 idempotency records. Start targets a Class and records the canonical Meeting identity in result metadata. Checkpoint targets a Meeting and uses result revision as the committed sequence number. Same op_id with changed scope/payload fails closed.

`continuity.baseline` appends Quick Update / Start From Today re-entry facts. `teaching.pacing-plan` performs revision-checked Class + Lesson pacing writes. Neither operation rewrites immutable LessonVersion history.

`assessment.judgement` remains the rapid single-Result operation. `assessment.bulk` uses one stable batch op_id targeting one Assessment; request metadata contains the exact canonical batch payload and result metadata stores deterministic summary.

`reporting.policy-create`, `reporting.snapshot`, and `reporting.reopen` are idempotent R3.5 operations. Artifact create/version/archive/object operations are idempotent and lost-ACK safe. `recovery.restore` is deterministic for one verified manifest and target workspace.

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
-> r3.4-today-reentry.1
-> r3.4-pacing-final.1
-> r3.5-reporting-core.1
-> r3.5-artifact-core.1
-> r3.5-artifact-core.2
-> r3.5-artifact-core.3
-> r3.6-recovery.1
```
Migrations remain append-only.
