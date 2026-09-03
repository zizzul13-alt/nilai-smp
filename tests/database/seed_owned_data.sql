set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.bootstrap_personal_workspace();
select public.bootstrap_personal_workspace();
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select public.bootstrap_personal_workspace();
reset role;

-- User A canonical data. Fixed IDs make attack cases deterministic.
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.academic_years(id, workspace_id, identity_key, display_name, sort_order)
select '10000000-0000-0000-0000-000000000001', id, '2026-2027', '2026/2027', 1 from public.workspaces;
insert into public.academic_periods(id, workspace_id, academic_year_id, identity_key, display_name, sort_order)
select '20000000-0000-0000-0000-000000000001', id, '10000000-0000-0000-0000-000000000001', 's1', 'Semester 1', 1 from public.workspaces;
insert into public.academic_periods(id, workspace_id, academic_year_id, identity_key, display_name, sort_order)
select '20000000-0000-0000-0000-000000000002', id, '10000000-0000-0000-0000-000000000001', 's2', 'Semester 2', 2 from public.workspaces;
insert into public.classes(id, workspace_id, academic_period_id, identity_key, display_name)
select '30000000-0000-0000-0000-000000000001', id, '20000000-0000-0000-0000-000000000001', 'viii-a', 'VIII A' from public.workspaces;
-- Same class identity is legitimate in another period.
insert into public.classes(id, workspace_id, academic_period_id, identity_key, display_name)
select '30000000-0000-0000-0000-000000000002', id, '20000000-0000-0000-0000-000000000002', 'viii-a', 'VIII A' from public.workspaces;
-- Duplicate student names are intentionally legitimate.
insert into public.students(id, workspace_id, display_name)
select '40000000-0000-0000-0000-000000000001', id, 'Budi' from public.workspaces;
insert into public.students(id, workspace_id, display_name)
select '40000000-0000-0000-0000-000000000002', id, 'Budi' from public.workspaces;
insert into public.enrollments(id, workspace_id, student_id, class_id)
select '50000000-0000-0000-0000-000000000001', id, '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001' from public.workspaces;
reset role;
