#!/usr/bin/env bash
set -euo pipefail
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"; PSQL=(psql "$DB_URL" -X -v ON_ERROR_STOP=1)
pass(){ printf 'PASS: %s\n' "$1"; }; fail(){ printf 'FAIL: %s\n' "$1" >&2; exit 1; }; run(){ "${PSQL[@]}" -qAtc "$1"; }
expect_value(){ local label="$1" sql="$2" expected="$3" actual; actual="$(run "$sql")"; [[ "$actual" == "$expected" ]] || fail "$label (expected '$expected', got '$actual')"; pass "$label"; }
expect_fail(){ local label="$1" sql="$2"; if "${PSQL[@]}" -qc "$sql" >/tmp/nilai-db-out 2>/tmp/nilai-db-err; then fail "$label (unexpected success)"; fi; pass "$label"; }

"${PSQL[@]}" -f supabase/migrations/202609040004_assessment_core.sql >/dev/null
A="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\",\"role\":\"authenticated\"}';"
B="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}';"
ANON="set role anon; set request.jwt.claims = '{\"role\":\"anon\"}';"
AW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000a')"
BW="(select id from public.workspaces where owner_user_id='00000000-0000-0000-0000-00000000000b')"
PROFILE="91000000-0000-0000-0000-000000000001"; PROFILE2="91000000-0000-0000-0000-000000000002"; ASSESS="92000000-0000-0000-0000-000000000001"; ASSESS_ACT="92000000-0000-0000-0000-000000000002"; ENROLL="50000000-0000-0000-0000-000000000001"; ACT="76000000-0000-0000-0000-000000000001"

expect_value 'owned ScoringProfile accepts negative rule semantics' "$A insert into public.scoring_profiles(id,workspace_id,name,config) values('$PROFILE',$AW,'Benar Salah','{\"correct\":10,\"wrong\":-5,\"blank\":0}'); select config->>'wrong' from public.scoring_profiles where id='$PROFILE';" '-5'
expect_fail 'ScoringProfile ruleset cannot be rewritten in place' "$A update public.scoring_profiles set config='{\"correct\":20,\"wrong\":-10,\"blank\":0}' where id='$PROFILE';"
expect_value 'rejected rewrite preserves original scoring rules' "$A select config->>'wrong' from public.scoring_profiles where id='$PROFILE';" '-5'
expect_value 'Assessment exists independently without Activity' "$A insert into public.assessments(id,workspace_id,class_id,academic_period_id,scoring_profile_id,title) values('$ASSESS',$AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','$PROFILE','Kuis GLB'); select (activity_id is null)::text from public.assessments where id='$ASSESS';" 'true'
expect_value 'optional owned Activity relationship is valid' "$A insert into public.assessments(id,workspace_id,class_id,academic_period_id,activity_id,title) values('$ASSESS_ACT',$AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','$ACT','Praktik GLB'); select activity_id from public.assessments where id='$ASSESS_ACT';" "$ACT"
expect_value 'Assessment stable UUID identity round-trips' "$A select id from public.assessments where title='Kuis GLB';" "$ASSESS"

expect_value 'unchecked is explicit null-score truth' "$A select state||':'||coalesce(score::text,'NULL') from public.record_assessment_judgement('$ASSESS','$ENROLL','UNCHECKED',null,null,null,'{}');" 'UNCHECKED:NULL'
expect_value 'zero is a real graded score' "$A select state||':'||score from public.record_assessment_judgement('$ASSESS','$ENROLL','GRADED',0,'ORIGINAL',0,'{\"source\":\"paper\"}');" 'GRADED:0'
expect_value 'atomic RPC committed Result and ORIGINAL evidence together' "$A select r.state||':'||r.score||':'||count(a.id) from public.assessment_results r join public.assessment_attempts a on a.result_id=r.id where r.assessment_id='$ASSESS' and r.enrollment_id='$ENROLL' group by r.state,r.score;" 'GRADED:0:1'
expect_value 'ORIGINAL raw evidence preserved' "$A select attempt_kind||':'||raw_score from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL') order by sequence_no;" 'ORIGINAL:0'
expect_value 'ORIGINAL evidence records scoring ruleset identity' "$A select scoring_profile_id from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL') and sequence_no=1;" "$PROFILE"
expect_value 'negative score accepted without 0..100 constraint' "$A select state||':'||score from public.record_assessment_judgement('$ASSESS','$ENROLL','GRADED',-5,'CORRECTION',-5,'{}');" 'GRADED:-5'
expect_value 'MISSING is explicit and not zero' "$A select state||':'||coalesce(score::text,'NULL') from public.record_assessment_judgement('$ASSESS','$ENROLL','MISSING',null,null,null,'{}');" 'MISSING:NULL'
expect_value 'EXCUSED is explicit and not zero' "$A select state||':'||coalesce(score::text,'NULL') from public.record_assessment_judgement('$ASSESS','$ENROLL','EXCUSED',null,null,null,'{}');" 'EXCUSED:NULL'
run "$A select * from public.record_assessment_judgement('$ASSESS','$ENROLL','GRADED',7,'MAKEUP',7,'{}');" >/dev/null
expect_value 'MAKEUP evidence is distinct and original remains' "$A select string_agg(attempt_kind,',' order by sequence_no) from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL');" 'ORIGINAL,CORRECTION,MAKEUP'
run "$A select * from public.record_assessment_judgement('$ASSESS','$ENROLL','GRADED',8,'REMEDIAL',8,'{}');" >/dev/null
expect_value 'REMEDIAL evidence is distinct from MAKEUP' "$A select string_agg(attempt_kind,',' order by sequence_no) from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL');" 'ORIGINAL,CORRECTION,MAKEUP,REMEDIAL'
expect_value 'new scoring semantics require a new profile identity' "$A insert into public.scoring_profiles(id,workspace_id,name,config) values('$PROFILE2',$AW,'Benar Salah v2','{\"correct\":20,\"wrong\":-10,\"blank\":0}'); update public.assessments set scoring_profile_id='$PROFILE2' where id='$ASSESS'; select scoring_profile_id from public.assessments where id='$ASSESS';" "$PROFILE2"
run "$A select * from public.record_assessment_judgement('$ASSESS','$ENROLL','GRADED',20,'CORRECTION',20,'{}');" >/dev/null
expect_value 'new evidence records new scoring ruleset identity' "$A select scoring_profile_id from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL') order by sequence_no desc limit 1;" "$PROFILE2"
expect_value 'historical evidence remains reconstructable after Assessment changes profile' "$A select string_agg(a.sequence_no::text || ':' || (p.config ->> 'wrong'),',' order by a.sequence_no) from public.assessment_attempts a left join public.scoring_profiles p on p.workspace_id=a.workspace_id and p.id=a.scoring_profile_id where a.result_id=(select id from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL');" '1:-5,2:-5,3:-5,4:-5,5:-10'
expect_value 'one current Result survives repeated judgements' "$A select count(*) from public.assessment_results where assessment_id='$ASSESS' and enrollment_id='$ENROLL';" '1'
expect_fail 'database uniqueness prevents duplicate current Result' "insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,state) values($AW,'$ASSESS','$ENROLL','30000000-0000-0000-0000-000000000001','UNCHECKED');"
expect_fail 'state GRADED cannot use blank score' "insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,state,score) values($AW,'$ASSESS','50000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000001','GRADED',null);"

