#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err; then fail "$label (unexpected success)"; fi; pass "$label"; }
"${PSQL[@]}" -f tests/database/bootstrap_supabase_compat.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609030001_foundation_schema_version.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040001_academic_spine.sql >/dev/null
"${PSQL[@]}" -f tests/database/seed_owned_data.sql >/dev/null
"${PSQL[@]}" -f supabase/migrations/202609040002_safe_work_engine.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
expect_value 'A reads own students' "$A select count(*) from public.students;" '2'
expect_value 'B cannot read A students' "$B select count(*) from public.students;" '0'
expect_fail 'anonymous applied-operation read denied' "$ANON select * from public.applied_operations;"
OP="60000000-0000-0000-0000-000000000001"; STUDENT="40000000-0000-0000-0000-000000000001"
expect_value 'first rename applies revision N+1' "$A select outcome||':'||revision||':'||replayed from public.apply_student_rename_operation('$OP','$STUDENT','Budi Baru',1);" 'saved:2:false'
expect_value 'business mutation applied once' "$A select display_name||':'||revision from public.students where id='$STUDENT';" 'Budi Baru:2'
expect_value 'lost ACK retry returns prior success' "$A select outcome||':'||revision||':'||replayed from public.apply_student_rename_operation('$OP','$STUDENT','Budi Baru',1);" 'saved:2:true'
expect_value 'lost ACK retry did not increment twice' "$A select revision from public.students where id='$STUDENT';" '2'
expect_value 'ledger contains exactly one operation' "$A select count(*) from public.applied_operations where op_id='$OP';" '1'
expect_fail 'same op id cannot be reused with changed payload' "$A select * from public.apply_student_rename_operation('$OP','$STUDENT','Tampered',1);"
expect_value 'stale revision becomes conflict' "$A select outcome||':'||revision from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000002','$STUDENT','Stale',1);" 'conflict:2'
expect_value 'conflict did not overwrite server' "$A select display_name||':'||revision from public.students where id='$STUDENT';" 'Budi Baru:2'
expect_fail 'B cannot mutate A student through privileged RPC' "$B select * from public.apply_student_rename_operation('60000000-0000-0000-0000-000000000003','$STUDENT','Stolen',2);"
expect_value 'B cannot see A applied ledger' "$B select count(*) from public.applied_operations;" '0'
expect_value 'schema version is R3.2' "$A select version from public.app_schema_version where id=1;" 'r3.2-safe-work.1'
printf '\nR3.2 database contract attack matrix completed successfully.\n'
