# Architecture

Nilai SMP R3 remains React/Vite -> Supabase canonical operational truth -> Cloudflare static delivery. Personal Workspace remains the ownership boundary enforced by PostgreSQL/RLS.

## R3.2 Safe Work layer
Dexie wraps browser IndexedDB as temporary durable recovery state. It is not a canonical academic database, replica, backup, or full-offline subsystem. UI state, local durable state and server canonical state are distinct.

The only R3.2 proof mutation is revision-checked Student rename. Client enqueue commits locally before `PENDING SAFE`. The sync worker then calls one narrow Supabase RPC. The RPC derives ownership from `auth.uid()`, locks the Student row, checks expected revision, updates name/revision/updated_at and inserts `applied_operations` in the same PostgreSQL transaction. No service-role credential is exposed.
