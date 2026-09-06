import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{isArtifactVersionStale,sha256Hex,type ArtifactVersion,type LessonSource}from'../../src/services/artifacts/artifacts';

const migration=readFileSync('supabase/migrations/202609060004_artifact_core.sql','utf8');
const hardening=readFileSync('supabase/migrations/202609060005_artifact_integrity_hardening.sql','utf8');
const governor=readFileSync('supabase/migrations/202609060006_artifact_governor_repairs.sql','utf8');
const app=readFileSync('src/app/App.tsx','utf8');
const ui=readFileSync('src/components/Artifacts.tsx','utf8');
const service=readFileSync('src/services/artifacts/artifacts.ts','utf8');

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

  it('rechecks AppliedOperation after advisory locks for concurrent lost-ACK replay',()=>{
    for(const fn of['append_artifact_version_operation','archive_artifact_operation','reserve_artifact_object_operation','confirm_artifact_object_operation'])expect(hardening).toContain(`create or replace function public.${fn}`);
    expect((hardening.match(/select ao\.\* into prior from public\.applied_operations ao where ao\.op_id=p_op_id;/g)??[]).length).toBeGreaterThanOrEqual(8);
    expect(governor).toContain("':artifact:'||p_artifact_id::text");
  });

  it('qualifies revision mutation and serializes reservation with archive',()=>{
    expect(governor).toContain('update public.artifacts as a');
    expect(governor).toContain('revision=a.revision+1');
    expect(governor).not.toContain('revision=revision+1');
    expect(governor).toContain("if art.status<>'active' then raise exception 'artifact archived'");
    expect(governor).toContain("reserve_artifact_object_operation");
  });

  it('defines private Supabase Storage policy for owner-verifiable pending and ready objects',()=>{
    expect(migration).toContain("values('artifact-files','artifact-files',false,20000000");
    expect(migration).toContain("bucket_id='artifact-files'");
    expect(hardening).toContain("ao.storage_path=name and ao.state in ('PENDING_UPLOAD','READY')");
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
    expect(hardening).toContain('artifact object MIME does not match kind');
    expect(ui).toContain('overwrite dilarang');
  });

  it('preserves artifact operation ids across user retries',()=>{
    expect(ui).toContain('operationId:crypto.randomUUID()');
    expect(ui).toContain('opId:draft.operationId');
    expect(ui).toContain('archiveAttempt');
    expect(ui).toContain('reservationAttempt');
  });

  it('binds upload transport MIME to reservation metadata',()=>{
    expect(service).toContain('reservation:{objectId:string;storagePath:string;mimeType:string}');
    expect(service).toContain('contentType:reservation.mimeType');
    expect(service).not.toContain("contentType:file.type||'application/octet-stream'");
    expect(ui).toContain('mimeType:expectedMime');
  });

  it('verifies an already-uploaded retry byte-for-byte and reuses stable confirm op identity',()=>{
    expect(service).toContain("download(storagePath)");
    expect(service).toContain('existingHash!==expectedHash');
    expect(service).toContain('data.size!==file.size');
    expect(service).toContain('opId:reservation.objectId');
    expect(ui).toContain('Pending upload ini terikat ke ukuran/jenis file sebelumnya.');
  });

  it('does not expose fresh upload controls for archived artifacts',()=>{
    expect(ui).toContain("selected.status==='active'");
    expect(ui).toContain('Artifact archived bersifat read-only.');
    expect(ui).toContain('toggleArchived');
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
    expect(await sha256Hex(new Blob(['nilai-smp']))).toBe('1b6bebb2b5c740c1536644f11a9cc780e8b72e6a37cd288f4953de6ad6d591eb');
  });

  it('exposes Artifacts as a workspace, not a separate app',()=>{
    expect(app).toContain("|'artifacts'");
    expect(app).toContain('>Artifacts</button>');
    expect(app).toContain('<Artifacts client={client} workspaceId={workspaceId} />');
  });
});
