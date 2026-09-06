import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{isArtifactVersionStale,sha256Hex,type ArtifactVersion,type LessonSource}from'../../src/services/artifacts/artifacts';

const migration=readFileSync('supabase/migrations/202609060004_artifact_core.sql','utf8');
const app=readFileSync('src/app/App.tsx','utf8');
const ui=readFileSync('src/components/Artifacts.tsx','utf8');

describe('R3.5-02 artifact contracts',()=>{
  it('keeps stable Artifact identity separate from append-only versions and objects',()=>{
    expect(migration).toContain('create table public.artifacts');
    expect(migration).toContain('create table public.artifact_versions');
    expect(migration).toContain('create table public.artifact_objects');
    expect(migration).toContain('artifact_version_number_unique unique(workspace_id,artifact_id,version_no)');
    expect(migration).toContain('artifact_current_version_fk foreign key(workspace_id,current_version_id,id)');
    expect(migration).toContain('references public.artifact_versions(workspace_id,id,artifact_id)');
  });

  it('preserves exact source provenance without requiring AI',()=>{
    expect(migration).toContain("source_kind text not null check(source_kind in ('MANUAL','LESSON_VERSION','REPORT_SNAPSHOT'))");
    expect(migration).toContain('artifact_version_lesson_version_fk foreign key(workspace_id,lesson_version_id,lesson_id)');
    expect(migration).toContain('artifact_version_report_snapshot_fk foreign key(workspace_id,report_snapshot_id)');
    expect(migration).toContain('generator_provider text');
    expect(ui).toContain('Manual / tidak bergantung AI');
    expect(ui).toContain('Regeneration selalu membuat version baru.');
  });

  it('protects artifact writes behind owned idempotent RPC boundaries',()=>{
    for(const table of['artifacts','artifact_versions','artifact_objects'])expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain('revoke insert,update,delete on public.artifacts, public.artifact_versions, public.artifact_objects from authenticated');
    for(const fn of['create_artifact_operation','append_artifact_version_operation','archive_artifact_operation','reserve_artifact_object_operation','confirm_artifact_object_operation'])expect(migration).toContain(`function public.${fn}`);
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toContain('p_workspace_id');
  });

  it('defines private Supabase Storage policy only for reserved owned objects',()=>{
    expect(migration).toContain("values('artifact-files','artifact-files',false,20000000");
    expect(migration).toContain("bucket_id='artifact-files'");
    expect(migration).toContain("ao.storage_path=name and ao.state='PENDING_UPLOAD'");
    expect(migration).toContain("ao.storage_path=name and ao.state='READY'");
    expect(migration).toContain("if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null");
    expect(migration).not.toMatch(/create policy artifact_file_owner_update/);
    expect(migration).not.toMatch(/create policy artifact_file_owner_delete/);
  });

  it('makes binary object identity checksumed, bounded, private and overwrite-resistant',()=>{
    expect(migration).toContain("object_kind text not null check(object_kind in ('DOCX','PDF','OTHER'))");
    expect(migration).toContain("state text not null default 'PENDING_UPLOAD' check(state in ('PENDING_UPLOAD','READY'))");
    expect(migration).toContain("sha256 ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain('byte_size<=20000000');
    expect(migration).toContain('artifact_object_version_kind_unique unique(workspace_id,artifact_version_id,object_kind)');
    expect(ui).toContain('overwrite dilarang');
  });

  it('derives stale LessonVersion source without mutating historical artifact versions',()=>{
    const sources:LessonSource[]=[
      {lesson_id:'L',lesson_title:'Gerak',lesson_version_id:'V2',version_number:2,content_text:'new'},
      {lesson_id:'L',lesson_title:'Gerak',lesson_version_id:'V1',version_number:1,content_text:'old'},
    ];
    const version={source_kind:'LESSON_VERSION',lesson_id:'L',lesson_version_id:'V1'} as ArtifactVersion;
    expect(isArtifactVersionStale(version,sources)).toBe(true);
    expect(isArtifactVersionStale({...version,lesson_version_id:'V2'},sources)).toBe(false);
    expect(isArtifactVersionStale({...version,source_kind:'MANUAL',lesson_id:null,lesson_version_id:null},sources)).toBe(false);
  });

  it('computes deterministic SHA-256 before confirmation',async()=>{
    expect(await sha256Hex(new Blob(['nilai-smp']))).toBe('d6c67bfac6aef667c6ff9310eec42833277357937612340267c886af1f397103');
  });

  it('exposes Artifacts as a workspace, not a separate app',()=>{
    expect(app).toContain("|'artifacts'");
    expect(app).toContain('>Artifacts</button>');
    expect(app).toContain('<Artifacts client={client} workspaceId={workspaceId} />');
  });
});
