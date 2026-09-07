import type{SupabaseClient}from'@supabase/supabase-js';
import{confirmArtifactObject,sha256Hex}from'../artifacts/artifacts';

export const PORTABLE_BACKUP_FORMAT='nilai-smp-portable-backup';
export const PORTABLE_BACKUP_VERSION=1;
export const PORTABLE_SOURCE_SCHEMA='r3.6-recovery.1';
export const PORTABLE_BACKUP_MAX_BYTES=80_000_000;
export const REQUIRED_PORTABLE_TABLES=[
  'academic_years','academic_periods','classes','students','enrollments',
  'materials','lessons','lesson_versions','meetings','checkpoints','activities','activity_meetings',
  'scoring_profiles','assessments','assessment_results','assessment_attempts','correction_sessions',
  'continuity_baselines','lesson_pacing_plans','reporting_policies','reporting_cycles','report_snapshots','report_snapshot_rows','audit_events',
  'artifacts','artifact_versions','artifact_objects',
]as const;

type JsonRow=Record<string,unknown>;
export type ArtifactPayload={object_id:string;storage_path:string;mime_type:string;byte_size:number;sha256:string;base64:string};
export type PortableBackup={format:string;format_version:number;source_schema_version:string;exported_at:string;source_workspace_id:string;tables:Record<string,JsonRow[]>;artifact_payloads:ArtifactPayload[];checksum_sha256:string};
type RestoredArtifactObject={id:string;storage_path:string;mime_type:string;byte_size:number;state:string};

function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
function canonicalJson(value:unknown){return JSON.stringify(stable(value));}
async function textSha256(text:string){return sha256Hex(new Blob([text],{type:'application/json'}));}
function withoutChecksum(value:PortableBackup|Record<string,unknown>){const{checksum_sha256:_,...rest}=value as any;return rest;}
function bytesToBase64(bytes:Uint8Array){let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary);}
function base64ToBytes(value:string){const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}

export function assertPortableTableCompleteness(tables:unknown){
  if(!tables||typeof tables!=='object'||Array.isArray(tables))throw new Error('Tabel canonical backup tidak valid.');
  const rows=tables as Record<string,unknown>;
  for(const name of REQUIRED_PORTABLE_TABLES)if(!Object.prototype.hasOwnProperty.call(rows,name)||!Array.isArray(rows[name]))throw new Error(`Backup tidak lengkap: tabel ${name} hilang atau bukan array.`);
}

export function assertArtifactPayloadCompleteness(backup:Pick<PortableBackup,'tables'|'artifact_payloads'>){
  const objects=(backup.tables.artifact_objects??[]) as JsonRow[];
  const objectMap=new Map<string,JsonRow>();
  for(const object of objects){const id=String(object.id??'');if(!id||objectMap.has(id))throw new Error('Metadata ArtifactObject backup memiliki identity kosong/duplikat.');objectMap.set(id,object);}
  const payloadIds=new Set<string>();
  for(const payload of backup.artifact_payloads){
    if(!payload.object_id||payloadIds.has(payload.object_id))throw new Error(`Payload artifact duplikat/tanpa identity: ${payload.object_id||'unknown'}.`);
    payloadIds.add(payload.object_id);
    const meta=objectMap.get(payload.object_id);
    if(!meta)throw new Error(`Payload artifact ${payload.object_id} tidak punya metadata canonical.`);
    if(meta.state!=='READY')throw new Error(`Payload artifact ${payload.object_id} tidak boleh ada untuk object ${String(meta.state)}.`);
  }
  for(const[id,meta]of objectMap){
    if(meta.state==='READY'&&!payloadIds.has(id))throw new Error(`Backup tidak lengkap: READY ArtifactObject ${id} tidak memiliki payload.`);
    if(meta.state!=='READY'&&payloadIds.has(id))throw new Error(`Backup tidak valid: object ${id} belum READY tetapi memiliki payload.`);
  }
}

