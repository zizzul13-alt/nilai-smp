# Architecture

## Status
R3.0 Foundation, R3.1 Academic Spine + Teaching Core, R3.2 Safe Work, R3.3 Assessment Core, Rapid Correction and Bulk Assessment are implemented. Reporting/finalization, Today/Continue, artifacts, backup/restore implementation, legacy migration, collaboration, AI and full offline remain out of scope.

## Target boundaries
```text
Browser / React + Vite
  Rapid Correction -> Dexie Pending Safe -> narrow judgement RPC
  Bulk Entry / XLSX -> local Preview -> online atomic bulk RPC
    Supabase browser client
      Auth + Data API + narrow RPCs
        PostgreSQL + RLS + constraints
          canonical Assessment -> Result -> optional Attempt
          applied_operations idempotency metadata
Delivery: Cloudflare Workers Static Assets
```
Supabase/PostgreSQL is canonical operational truth. Spreadsheet files and Dexie are not academic databases.

## Ownership and compatibility
`auth.users -> workspaces -> all protected records` remains the ownership root. RLS derives `auth.uid()` and workspace-aware FKs reject cross-workspace composition. Browser code receives no elevated credential. Compatibility is `r3.3-bulk-assessment.1` and startup fails closed on mismatch.

## Frozen academic graph
Student != Enrollment. Material != Lesson. Lesson != Meeting. Activity != Assessment. Assessment != Result. Result != Attempt. Result is one current interpreted outcome per Assessment × Enrollment; Attempt is ordered preserved evidence. `UNCHECKED | GRADED | MISSING | EXCUSED` are explicit; only GRADED carries score. Zero and negative numeric values remain valid structurally.

## Rapid Correction != Bulk Entry != Excel Import
Rapid Correction remains mobile/paper-first and may use Pending Safe. Bulk Entry is a desktop-enhanced one-Assessment roster workflow. Excel Import uses a Nilai SMP-owned XLSX template with Assessment_ID + Enrollment_ID stable identity, local bounded parsing and Preview/Validate. Display name never resolves identity by itself.

Bulk commit deliberately does not enter Dexie. `apply_assessment_bulk_operation()` requires connectivity, derives caller/workspace server-side, takes deterministic per-Result advisory locks, validates the whole batch and revisions, then atomically mutates Result + optional Attempt + one AppliedOperation ledger record. A stale row conflicts the whole batch; same op_id replay is idempotent; changed payload reuse fails closed.

## Legacy
`legacy/streamlit/` remains behavior evidence only and cannot redefine R3 canonical identities or architecture.
