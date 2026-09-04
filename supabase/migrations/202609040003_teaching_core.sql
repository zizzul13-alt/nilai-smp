-- R3.1 canonical Teaching Core. Extends the merged Academic Spine and preserves R3.2 Safe Work.

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_workspace_id_unique unique (workspace_id,id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  material_id uuid not null,
  title text not null check (btrim(title) <> ''),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_material_fk foreign key (workspace_id,material_id)
    references public.materials(workspace_id,id) on delete restrict,
  constraint lesson_workspace_id_unique unique (workspace_id,id)
);

create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  lesson_id uuid not null,
  version_number integer not null check (version_number >= 1),
  content_text text not null default '' check (length(content_text) <= 50000),
  created_at timestamptz not null default now(),
  constraint lesson_version_lesson_fk foreign key (workspace_id,lesson_id)
    references public.lessons(workspace_id,id) on delete restrict,
  constraint lesson_version_number_unique unique (workspace_id,lesson_id,version_number),
  constraint lesson_version_workspace_id_unique unique (workspace_id,id),
  constraint lesson_version_workspace_id_lesson_unique unique (workspace_id,id,lesson_id)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  lesson_id uuid,
  lesson_version_id uuid,
  occurred_at timestamptz not null,
  status text not null default 'completed' check (status in ('planned','in_progress','completed','cancelled','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_class_fk foreign key (workspace_id,class_id)
    references public.classes(workspace_id,id) on delete restrict,
  constraint meeting_lesson_fk foreign key (workspace_id,lesson_id)
    references public.lessons(workspace_id,id) on delete restrict,
  constraint meeting_version_requires_lesson check (lesson_version_id is null or lesson_id is not null),
  constraint meeting_lesson_version_fk foreign key (workspace_id,lesson_version_id,lesson_id)
    references public.lesson_versions(workspace_id,id,lesson_id) on delete restrict,
  constraint meeting_workspace_id_unique unique (workspace_id,id),
  constraint meeting_workspace_id_class_unique unique (workspace_id,id,class_id)
);

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  meeting_id uuid not null,
  sequence_no integer not null check (sequence_no >= 1),
  stopped_at text not null check (btrim(stopped_at) <> ''),
  next_step text,
  recorded_at timestamptz not null default now(),
  constraint checkpoint_meeting_fk foreign key (workspace_id,meeting_id)
    references public.meetings(workspace_id,id) on delete restrict,
  constraint checkpoint_meeting_sequence_unique unique (workspace_id,meeting_id,sequence_no),
  constraint checkpoint_next_step_nonblank check (next_step is null or btrim(next_step) <> '')
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  title text not null check (btrim(title) <> ''),
  status text not null default 'active' check (status in ('planned','active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_class_fk foreign key (workspace_id,class_id)
    references public.classes(workspace_id,id) on delete restrict,
  constraint activity_workspace_id_unique unique (workspace_id,id),
  constraint activity_workspace_id_class_unique unique (workspace_id,id,class_id)
);

create table public.activity_meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  class_id uuid not null,
  activity_id uuid not null,
  meeting_id uuid not null,
  created_at timestamptz not null default now(),
  constraint activity_meeting_activity_fk foreign key (workspace_id,activity_id,class_id)
    references public.activities(workspace_id,id,class_id) on delete restrict,
  constraint activity_meeting_meeting_fk foreign key (workspace_id,meeting_id,class_id)
    references public.meetings(workspace_id,id,class_id) on delete restrict,
  constraint activity_meeting_unique unique (workspace_id,activity_id,meeting_id)
);

create index materials_workspace_status_title_idx on public.materials(workspace_id,status,title);
create index lessons_workspace_material_status_idx on public.lessons(workspace_id,material_id,status);
create index lesson_versions_workspace_lesson_version_idx on public.lesson_versions(workspace_id,lesson_id,version_number desc);
create index meetings_workspace_class_occurred_idx on public.meetings(workspace_id,class_id,occurred_at desc);
create index checkpoints_workspace_meeting_recorded_idx on public.checkpoints(workspace_id,meeting_id,recorded_at desc,sequence_no desc);
create index activities_workspace_class_status_idx on public.activities(workspace_id,class_id,status);
create index activity_meetings_workspace_meeting_idx on public.activity_meetings(workspace_id,meeting_id);

alter table public.materials enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_versions enable row level security;
alter table public.meetings enable row level security;
alter table public.checkpoints enable row level security;
alter table public.activities enable row level security;
alter table public.activity_meetings enable row level security;

revoke all on public.materials, public.lessons, public.lesson_versions, public.meetings, public.checkpoints, public.activities, public.activity_meetings from anon;
grant select,insert,update,delete on public.materials, public.lessons, public.lesson_versions, public.meetings, public.checkpoints, public.activities, public.activity_meetings to authenticated;

create policy material_owner_all on public.materials for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy lesson_owner_all on public.lessons for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy lesson_version_owner_all on public.lesson_versions for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy meeting_owner_all on public.meetings for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy checkpoint_owner_all on public.checkpoints for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy activity_owner_all on public.activities for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));
create policy activity_meeting_owner_all on public.activity_meetings for all to authenticated using (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid())) with check (exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_user_id=auth.uid()));

-- Advance compatibility only after the complete Teaching Core has been established.
insert into public.app_schema_version(id,version,applied_at)
values(1,'r3.1-teaching-core.1',now())
on conflict(id) do update set version=excluded.version,applied_at=excluded.applied_at;
