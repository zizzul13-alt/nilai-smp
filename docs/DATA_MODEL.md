# Data Model

## Status

**R3.1 CANONICAL ACADEMIC SPINE IMPLEMENTED; R3.2 SAFE WORK METADATA IMPLEMENTED.** Future teaching, assessment, reporting, artifact, backup, migration, and full-offline domains remain unimplemented.

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
       -> applied_operations   (R3.2 idempotency metadata, not academic history)
```

`workspaces` is the canonical personal ownership root. Every protected academic record stores `workspace_id`. Parent/child relationships use workspace-aware composite foreign keys where a cross-workspace reference would otherwise be possible.

## Implemented R3.1 entities

- **Workspace:** one idempotently provisioned personal workspace per authenticated owner. The schema does not add collaborators, invitations, roles, or school hierarchy.
- **Academic Year:** workspace-owned identity with display name, deterministic `sort_order`, optional dates, and `planned | active | archived` lifecycle.
- **Academic Period:** explicit child identity under one Academic Year, independently ordered within its year. It is not an alias for Academic Year.
- **Class:** belongs to one Academic Period. Class identity is unique only inside that period, so `VIII A` can legitimately recur in another semester/year.
- **Student:** workspace-scoped person identity with stable UUID. Names are mutable and deliberately non-unique. Optional NIS/NISN values are nullable; when present each is unique inside a workspace.
- **Enrollment:** stable Student-in-Class relationship with lifecycle `active | withdrawn | completed | archived`. Student and Class are explicit FKs and must belong to the same workspace. Student identity is never deleted merely because an enrollment ends.

## R3.2 additions

`students.revision bigint` starts at 1. The Student rename proof increments revision and server-controls `updated_at` inside the RPC. Revision exists here to prove stale-write conflict handling; R3.2 does not prematurely add later-domain entities.

`applied_operations` is workspace-scoped idempotency metadata: stable `op_id`, operation type, target identity, request metadata, result revision/metadata, and applied timestamp. It is not an academic event store or surveillance/audit log. RLS allows owners to read only their workspace ledger; browser writes occur only through the narrow ownership-validating RPC.

Local Dexie operations are recovery records, not canonical entities. They contain the minimum mutation payload and operational metadata. `PENDING_SAFE` is automatic sync work; `FAILED` and `CONFLICT` remain durable until explicit recovery/resolution. Confirmed server save removes the local operation payload.

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

All database changes belong in ordered SQL files under `supabase/migrations/`. R3.1 creates the complete spine, constraints, indexes, RLS and bootstrap RPC before advancing schema compatibility. R3.2 then adds Student revision semantics, `applied_operations`, and the narrow Safe Work RPC before advancing `app_schema_version` to `r3.2-safe-work.1` as its final operation.