export async function generatePortableBackup(client:SupabaseClient):Promise<PortableBackup>{
  const{data,error}=await client.rpc('export_portable_backup');
  if(error)throw new Error(`Backup export gagal: ${error.message}`);
  const raw=(Array.isArray(data)?data[0]:data) as Omit<PortableBackup,'artifact_payloads'|'checksum_sha256'>|null;
  if(!raw||raw.format!==PORTABLE_BACKUP_FORMAT||raw.format_version!==PORTABLE_BACKUP_VERSION)throw new Error('Server mengembalikan format backup yang tidak didukung.');
  if(raw.source_schema_version!==PORTABLE_SOURCE_SCHEMA)throw new Error(`Schema sumber ${raw.source_schema_version} belum didukung oleh portable format v1.`);
  assertPortableTableCompleteness(raw.tables);
  const payloads:ArtifactPayload[]=[];
  const objects=(raw.tables.artifact_objects??[]) as JsonRow[];
  for(const object of objects){
    if(object.state!=='READY')continue;
    const storagePath=String(object.storage_path??'');const expectedHash=String(object.sha256??'');const expectedSize=Number(object.byte_size??-1);const objectId=String(object.id??'');const mime=String(object.mime_type??'application/octet-stream');
    if(!storagePath||!/^[0-9a-f]{64}$/.test(expectedHash)||expectedSize<0||!objectId)throw new Error('Metadata ArtifactObject READY tidak lengkap; backup dihentikan agar tidak menghasilkan arsip palsu.');
    const{data:blob,error:downloadError}=await client.storage.from('artifact-files').download(storagePath);
    if(downloadError||!blob)throw new Error(`Backup object gagal: ${downloadError?.message??storagePath}`);
    const hash=await sha256Hex(blob);if(blob.size!==expectedSize||hash!==expectedHash)throw new Error(`Checksum object ${objectId} tidak cocok; backup dihentikan.`);
    payloads.push({object_id:objectId,storage_path:storagePath,mime_type:mime,byte_size:blob.size,sha256:hash,base64:bytesToBase64(new Uint8Array(await blob.arrayBuffer()))});
  }
  const unsigned={...raw,artifact_payloads:payloads};
  assertArtifactPayloadCompleteness(unsigned);
  const checksum=await textSha256(canonicalJson(unsigned));
  const backup={...unsigned,checksum_sha256:checksum} as PortableBackup;
  if(new Blob([JSON.stringify(backup)]).size>PORTABLE_BACKUP_MAX_BYTES)throw new Error('Backup portable melebihi batas 80 MB. Kurangi artifact binary lama atau gunakan backup bertahap sebelum mencoba lagi.');
  return backup;
}

export async function verifyPortableBackup(input:unknown):Promise<PortableBackup>{
  const backup=migratePortableBackup(input);
  if(!/^[0-9a-f]{64}$/.test(backup.checksum_sha256))throw new Error('Checksum manifest tidak valid.');
  const manifestHash=await textSha256(canonicalJson(withoutChecksum(backup)));
  if(manifestHash!==backup.checksum_sha256)throw new Error('Checksum backup tidak cocok. File berubah/rusak; restore dibatalkan.');
  assertPortableTableCompleteness(backup.tables);
  assertArtifactPayloadCompleteness(backup);
  const objects=new Map((backup.tables.artifact_objects??[]).map(row=>[String(row.id),row]));
  for(const payload of backup.artifact_payloads){
    const meta=objects.get(payload.object_id)!;
    const bytes=base64ToBytes(payload.base64);if(bytes.byteLength!==payload.byte_size||Number(meta.byte_size)!==payload.byte_size)throw new Error(`Ukuran payload ${payload.object_id} tidak cocok.`);
    const hash=await sha256Hex(new Blob([bytes]));if(hash!==payload.sha256||String(meta.sha256)!==hash)throw new Error(`Checksum payload ${payload.object_id} tidak cocok.`);
    if(String(meta.storage_path)!==payload.storage_path)throw new Error(`Storage path payload ${payload.object_id} tidak cocok.`);
    if(String(meta.mime_type)!==payload.mime_type)throw new Error(`MIME payload ${payload.object_id} tidak cocok.`);
  }
  return backup;
}

export function migratePortableBackup(input:unknown):PortableBackup{
  if(!input||typeof input!=='object')throw new Error('File backup bukan object JSON.');
  const candidate=input as Partial<PortableBackup>;
  if(candidate.format!==PORTABLE_BACKUP_FORMAT)throw new Error('Bukan backup portable Nilai SMP.');
  if(candidate.format_version!==PORTABLE_BACKUP_VERSION)throw new Error(`Backup format v${String(candidate.format_version)} belum didukung.`);
  if(candidate.source_schema_version!==PORTABLE_SOURCE_SCHEMA)throw new Error(`Schema sumber ${String(candidate.source_schema_version)} belum didukung.`);
  if(!candidate.tables||typeof candidate.tables!=='object'||!Array.isArray(candidate.artifact_payloads))throw new Error('Isi backup tidak lengkap.');
  assertPortableTableCompleteness(candidate.tables);
  return candidate as PortableBackup;
}

export function restoreOperationId(checksum:string){
  if(!/^[0-9a-f]{64}$/.test(checksum))throw new Error('Checksum tidak dapat dijadikan operation id.');
  const chars=checksum.slice(0,32).split('');chars[12]='4';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);const hex=chars.join('');return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function loadRestoredArtifactObjects(client:SupabaseClient,ids:string[]){
  const rows:RestoredArtifactObject[]=[];
  for(let offset=0;offset<ids.length;offset+=100){
    const chunk=ids.slice(offset,offset+100);
    const{data,error}=await client.from('artifact_objects').select('id,storage_path,mime_type,byte_size,state').in('id',chunk);
    if(error)throw new Error(`Metadata artifact hasil restore tidak dapat dibaca: ${error.message}`);
    rows.push(...((data??[]) as RestoredArtifactObject[]));
  }
  return rows;
}

