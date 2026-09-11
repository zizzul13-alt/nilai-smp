import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/202609110001_f1_planned_timetable.sql','utf8');
const contract=readFileSync('docs/F1_PLANNED_TIMETABLE_CONTRACT.md','utf8');

function normalized(input:string){return input.replace(/\s+/g,' ').toLowerCase();}

describe('F1 planned timetable schema contract',()=>{
  it('keeps planned schedule distinct from actual meeting truth',()=>{
    expect(contract).toContain('PLANNED SLOT != ACTUAL MEETING');
    expect(migration).toContain('create table public.planned_schedules');
    expect(migration).not.toContain('insert into public.meetings');
    expect(migration).not.toContain('create trigger');
  });

  it('uses local wall-clock bounded schedule semantics',()=>{
    const sql=normalized(migration);
    expect(sql).toContain('weekday smallint not null check (weekday between 1 and 7)');
    expect(sql).toContain('local_start_time time not null');
    expect(sql).toContain('local_end_time time not null');
    expect(sql).toContain('effective_from date not null');
    expect(sql).toContain('effective_until date');
    expect(sql).toContain('local_start_time < local_end_time');
    expect(sql).toContain('effective_until is null or effective_from <= effective_until');
  });

  it('enforces same-workspace class identity and exact-active duplicate protection',()=>{
    const sql=normalized(migration);
    expect(sql).toContain('foreign key (workspace_id, class_id) references public.classes(workspace_id, id)');
    expect(sql).toContain('create unique index planned_schedules_exact_active_unique');
    expect(sql).toContain("where status = 'active'");
  });

  it('keeps owner RLS and previous frontend rollback compatibility',()=>{
    const sql=normalized(migration);
    expect(sql).toContain('alter table public.planned_schedules enable row level security');
    expect(sql).toContain('revoke all on public.planned_schedules from anon');
    expect(sql).toContain('create policy planned_schedule_owner_all');
    expect(sql).toContain('w.owner_user_id = auth.uid()');
    expect(sql).not.toContain('insert into public.app_schema_version');
  });
});
