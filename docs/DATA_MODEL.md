# Data Model

R3.1 academic spine remains authoritative: Workspace -> Academic Year -> Academic Period -> Class -> Enrollment <- Student.

## R3.2 additions
`students.revision bigint` starts at 1. The Student rename proof increments revision and server-controls `updated_at` inside the RPC.

`applied_operations` is workspace-scoped idempotency metadata: stable `op_id`, operation type, target identity, result revision/metadata and applied timestamp. It is not an academic event store. RLS allows owners to read only their workspace ledger; browser writes occur only through the narrow ownership-validating RPC.

Local Dexie operations are recovery records, not canonical entities. They contain the minimum mutation payload and are deleted after confirmed server save.
