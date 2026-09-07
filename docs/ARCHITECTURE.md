# Architecture

## Status
R3.0 Foundation, R3.1 Academic Spine + Teaching Core, R3.2 Safe Work, R3.3 Assessment Core/Rapid Correction/Bulk Assessment, R3.4 Teaching Continuity/Today/Pacing, R3.5 Reporting + Artifacts, R3.6 portable Recovery Core, and R3.7 Daily Driver + production-artifact E2E are implemented and closed on `main`.

Exact R3 closure main is `aaebd50ab6ffd5fd0ab71faa6e92b534ad90dd66`; exact-main verify-foundation run #284 passed the full verification chain. Current schema compatibility remains `r3.6-recovery.1` because R3.7 is schema-neutral.

Production readiness is now a separate operational program governed by `PRODUCTION_READINESS.md`. Legacy migration is conditional on whether historical Streamlit data must cross cutover. Collaboration, AI, full offline, schedule automation, automatic homework, gamification, and generic global search are not prerequisites for first production and are governed by `FUTURE_ROADMAP.md`.

## Target boundaries
```text
Browser / React + Vite
  Today dispatcher -> bounded owned read model + local Safe Work summary
  Teaching Continuity -> canonical Meeting read model
    Start/Complete/Cancel -> narrow idempotent Meeting RPCs
    Checkpoint -> Dexie Pending Safe -> narrow checkpoint RPC
    Pacing -> owned revisioned plan RPC
  Rapid Correction -> Dexie Pending Safe -> narrow judgement RPC
  Bulk Entry / XLSX -> local Preview -> online atomic bulk RPC
  Reporting -> versioned policy -> provisional/finalized append-only snapshot RPC
  Artifacts -> stable Artifact -> append-only ArtifactVersion -> private ArtifactObject
  Recovery -> owned portable export -> checksum -> restore-to-empty -> artifact byte confirmation
    Supabase browser client
      Auth + Data API + narrow RPCs + private Storage
        PostgreSQL + RLS + constraints
          Class -> actual Meeting -> optional Lesson/LessonVersion -> Checkpoint(s)
          canonical Assessment -> Result -> optional Attempt
          ReportingPolicy -> ReportingCycle -> ReportSnapshot -> rows
          Artifact -> ArtifactVersion -> ArtifactObject metadata
          applied_operations idempotency metadata
Delivery: Cloudflare Workers Static Assets
```
Supabase/PostgreSQL is canonical operational truth. UI sessions, spreadsheet files and Dexie are not canonical teaching/academic databases. Supabase Storage is a private binary object store referenced by canonical ArtifactObject metadata; Storage itself does not define document identity or provenance.

## Production boundary
The repository now proves the production artifact separately from source-instrumented browser torture, but hosted production truth is not inferred from CI. Real hosted Supabase Auth/RLS/private Storage, real Artifact byte transfer, portable backup/restore against hosted services, Cloudflare deployment, deployed mobile/desktop smoke, and known-good rollback remain explicit pre-cutover gates.

Cloudflare remains presentation delivery only. First production does not require Worker-side state, D1, KV, Durable Objects, queues, or a second academic backend.

## Ownership and compatibility
`auth.users -> workspaces -> all protected records` remains the ownership root. RLS derives `auth.uid()` and workspace-aware FKs reject cross-workspace composition. Narrow RPCs accept no browser-supplied workspace owner. Browser code receives no elevated credential. Current compatibility is `r3.6-recovery.1`, owned by the ordered migration chain through portable recovery.

## Teaching continuity boundary
UI Session != Teaching Meeting. A Meeting is an actual teaching occurrence. Browser reload, route change, logout, component unmount and close/X do not change Meeting lifecycle. `start_teaching_meeting_operation()` serializes a Class start, enforces/reuses one `in_progress` Meeting, validates optional owned Lesson/LessonVersion context and records stable op-id replay metadata. The partial unique index on `(workspace_id,class_id)` for `status='in_progress'` is the database invariant behind the same rule.

`set_teaching_meeting_status_operation()` is the only authenticated browser mutation path for explicit Complete/Cancel. `apply_meeting_checkpoint_operation()` is the only authenticated browser mutation path for Checkpoint creation. Direct authenticated mutation of `meetings` and `checkpoints` is revoked while SELECT and RLS remain. Historical Meeting rows and Checkpoints therefore cannot be rewritten/deleted through the Data API outside the narrow SECURITY DEFINER contracts.

Continuity derivation separates current `activeMeeting`, chronological `latestActualMeeting`, and `latestMeaningfulCheckpoint`. LAST/NEXT means the latest known meaningful continuity fact, not merely a child of whichever Meeting is newest. Today uses bounded owned RPC reads rather than loading complete Teaching Core history. Stale re-entry creates append-only continuity baselines; it never fabricates missing Meetings.

## Checkpoint Safe Work and lifecycle safety
Checkpoint is append-only continuity evidence. `enqueueMeetingCheckpoint()` commits the operation into IndexedDB before the UI may say Pending Safe. The shared Safe Work worker retries on reconnect/auth recovery with the same op_id. `apply_meeting_checkpoint_operation()` serializes a Meeting checkpoint stream, derives sequence numbers, rejects invalid lifecycle state, and replays lost acknowledgements without duplicate rows. Saved means server-confirmed.

Same-account tabs coordinate Meeting lifecycle/checkpoint closure with the browser-native lock boundary already implemented. Local durability and server truth remain distinct; a read failure after a successful write must not relabel server-confirmed data as failed.