async function ensurePayloadAtPath(client:SupabaseClient,payload:ArtifactPayload,target:RestoredArtifactObject){
  if(target.mime_type!==payload.mime_type||Number(target.byte_size)!==payload.byte_size)throw new Error(`Metadata target ${payload.object_id} berbeda dari backup terverifikasi.`);
  if(target.state!=='PENDING_UPLOAD'&&target.state!=='READY')throw new Error(`State target ${payload.object_id} tidak dapat dipulihkan.`);
  const bytes=base64ToBytes(payload.base64);const blob=new Blob([bytes],{type:payload.mime_type});
  const{error}=await client.storage.from('artifact-files').upload(target.storage_path,blob,{upsert:false,contentType:payload.mime_type});
  if(error){
    if(!/already exists/i.test(error.message))throw new Error(`Restore upload ${payload.object_id} gagal: ${error.message}`);
    const{data:existing,error:downloadError}=await client.storage.from('artifact-files').download(target.storage_path);
    if(downloadError||!existing)throw new Error(`Restore retry tidak dapat memverifikasi ${payload.object_id}.`);
    const hash=await sha256Hex(existing);if(existing.size!==payload.byte_size||hash!==payload.sha256)throw new Error(`Restore menolak object existing yang berbeda byte: ${payload.object_id}.`);
  }
  await confirmArtifactObject(client,{opId:payload.object_id,objectId:payload.object_id,sha256:payload.sha256,byteSize:payload.byte_size});
}

export async function restorePortableBackup(client:SupabaseClient,input:unknown){
  const backup=await verifyPortableBackup(input);const opId=restoreOperationId(backup.checksum_sha256);
  const{artifact_payloads:_,...serverManifest}=backup;
  const{data,error}=await client.rpc('restore_portable_backup_operation',{p_op_id:opId,p_manifest:serverManifest});
  if(error)throw new Error(`Restore canonical gagal: ${error.message}`);
  if(backup.artifact_payloads.length){
    const targets=await loadRestoredArtifactObjects(client,backup.artifact_payloads.map(payload=>payload.object_id));
    const byId=new Map(targets.map(target=>[target.id,target]));
    if(byId.size!==backup.artifact_payloads.length)throw new Error('Metadata ArtifactObject hasil restore tidak lengkap; byte restore dihentikan.');
    for(const payload of backup.artifact_payloads){const target=byId.get(payload.object_id);if(!target)throw new Error(`ArtifactObject target ${payload.object_id} hilang.`);await ensurePayloadAtPath(client,payload,target);}
  }
  const row=Array.isArray(data)?data[0]:data;return{restoredRows:Number(row?.restored_rows??0),replayed:Boolean(row?.replayed),artifactPayloads:backup.artifact_payloads.length};
}

export function backupBlob(backup:PortableBackup){return new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});}

function esc(value:unknown){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function crc32(data:Uint8Array){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function u16(n:number){return[n&255,(n>>>8)&255];}function u32(n:number){return[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function appendBytes(target:number[],bytes:Iterable<number>){for(const byte of bytes)target.push(byte);}
function zipStore(files:{name:string;data:Uint8Array}[]){const out:number[]=[],central:number[]=[];let offset=0;for(const file of files){const name=new TextEncoder().encode(file.name),crc=crc32(file.data);const local=[...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(file.data.length),...u32(file.data.length),...u16(name.length),...u16(0),...name];appendBytes(out,local);appendBytes(out,file.data);const record=[...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(file.data.length),...u32(file.data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name];appendBytes(central,record);offset=out.length;}const start=out.length;appendBytes(out,central);appendBytes(out,[...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(central.length),...u32(start),...u16(0)]);return new Uint8Array(out);}

export function makeHumanEscapeXlsx(backup:PortableBackup){
  const tables=backup.tables;const students=new Map((tables.students??[]).map(row=>[String(row.id),row]));const enrollments=new Map((tables.enrollments??[]).map(row=>[String(row.id),row]));const classes=new Map((tables.classes??[]).map(row=>[String(row.id),row]));const assessments=new Map((tables.assessments??[]).map(row=>[String(row.id),row]));
  const headers=['Class','Assessment','Enrollment_ID','Student_ID','Nama','NIS','NISN','State','Score'];
  const rows=(tables.assessment_results??[]).map(result=>{const enrollment=enrollments.get(String(result.enrollment_id))??{};const student=students.get(String(enrollment.student_id))??{};const klass=classes.get(String(result.class_id))??{};const assessment=assessments.get(String(result.assessment_id))??{};return[String(klass.display_name??''),String(assessment.title??''),String(result.enrollment_id??''),String(enrollment.student_id??''),String(student.display_name??''),String(student.nis??''),String(student.nisn??''),String(result.state??''),result.score??''];});
  const all=[headers,...rows];const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((row,ri)=>`<row r="${ri+1}">${row.map((value,ci)=>{const ref=String.fromCharCode(65+ci)+(ri+1);return`<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData></worksheet>`;const enc=new TextEncoder();const files=[{name:'[Content_Types].xml',data:enc.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')},{name:'_rels/.rels',data:enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')},{name:'xl/workbook.xml',data:enc.encode('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nilai" sheetId="1" r:id="rId1"/></sheets></workbook>')},{name:'xl/_rels/workbook.xml.rels',data:enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')},{name:'xl/worksheets/sheet1.xml',data:enc.encode(sheet)}];return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
