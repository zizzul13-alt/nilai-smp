# Architecture

## Status
R3.0 Foundation, R3.1 Academic Spine + Teaching Core, R3.2 Safe Work, R3.3 Assessment Core/Rapid Correction/Bulk Assessment and R3.4 Teaching Continuity Core are implemented. Full Today dispatcher, pacing, reporting/finalization, artifacts, backup/restore implementation, legacy migration, collaboration, AI and full offline remain out of scope.

## Target boundaries
```text
Browser / React + Vite
  Teaching Continuity -> canonical Meeting read model
    Start/Complete/Cancel -> narrow idempotent Meeting RPCs
    Checkpoint -> Dexie Pending Safe -> narrow checkpoint RPC
  Rapid Correction -> Dexie Pending Safe -> narrow judgement RPC
  Bulk Entry / XLSX -> local Preview -> online atomic bulk RPC
    Supabase browser client
      Auth + Data API + narrow RPCs
        PostgreSQL + RLS + constraints
          Class -> actual Meeting -> optional Lesson/LessonVersion -> Checkpoint(s)
          canonical Assessment -> Result -> optional Attempt
          applied_operations idempotency metadata
Delivery: Cloudflare Workers Static Assets
```
Supabase/PostgreSQL is canonical operational truth. UI sessions, spreadsheet files and Dexie are not canonical teaching/academic databases.

## Ownership and compatibility
`auth.users -> workspaces -> all protected records` remains the ownership root. RLS derives `auth.uid()` and workspace-aware FKs reject cross-workspace composition. New continuity RPCs accept no browser-supplied workspace owner. Browser code receives no elevated credential. Compatibility remains `r3.4-continuity-core.1`; the R3.4 repair migrations harden the same package rather than inventing a new schema generation.

## Teaching continuity boundary
UI Session != Teaching Meeting. A Meeting is an actual teaching occurrence. Browser reload, route change, logout, component unmount and close/X do not change Meeting lifecycle. `start_teaching_meeting_operation()` serializes a Class start, enforces/reuses one `in_progress` Meeting, validates optional owned Lesson/LessonVersion context and records stable op-id replay metadata. The partial unique index on `(workspace_id,class_id)` for `status='in_progress'` is the database invariant behind the same rule.

`set_teaching_meeting_status_operation()` is the only authenticated browser mutation path for explicit Complete/Cancel. `apply_meeting_checkpoint_operation()` is the only authenticated browser mutation path for Checkpoint creation. The repair migration revokes authenticated direct INSERT/UPDATE/DELETE on `meetings` and `checkpoints` while retaining SELECT and all existing RLS. Historical Meeting rows and Checkpoints therefore cannot be rewritten/deleted through the Data API outside the narrow SECURITY DEFINER contracts.

Continuity derivation separates three concepts: current `activeMeeting`, chronological `latestActualMeeting`, and `latestMeaningfulCheckpoint`. LAST/NEXT means the latest known meaningful continuity checkpoint, not merely a child of whichever Meeting is newest. A newly started empty Meeting therefore remains IN PROGRESS without erasing the prior checkpoint anchor; once the active Meeting gains a checkpoint, that active checkpoint supersedes older continuity. A newer cancelled Meeting with no checkpoint likewise cannot hide earlier meaningful continuity.

## Checkpoint Safe Work and multi-tab lifecycle safety
Checkpoint is append-only continuity evidence. `enqueueMeetingCheckpoint()` commits the operation into IndexedDB before the UI may say Pending Safe. The shared Safe Work worker retries on reconnect/auth recovery with the same op_id. `apply_meeting_checkpoint_operation()` serializes a Meeting checkpoint stream, derives `sequence_no=max+1`, rejects blank `stopped_at`, rejects writes to non-active Meetings, and replays lost acknowledgements without duplicate rows. Saved means server-confirmed.

Same-account tabs coordinate with a browser-native per-Meeting Web Lock. Checkpoint durable enqueue and lifecycle close use the same lock name. Complete/Cancel holds that lock while it re-reads the durable IndexedDB queue and, only when no unsynced checkpoint exists, invokes the lifecycle RPC. BroadcastChannel/storage notifications refresh stale recovery UI across tabs, but notifications are advisory; the fresh IndexedDB preflight under the lock is the safety decision.

Checkpoint UI safety and continuity-read availability are separate. A durable enqueue may truthfully be Pending Safe even if sync/read refresh fails. A minimized local operation after sync means Saved/server-confirmed; a later continuity read failure must not downgrade that Saved state. FAILED and CONFLICT render from persisted operation status.

## Frozen academic graph
Student != Enrollment. Material != Lesson. Lesson != Meeting. Activity != Assessment. Assessment != Result. Result != Attempt. Result is one current interpreted outcome per Assessment × Enrollment; Attempt is ordered preserved evidence. `UNCHECKED | GRADED | MISSING | EXCUSED` are explicit; only GRADED carries score. Zero and negative numeric values remain valid structurally.

## Rapid Correction != Bulk Entry != Excel Import
Rapid Correction remains mobile/paper-first and may use Pending Safe. Bulk Entry is a desktop-enhanced one-Assessment roster workflow. Excel Import uses a Nilai SMP-owned XLSX template with Assessment_ID + Enrollment_ID stable identity, local bounded parsing and Preview/Validate. Display name never resolves identity by itself.

Bulk commit deliberately does not enter Dexie. `apply_assessment_bulk_operation()` requires connectivity, derives caller/workspace server-side, takes deterministic per-Result advisory locks, validates the whole batch and revisions, then atomically mutates Result + optional Attempt + one AppliedOperation ledger record. A stale row conflicts the whole batch; same op_id replay is idempotent; changed payload reuse fails closed.

## Legacy
`legacy/streamlit/` remains behavior evidence only and cannot redefine R3 canonical identities or architecture.