## Pacing boundary
Pacing is teacher-owned class+lesson intent, not timetable truth. `Effective Meetings = Available Meetings - Correction reserve`. Only actual in-progress/completed Meetings count as observation. Deterministic RELAXED/NORMAL/COMPRESSED recommendation remains subordinate to explicit teacher override. COMPRESSED reduces breadth before comprehension; CORE/Practice/Minimum Exit Criteria remain visible. Pacing never rewrites immutable LessonVersion content or auto-generates homework.

## Frozen academic graph
Student != Enrollment. Material != Lesson. Lesson != Meeting. Activity != Assessment. Assessment != Result. Result != Attempt. Result is one current interpreted outcome per Assessment × Enrollment; Attempt is ordered preserved evidence. `UNCHECKED | GRADED | MISSING | EXCUSED` are explicit; only GRADED carries score. Zero and negative numeric values remain valid structurally.

## Rapid Correction != Bulk Entry != Excel Import
Rapid Correction remains mobile/paper-first and may use Pending Safe. Bulk Entry is a desktop-enhanced one-Assessment roster workflow. Excel Import uses a Nilai SMP-owned XLSX template with Assessment_ID + Enrollment_ID stable identity, local bounded parsing and Preview/Validate. Display name never resolves identity by itself.

Bulk commit deliberately does not enter Dexie. `apply_assessment_bulk_operation()` requires connectivity, derives caller/workspace server-side, takes deterministic per-Result advisory locks, validates the whole batch and revisions, then atomically mutates Result + optional Attempt + one AppliedOperation ledger record. A stale row conflicts the whole batch; same op_id replay is idempotent; changed payload reuse fails closed.

## Reporting boundary
Reporting is a derived, explainable layer over canonical Result truth. ReportingPolicy is versioned. ReportSnapshot is append-only and either PROVISIONAL or FINALIZED. `UNCHECKED` blocks Finalize. Missing policy, rounding and KKM are explicit; raw Attempt evidence is not silently promoted to reported outcome. Finalization materializes one consistent canonical source and serializes against concurrent source writes. A finalized cycle can only continue after explicit audited Reopen, preserving older snapshots.

## Artifact boundary
Artifact is stable teacher-document identity. ArtifactVersion is append-only canonical document content with exact MANUAL, LessonVersion or ReportSnapshot provenance. ArtifactObject is private binary metadata for a specific version. Regeneration means append a new ArtifactVersion; an older canonical version and READY object are never overwritten.

Artifact source staleness is derived, never written back into historical ArtifactVersion rows. LessonVersion staleness is scoped to the same Lesson. ReportSnapshot staleness is scoped to the same ReportingCycle: an artifact sourced from snapshot N becomes stale only when a newer snapshot for that same cycle exists. A newer snapshot in another cycle or class does not invalidate the exact historical source.

Artifact object reservation is idempotent and workspace-owned. Object paths are workspace/artifact/version scoped. PDF/DOCX/OTHER MIME shape and 20 MB size limit are validated. A PENDING_UPLOAD object is not READY and has no checksum. READY requires SHA-256 + exact size. Storage upload uses `upsert:false`; an already-existing PENDING path is downloaded and byte-for-byte checked before confirmation, and confirmation reuses the object UUID as stable operation identity so a lost ACK replays prior success. The private Storage select policy exposes only the owner's PENDING/READY reserved object; browser UPDATE/DELETE is not granted.

## Recovery boundary
Portable recovery is product-level portability, not a claim that provider snapshots are sufficient. `export_portable_backup()` emits only the signed-in owner's canonical graph. The browser adds exact READY Storage bytes, validates per-object SHA-256 and a whole-manifest checksum, and can emit a separate XLSX human escape view.

`restore_portable_backup_operation()` is all-or-nothing for canonical rows and is allowed only when the target personal workspace is empty. Stable domain UUIDs remain stable while workspace ownership is remapped to the authenticated account. Circular current pointers are restored only after append-only history exists. ArtifactObject metadata is rewritten into the target workspace/artifact/version storage scope and comes back as PENDING_UPLOAD; the browser rereads those target paths before restoring exact bytes with `upsert:false` and the existing confirmation RPC. A deterministic operation id derived from the verified manifest makes lost-ACK restore replayable rather than duplicative.

AppliedOperation rows from the source are intentionally not portable academic history. The target starts a fresh idempotency ledger containing the recovery operation and later target-side confirmations, preventing old successful object-confirm operations from replaying against newly PENDING restored metadata.

## Future schedule boundary
If a planned timetable is added after production, it must remain an expectation layer. A planned slot may help Today suggest a likely Class, but it must never create, complete, cancel, or otherwise fabricate an actual Meeting. Explicit `Start Class` remains the boundary that creates/reuses actual teaching occurrence truth.

## Future AI boundary
If Teacher Brief/AI is added, deterministic bounded canonical context must exist independently of the provider. AI output is advisory/draft content and receives no authority to mutate Meeting, Checkpoint, Result, Attempt, finalized reporting, Student/Enrollment identity, or historical ArtifactVersion state. Saved AI-assisted documents must use normal append-only Artifact provenance.

## Legacy
`legacy/streamlit/` remains read-only behavior/source evidence and cannot redefine R3 canonical identities or architecture.

Legacy migration is a **conditional cutover concern**, not unfinished R3 implementation. If historical data is not required, preserve the legacy source/archive and cut over without promoting migration to a blocker. If historical data must cross cutover, migration requires its own extract -> normalize -> validate -> dry-run -> migrate -> reconcile proof and becomes a cutover gate. Indefinite dual-writing between legacy and R3 is forbidden.
