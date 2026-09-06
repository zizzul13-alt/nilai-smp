import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{migratePortableBackup,restoreOperationId,type PortableBackup}from'../../src/services/recovery/portableBackup';

const sql=readFileSync('supabase/migrations/202609070001_recovery_portable_backup.sql','utf8');
const service=readFileSync('src/services/recovery/portableBackup.ts','utf8');
const ui=readFileSync('src/components/BackupRestore.tsx','utf8');
const docs=readFileSync('docs/BACKUP_RESTORE.md','utf8');

describe('R3.6 portable recovery contracts',()=>{
  it('exports a bounded owner-derived canonical graph without browser workspace ownership',()=>{
    expect(sql).toContain('function public.export_portable_backup()');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('portable_backup_table_names');
    expect(sql).not.toContain('p_workspace_id');
    for(const table of['students','enrollments','assessment_results','assessment_attempts','report_snapshots','artifact_versions','artifact_objects'])expect(sql).toContain(`'${table}'`);
  });
  it('restores only to empty workspace and preserves stable domain rows',()=>{
    expect(sql).toContain("raise exception 'restore target is not empty: %'");
    expect(sql).toContain("'recovery.restore'");
    expect(sql).toContain("jsonb_build_object('workspace_id',owned_workspace_id)");
    expect(sql).toContain("jsonb_build_object('current_snapshot_id',null)");
    expect(sql).toContain("jsonb_build_object('current_version_id',null)");
  });
  it('never fabricates READY artifact bytes during canonical restore',()=>{
    expect(sql).toContain("'state','PENDING_UPLOAD','sha256',null,'confirmed_at',null");
    expect(service).toContain("upload(payload.storage_path,blob,{upsert:false");
    expect(service).toContain('confirmArtifactObject');
    expect(service).toContain('existing.size!==payload.byte_size||hash!==payload.sha256');
  });
  it('verifies manifest and artifact checksums before restore',()=>{
    expect(service).toContain('verifyPortableBackup(input)');
    expect(service).toContain("manifestHash!==backup.checksum_sha256");
    expect(service).toContain("String(meta.sha256)!==hash");
    expect(ui).toContain('Restore verified backup');
  });
  it('uses a deterministic restore operation identity across browser restarts',()=>{
    const hash='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    expect(restoreOperationId(hash)).toBe(restoreOperationId(hash));
    expect(restoreOperationId(hash)).toMatch(/^[0-9a-f-]{36}$/);
    expect(service).toContain('restoreOperationId(backup.checksum_sha256)');
  });
  it('has an explicit backup format migration boundary',()=>{
    const sample={format:'nilai-smp-portable-backup',format_version:1,source_schema_version:'r3.6-recovery.1',exported_at:'x',source_workspace_id:'w',tables:{},artifact_payloads:[],checksum_sha256:'a'.repeat(64)} as PortableBackup;
    expect(migratePortableBackup(sample)).toBe(sample);
    expect(()=>migratePortableBackup({...sample,format_version:2})).toThrow(/belum didukung/);
    expect(docs).toContain('Portable format version is distinct from application schema version');
  });
  it('exposes human Excel escape without treating it as canonical restore',()=>{
    expect(service).toContain('makeHumanEscapeXlsx');
    expect(ui).toContain('Download Excel human escape');
    expect(docs).toContain('not round-trip canonical restoration');
  });
});