BSTUDENT="93000000-0000-0000-0000-000000000001"; BENROLL="94000000-0000-0000-0000-000000000001"; BPROFILE="95000000-0000-0000-0000-000000000001"; BACT="96000000-0000-0000-0000-000000000001"; BASSESS="97000000-0000-0000-0000-000000000001"
run "$B insert into public.students(id,workspace_id,display_name) values('$BSTUDENT',$BW,'B Student'); insert into public.enrollments(id,workspace_id,student_id,class_id) values('$BENROLL',$BW,'$BSTUDENT','83000000-0000-0000-0000-000000000001'); insert into public.scoring_profiles(id,workspace_id,name) values('$BPROFILE',$BW,'B Profile'); insert into public.activities(id,workspace_id,class_id,title) values('$BACT',$BW,'83000000-0000-0000-0000-000000000001','B Activity'); insert into public.assessments(id,workspace_id,class_id,academic_period_id,title) values('$BASSESS',$BW,'83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','B Assessment'); select * from public.record_assessment_judgement('$BASSESS','$BENROLL','GRADED',5,'ORIGINAL',5,'{}');" >/dev/null
expect_fail 'Assessment cannot compose foreign Class' "$A insert into public.assessments(workspace_id,class_id,academic_period_id,title) values($AW,'83000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','attack');"
expect_fail 'Assessment cannot compose foreign ScoringProfile' "$A insert into public.assessments(workspace_id,class_id,academic_period_id,scoring_profile_id,title) values($AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','$BPROFILE','attack');"
expect_fail 'Assessment cannot compose foreign Activity' "$A insert into public.assessments(workspace_id,class_id,academic_period_id,activity_id,title) values($AW,'30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','$BACT','attack');"
expect_fail 'Result RPC rejects foreign Enrollment' "$A select * from public.record_assessment_judgement('$ASSESS','$BENROLL','UNCHECKED',null,null,null,'{}');"
expect_fail 'database rejects Result composed from foreign Enrollment' "insert into public.assessment_results(workspace_id,assessment_id,enrollment_id,class_id,state) values($AW,'$ASSESS','$BENROLL','83000000-0000-0000-0000-000000000001','UNCHECKED');"
expect_fail 'database rejects Attempt composed from foreign Result' "insert into public.assessment_attempts(workspace_id,result_id,attempt_kind,sequence_no) values($AW,(select id from public.assessment_results where assessment_id='$BASSESS'),'CORRECTION',2);"
expect_value 'foreign user UPDATE of A Assessment affects zero' "$B update public.assessments set title='stolen' where id='$ASSESS'; select count(*) from public.assessments where id='$ASSESS';" '0'
expect_value 'A Assessment unchanged after foreign UPDATE' "$A select title from public.assessments where id='$ASSESS';" 'Kuis GLB'
expect_value 'foreign user cannot read A Assessment' "$B select count(*) from public.assessments where id='$ASSESS';" '0'
expect_value 'foreign user cannot read A Result' "$B select count(*) from public.assessment_results where assessment_id='$ASSESS';" '0'
expect_value 'foreign user cannot read A Attempts' "$B select count(*) from public.assessment_attempts where result_id=(select id from public.assessment_results where assessment_id='$ASSESS');" '0'
expect_fail 'anonymous Assessment access denied' "$ANON select * from public.assessments;"
expect_fail 'anonymous Result access denied' "$ANON select * from public.assessment_results;"
expect_fail 'browser cannot directly split Result write from Attempt write' "$A insert into public.assessment_attempts(workspace_id,result_id,attempt_kind,sequence_no) values($AW,(select id from public.assessment_results where assessment_id='$ASSESS'),'CORRECTION',99);"
expect_value 'schema version is Assessment Core' "$A select version from public.app_schema_version where id=1;" 'r3.3-assessment-core.1'

printf '\nR3.3 Assessment Core database contract attack matrix completed successfully.\n'
