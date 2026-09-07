import type{SupabaseClient}from'@supabase/supabase-js';
import{confirmArtifactObject,sha256Hex}from'../artifacts/artifacts';

export const LEGACY_SOURCE_FORMAT='nilai-smp-legacy-source';
export const LEGACY_NORMALIZED_FORMAT='nilai-smp-legacy-normalized';
export const LEGACY_FORMAT_VERSION=1;
export const LEGACY_MAX_FILE_BYTES=20_000_000;
const LEGACY_TABLES=['kelas','siswa','jadwal','bank_soal','kkm','dokumen','nilai'] as const;

type JsonRow=Record<string,unknown>;
type LegacyTables=Record<(typeof LEGACY_TABLES)[number],JsonRow[]>;
export type LegacyDocumentPayload={legacy_document_id:string;file_name:string;mime_type:string;byte_size:number;sha256:string;base64:string};
export type LegacySourceBundle={format:string;format_version:number;exported_at:string;tables:LegacyTables;document_payloads:LegacyDocumentPayload[];checksum_sha256:string};
export type MigrationIssue={code:string;message:string;legacy_ids?:string[]};
export type MigrationReport={blocker_count:number;warning_count:number;blockers:MigrationIssue[];warnings:MigrationIssue[];source_counts:Record<string,number>;target_counts:Record<string,number>;unmapped_preserved:Record<string,number>};
export type NormalizedArtifactPayload={object_id:string;legacy_document_id:string;mime_type:string;byte_size:number;sha256:string;base64:string};
export type NormalizedLegacyBundle={format:string;format_version:number;source_checksum_sha256:string;normalized_at:string;tables:Record<string,JsonRow[]>;artifact_payloads:NormalizedArtifactPayload[];report:MigrationReport;normalized_checksum_sha256:string};

type PeriodKey={key:string;yearKey:string;yearDisplay:string;periodIdentity:string;periodDisplay:string;semester:number|null;startsOn:null;endsOn:null};

function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
function canonicalJson(value:unknown){return JSON.stringify(stable(value));}
async function textSha256(value:string){return sha256Hex(new Blob([value],{type:'application/json'}));}
function withoutKey<T extends Record<string,unknown>>(value:T,key:string){const copy={...value};delete copy[key];return copy;}
function str(value:unknown){return value===null||value===undefined?'':String(value).trim();}
function legacyId(row:JsonRow){return str(row.id);}
function finiteNumber(value:unknown){if(value===null||value===undefined||value==='')return null;const n=typeof value==='number'?value:Number(String(value).replace(',','.'));return Number.isFinite(n)?n:null;}
function semester(value:unknown){const n=Number(value);return n===1||n===2?n:null;}
function sanitizeKey(value:string){const normalized=value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return normalized.slice(0,60)||'legacy';}
function isoDate(value:unknown){const raw=str(value);return /^\d{4}-\d{2}-\d{2}$/.test(raw)&&!Number.isNaN(Date.parse(`${raw}T00:00:00Z`))?raw:null;}
function yearFromDate(value:unknown){const date=isoDate(value);return date?date.slice(0,4):null;}
function bytesFromBase64(value:string){const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}

async function deterministicUuid(kind:string,key:string){
  const input=new TextEncoder().encode(`nilai-smp-legacy-v1\0${kind}\0${key}`);const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',input));const b=digest.slice(0,16);b[6]=(b[6]&0x0f)|0x50;b[8]=(b[8]&0x3f)|0x80;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function periodFromEvidence(row:JsonRow,source:'nilai'|'jadwal'|'dokumen'):PeriodKey{
  const sem=semester(row.semester);
  let yearKey='legacy-unspecified';let yearDisplay='Legacy — tahun tidak diketahui';
  if(source==='jadwal'){
    const raw=str(row.tahun_ajaran);
    if(/^\d{4}\/\d{4}$/.test(raw)){yearKey=`legacy-school-${raw.replace('/','-')}`;yearDisplay=raw;}
    else if(/^\d{4}$/.test(raw)){yearKey=`legacy-label-${raw}`;yearDisplay=`Legacy ${raw} (label satu tahun)`;}
  }else if(source==='nilai'){
    const year=yearFromDate(row.tanggal);if(year){yearKey=`legacy-calendar-${year}`;yearDisplay=`Legacy calendar ${year}`;}
  }
  const suffix=sem?`s${sem}`:'period-unspecified';
  return{key:`${yearKey}|${suffix}`,yearKey,yearDisplay,periodIdentity:`${yearKey}-${suffix}`,periodDisplay:sem?`${yearDisplay} · Semester ${sem}`:`${yearDisplay} · Periode tidak diketahui`,semester:sem,startsOn:null,endsOn:null};
}
function unspecifiedPeriod():PeriodKey{return{key:'legacy-unspecified|period-unspecified',yearKey:'legacy-unspecified',yearDisplay:'Legacy — tahun tidak diketahui',periodIdentity:'legacy-unspecified-period-unspecified',periodDisplay:'Legacy — periode tidak diketahui',semester:null,startsOn:null,endsOn:null};}

export async function verifyLegacySourceBundle(input:unknown):Promise<LegacySourceBundle>{
  if(!input||typeof input!=='object')throw new Error('Legacy export bukan object JSON.');
  const bundle=input as LegacySourceBundle;
  if(bundle.format!==LEGACY_SOURCE_FORMAT||bundle.format_version!==1)throw new Error('Format legacy export tidak didukung.');
  if(!bundle.tables||typeof bundle.tables!=='object'||!Array.isArray(bundle.document_payloads))throw new Error('Legacy export tidak lengkap.');
  for(const table of LEGACY_TABLES)if(!Array.isArray(bundle.tables[table]))throw new Error(`Legacy table ${table} tidak tersedia sebagai array.`);
  if(!/^[0-9a-f]{64}$/.test(bundle.checksum_sha256))throw new Error('Checksum legacy source tidak valid.');
  const actual=await textSha256(canonicalJson(withoutKey(bundle as unknown as Record<string,unknown>,'checksum_sha256')));
  if(actual!==bundle.checksum_sha256)throw new Error('Checksum legacy source tidak cocok. Export berubah/rusak.');
  const payloadIds=new Set<string>();
  for(const payload of bundle.document_payloads){
    if(!payload.legacy_document_id||payloadIds.has(payload.legacy_document_id))throw new Error(`Payload dokumen legacy duplikat/tanpa id: ${payload.legacy_document_id||'unknown'}.`);payloadIds.add(payload.legacy_document_id);
    if(payload.byte_size<0||payload.byte_size>LEGACY_MAX_FILE_BYTES)throw new Error(`Payload legacy ${payload.legacy_document_id} melewati batas R3 20 MB.`);
    if(!/^[0-9a-f]{64}$/.test(payload.sha256))throw new Error(`SHA-256 payload ${payload.legacy_document_id} tidak valid.`);
    const bytes=bytesFromBase64(payload.base64);if(bytes.byteLength!==payload.byte_size)throw new Error(`Ukuran payload ${payload.legacy_document_id} tidak cocok.`);
    const hash=await sha256Hex(new Blob([bytes]));if(hash!==payload.sha256)throw new Error(`Checksum payload ${payload.legacy_document_id} tidak cocok.`);
  }
  return bundle;
}

export async function normalizeLegacyBundle(input:unknown):Promise<NormalizedLegacyBundle>{
  const source=await verifyLegacySourceBundle(input);const blockers:MigrationIssue[]=[];const warnings:MigrationIssue[]=[];
  const sourceCounts=Object.fromEntries(LEGACY_TABLES.map(t=>[t,source.tables[t].length]));
  const classesById=new Map(source.tables.kelas.map(r=>[legacyId(r),r]));const studentsById=new Map(source.tables.siswa.map(r=>[legacyId(r),r]));
  for(const[t,rows]of Object.entries(source.tables))for(const row of rows)if(!legacyId(row))blockers.push({code:'LEGACY_ID_MISSING',message:`${t} memiliki row tanpa stable legacy id.`});
  const classPeriods=new Map<string,Map<string,PeriodKey>>();
  const addPeriod=(classId:string,p:PeriodKey)=>{if(!classPeriods.has(classId))classPeriods.set(classId,new Map());classPeriods.get(classId)!.set(p.key,p);};
  for(const row of source.tables.nilai){const cid=str(row.kelas_id);if(cid)addPeriod(cid,periodFromEvidence(row,'nilai'));}
  for(const row of source.tables.jadwal){const cid=str(row.kelas_id);if(cid)addPeriod(cid,periodFromEvidence(row,'jadwal'));}
  for(const row of source.tables.dokumen){const cid=str(row.kelas_id);if(cid)addPeriod(cid,periodFromEvidence(row,'dokumen'));}
  for(const id of classesById.keys())if(!classPeriods.get(id)?.size)addPeriod(id,unspecifiedPeriod());
  for(const[cid,periods]of classPeriods)if(periods.size>1)warnings.push({code:'CLASS_SPLIT_BY_PERIOD',message:`Legacy kelas ${cid} menjadi ${periods.size} Class R3 karena Class R3 period-owned.`,legacy_ids:[cid]});
  for(const row of source.tables.jadwal){const raw=str(row.tahun_ajaran);if(/^\d{4}$/.test(raw))warnings.push({code:'LEGACY_YEAR_LABEL_AMBIGUOUS',message:`Jadwal ${legacyId(row)} memakai tahun_ajaran '${raw}' satu tahun; dipertahankan sebagai label legacy, tidak ditebak menjadi rentang tahun ajaran.`,legacy_ids:[legacyId(row)]});}

  const yearMap=new Map<string,{id:string;identity_key:string;display_name:string;sort_order:number;starts_on:null;ends_on:null}>();
  const periodMap=new Map<string,{id:string;academic_year_id:string;identity_key:string;display_name:string;sort_order:number;starts_on:null;ends_on:null;period:PeriodKey}>();
  const uniquePeriods=[...new Map([...classPeriods.values()].flatMap(m=>[...m.values()].map(p=>[p.key,p]))).values()].sort((a,b)=>a.key.localeCompare(b.key));
  const uniqueYears=[...new Map(uniquePeriods.map(p=>[p.yearKey,p.yearDisplay])).entries()].sort(([a],[b])=>a.localeCompare(b));
  for(let i=0;i<uniqueYears.length;i++){const[key,display]=uniqueYears[i];yearMap.set(key,{id:await deterministicUuid('academic-year',key),identity_key:sanitizeKey(key),display_name:display,sort_order:i+1,starts_on:null,ends_on:null});}
  for(let i=0;i<uniquePeriods.length;i++){const p=uniquePeriods[i],year=yearMap.get(p.yearKey)!;periodMap.set(p.key,{id:await deterministicUuid('academic-period',p.key),academic_year_id:year.id,identity_key:sanitizeKey(p.periodIdentity),display_name:p.periodDisplay,sort_order:i+1,starts_on:null,ends_on:null,period:p});}

  const targetClasses:JsonRow[]=[];const targetClassByLegacyPeriod=new Map<string,string>();
  for(const[cid,row]of [...classesById.entries()].sort(([a],[b])=>a.localeCompare(b))){const name=str(row.nama_kelas);if(!name)blockers.push({code:'CLASS_NAME_MISSING',message:`Legacy kelas ${cid} tidak punya nama_kelas.`,legacy_ids:[cid]});for(const p of classPeriods.get(cid)?.values()??[unspecifiedPeriod()]){const id=await deterministicUuid('class',`${cid}|${p.key}`);targetClassByLegacyPeriod.set(`${cid}|${p.key}`,id);targetClasses.push({id,academic_period_id:periodMap.get(p.key)!.id,identity_key:`legacy-${sanitizeKey(cid)}-${sanitizeKey(p.key)}`.slice(0,120),display_name:name||`Legacy class ${cid}`});}}

  const targetStudents:JsonRow[]=[];const studentTargetId=new Map<string,string>();
  for(const[sid,row]of [...studentsById.entries()].sort(([a],[b])=>a.localeCompare(b))){const name=str(row.nama);const cid=str(row.kelas_id);if(!name)blockers.push({code:'STUDENT_NAME_MISSING',message:`Legacy siswa ${sid} tidak punya nama.`,legacy_ids:[sid]});if(!classesById.has(cid))blockers.push({code:'STUDENT_CLASS_MISSING',message:`Legacy siswa ${sid} merujuk kelas ${cid} yang tidak ada.`,legacy_ids:[sid,cid]});const id=await deterministicUuid('student',sid);studentTargetId.set(sid,id);targetStudents.push({id,display_name:name||`Legacy student ${sid}`,nis:null,nisn:null});}
  const sameNames=new Map<string,string[]>();for(const[sid,row]of studentsById){const key=str(row.nama).toLocaleLowerCase('id-ID');if(!sameNames.has(key))sameNames.set(key,[]);sameNames.get(key)!.push(sid);}for(const[name,ids]of sameNames)if(name&&ids.length>1)warnings.push({code:'DUPLICATE_NAME_PRESERVED',message:`Nama '${name}' muncul pada ${ids.length} legacy siswa dan tetap menjadi Student terpisah; nama tidak dipakai sebagai identity resolver.`,legacy_ids:ids});

  const targetEnrollments:JsonRow[]=[];const enrollmentByStudentPeriod=new Map<string,string>();
  for(const[sid,row]of studentsById){const cid=str(row.kelas_id);const periods=[...(classPeriods.get(cid)?.values()??[])];const evidencePeriods=new Set(source.tables.nilai.filter(n=>str(n.siswa_id)===sid&&str(n.kelas_id)===cid).map(n=>periodFromEvidence(n,'nilai').key));for(const p of periods){const classId=targetClassByLegacyPeriod.get(`${cid}|${p.key}`);if(!classId)continue;const eid=await deterministicUuid('enrollment',`${sid}|${cid}|${p.key}`);enrollmentByStudentPeriod.set(`${sid}|${p.key}`,eid);targetEnrollments.push({id:eid,student_id:studentTargetId.get(sid)!,class_id:classId,started_on:null,ended_on:null});if(periods.length>1&&!evidencePeriods.has(p.key))warnings.push({code:'ROSTER_PERIOD_SCOPE_INFERRED',message:`Legacy siswa ${sid} tidak memiliki nilai pada ${p.periodDisplay}; Enrollment dibuat karena roster legacy hanya class-owned dan tidak menyimpan periode.`,legacy_ids:[sid,cid]});}}

  type AssessmentGroup={id:string;class_id:string;academic_period_id:string;title:string;description:string;legacyRows:JsonRow[];periodKey:string};
  const groups=new Map<string,AssessmentGroup>();
  for(const row of source.tables.nilai){const rid=legacyId(row),sid=str(row.siswa_id),cid=str(row.kelas_id);if(!studentsById.has(sid)){blockers.push({code:'GRADE_STUDENT_MISSING',message:`Nilai ${rid} merujuk siswa ${sid} yang tidak ada.`,legacy_ids:[rid,sid]});continue;}if(str(studentsById.get(sid)!.kelas_id)!==cid){blockers.push({code:'GRADE_CLASS_MISMATCH',message:`Nilai ${rid} kelas ${cid} tidak cocok dengan legacy siswa ${sid}.`,legacy_ids:[rid,sid,cid]});continue;}const p=periodFromEvidence(row,'nilai'),classId=targetClassByLegacyPeriod.get(`${cid}|${p.key}`),period=periodMap.get(p.key);if(!classId||!period){blockers.push({code:'GRADE_PERIOD_UNRESOLVED',message:`Nilai ${rid} tidak dapat dipetakan ke Class/Period.`,legacy_ids:[rid]});continue;}const category=str(row.kategori)||'Legacy';const topic=str(row.topik)||'Tanpa topik';if(!str(row.topik))warnings.push({code:'GRADE_TOPIC_MISSING',message:`Nilai ${rid} tidak punya topik; Assessment memakai label eksplisit 'Tanpa topik'.`,legacy_ids:[rid]});const key=`${cid}|${p.key}|${category}|${topic}`;if(!groups.has(key)){const id=await deterministicUuid('assessment',key);groups.set(key,{id,class_id:classId,academic_period_id:period.id,title:`${category} · ${topic}`.slice(0,180),description:'Migrated from legacy Nilai SMP. Assessment identity follows legacy class + derived period + kategori + topik; legacy dates remain in source export.',legacyRows:[],periodKey:p.key});}groups.get(key)!.legacyRows.push(row);}
  const targetAssessments:JsonRow[]=[];const targetResults:JsonRow[]=[];
  for(const group of groups.values()){targetAssessments.push({id:group.id,class_id:group.class_id,academic_period_id:group.academic_period_id,title:group.title,description:group.description});const seen=new Map<string,JsonRow[]>();for(const row of group.legacyRows){const sid=str(row.siswa_id);if(!seen.has(sid))seen.set(sid,[]);seen.get(sid)!.push(row);}for(const[sid,rows]of seen){if(rows.length>1){blockers.push({code:'AMBIGUOUS_LEGACY_RESULT',message:`${rows.length} legacy nilai untuk siswa ${sid} jatuh ke Assessment identity yang sama. Tidak ada row yang dipilih diam-diam.`,legacy_ids:rows.map(legacyId)});continue;}const row=rows[0],score=finiteNumber(row.nilai);if(score===null){blockers.push({code:'GRADE_SCORE_INVALID',message:`Nilai ${legacyId(row)} bukan angka tersimpan yang valid.`,legacy_ids:[legacyId(row)]});continue;}const eid=enrollmentByStudentPeriod.get(`${sid}|${group.periodKey}`);if(!eid){blockers.push({code:'GRADE_ENROLLMENT_MISSING',message:`Nilai ${legacyId(row)} tidak punya Enrollment target.`,legacy_ids:[legacyId(row),sid]});continue;}targetResults.push({id:await deterministicUuid('assessment-result',legacyId(row)),assessment_id:group.id,enrollment_id:eid,class_id:group.class_id,score});}}

  const kkmByClass=new Map<string,JsonRow[]>();for(const row of source.tables.kkm){const cid=str(row.kelas_id);if(!kkmByClass.has(cid))kkmByClass.set(cid,[]);kkmByClass.get(cid)!.push(row);}const targetPolicies:JsonRow[]=[];
  for(const[cid,rows]of kkmByClass){const nums=rows.map(r=>finiteNumber(r.kkm)).filter((n):n is number=>n!==null);if(nums.length!==rows.length){warnings.push({code:'KKM_INVALID_PRESERVED',message:`KKM kelas ${cid} memiliki nilai nonnumeric; tidak dibuat ReportingPolicy.`,legacy_ids:rows.map(legacyId)});continue;}const unique=[...new Set(nums)];if(unique.length!==1){warnings.push({code:'KKM_MIXED_BY_CATEGORY',message:`KKM kelas ${cid} berbeda per kategori (${unique.join(', ')}); tidak diratakan diam-diam dan tetap preserved di source export.`,legacy_ids:rows.map(legacyId)});continue;}for(const p of classPeriods.get(cid)?.values()??[]){const period=periodMap.get(p.key)!;const id=await deterministicUuid('reporting-policy',`${cid}|${p.key}`);targetPolicies.push({id,academic_period_id:period.id,policy_key:await deterministicUuid('reporting-policy-key',`${cid}|${p.key}`),name:`Legacy KKM · ${str(classesById.get(cid)?.nama_kelas)||cid}`,kkm:unique[0]});}if((classPeriods.get(cid)?.size??0)>1)warnings.push({code:'KKM_PERIOD_SCOPE_INFERRED',message:`KKM legacy kelas ${cid} tidak period-owned; nilai tunggal ${unique[0]} disalin sebagai policy candidate pada setiap derived period kelas itu.`,legacy_ids:rows.map(legacyId)});}

  const payloadByDoc=new Map(source.document_payloads.map(p=>[p.legacy_document_id,p]));const targetArtifacts:JsonRow[]=[];const targetVersions:JsonRow[]=[];const targetObjects:JsonRow[]=[];const normalizedPayloads:NormalizedArtifactPayload[]=[];
  for(const row of source.tables.dokumen){const did=legacyId(row),rawType=str(row.jenis),artifactType=rawType==='RPP'?'RPP':rawType==='Modul Ajar'?'MODUL_AJAR':rawType==='LKPD'?'LKPD':'OTHER';const title=str(row.judul)||`Legacy document ${did}`;if(!str(row.judul))warnings.push({code:'DOCUMENT_TITLE_MISSING',message:`Dokumen ${did} tidak punya judul; dibuat label eksplisit.`,legacy_ids:[did]});const aid=await deterministicUuid('artifact',did),vid=await deterministicUuid('artifact-version',did);targetArtifacts.push({id:aid,artifact_type:artifactType,title});const metadata={legacy_id:did,legacy_type:rawType||null,legacy_class_id:str(row.kelas_id)||null,topik:str(row.topik)||null,bab:str(row.bab)||null,semester:semester(row.semester),file_name:str(row.file_name)||null,file_url:str(row.file_url)||null,file_size:finiteNumber(row.file_size)};targetVersions.push({id:vid,artifact_id:aid,canonical_text:`Legacy document metadata imported from Streamlit/Supabase. Original content is ${payloadByDoc.has(did)?'attached as a verified private binary':'NOT present in this migration bundle'}.`,structured_content:{legacy_document:metadata},provenance:{source:'legacy-streamlit-supabase',legacy_table:'dokumen',legacy_id:did,source_checksum_sha256:source.checksum_sha256}});const payload=payloadByDoc.get(did);if(payload){const oid=await deterministicUuid('artifact-object',did);const lower=payload.file_name.toLowerCase(),isPdf=payload.mime_type==='application/pdf'||lower.endsWith('.pdf'),isDocx=payload.mime_type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||lower.endsWith('.docx');const objectKind=isPdf?'PDF':isDocx?'DOCX':'OTHER';const mimeType=objectKind==='PDF'?'application/pdf':objectKind==='DOCX'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/octet-stream';targetObjects.push({id:oid,artifact_id:aid,artifact_version_id:vid,object_kind:objectKind,mime_type:mimeType,byte_size:payload.byte_size});normalizedPayloads.push({object_id:oid,legacy_document_id:did,mime_type:mimeType,byte_size:payload.byte_size,sha256:payload.sha256,base64:payload.base64});}else warnings.push({code:'DOCUMENT_BINARY_UNRESOLVED',message:`Dokumen ${did} tidak punya binary terverifikasi <=20 MB. Metadata dipertahankan, tetapi tidak dibuat READY object palsu.`,legacy_ids:[did]});}
  for(const payload of source.document_payloads)if(!source.tables.dokumen.some(d=>legacyId(d)===payload.legacy_document_id))blockers.push({code:'ORPHAN_DOCUMENT_PAYLOAD',message:`Payload ${payload.legacy_document_id} tidak punya row dokumen.`,legacy_ids:[payload.legacy_document_id]});

  if(source.tables.jadwal.length)warnings.push({code:'SCHEDULE_PRESERVED_NOT_MEETING',message:`${source.tables.jadwal.length} row jadwal dipertahankan di source export dan tidak dikonversi menjadi Meeting karena Schedule != Actual Meeting.`});
  if(source.tables.bank_soal.length)warnings.push({code:'QUESTION_BANK_PRESERVED_UNMAPPED',message:`${source.tables.bank_soal.length} row bank_soal dipertahankan di source export; R3 belum memiliki canonical QuestionBank dan migrasi tidak mengarang domain baru.`});

  const tables:Record<string,JsonRow[]>={academic_years:[...yearMap.values()].map(({id,identity_key,display_name,sort_order,starts_on,ends_on})=>({id,identity_key,display_name,sort_order,starts_on,ends_on})),academic_periods:[...periodMap.values()].map(({id,academic_year_id,identity_key,display_name,sort_order,starts_on,ends_on})=>({id,academic_year_id,identity_key,display_name,sort_order,starts_on,ends_on})),classes:targetClasses,students:targetStudents,enrollments:targetEnrollments,assessments:targetAssessments,assessment_results:targetResults,reporting_policies:targetPolicies,artifacts:targetArtifacts,artifact_versions:targetVersions,artifact_objects:targetObjects};
  const targetCounts=Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));const report:MigrationReport={blocker_count:blockers.length,warning_count:warnings.length,blockers,warnings,source_counts:sourceCounts,target_counts:targetCounts,unmapped_preserved:{jadwal:source.tables.jadwal.length,bank_soal:source.tables.bank_soal.length,kkm_mixed:[...kkmByClass.values()].filter(rows=>new Set(rows.map(r=>finiteNumber(r.kkm))).size>1).length,documents_without_binary:source.tables.dokumen.filter(d=>!payloadByDoc.has(legacyId(d))).length}};
  const unsigned={format:LEGACY_NORMALIZED_FORMAT,format_version:1,source_checksum_sha256:source.checksum_sha256,normalized_at:new Date().toISOString(),tables,artifact_payloads:normalizedPayloads,report};const normalizedChecksum=await textSha256(canonicalJson(unsigned));return{...unsigned,normalized_checksum_sha256:normalizedChecksum};
}

export async function verifyNormalizedLegacyBundle(input:unknown):Promise<NormalizedLegacyBundle>{
  if(!input||typeof input!=='object')throw new Error('Normalized legacy bundle bukan object.');const bundle=input as NormalizedLegacyBundle;if(bundle.format!==LEGACY_NORMALIZED_FORMAT||bundle.format_version!==1)throw new Error('Normalized legacy format tidak didukung.');if(!/^[0-9a-f]{64}$/.test(bundle.normalized_checksum_sha256)||!/^[0-9a-f]{64}$/.test(bundle.source_checksum_sha256))throw new Error('Normalized/source checksum tidak valid.');const actual=await textSha256(canonicalJson(withoutKey(bundle as unknown as Record<string,unknown>,'normalized_checksum_sha256')));if(actual!==bundle.normalized_checksum_sha256)throw new Error('Normalized migration bundle berubah/rusak.');if(bundle.report.blocker_count!==bundle.report.blockers.length)throw new Error('Migration blocker count tidak konsisten.');return bundle;
}

export function legacyMigrationOperationId(checksum:string){if(!/^[0-9a-f]{64}$/.test(checksum))throw new Error('Checksum tidak valid untuk operation id.');const chars=checksum.slice(0,32).split('');chars[12]='4';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);const h=chars.join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}

async function restoreLegacyArtifactPayloads(client:SupabaseClient,bundle:NormalizedLegacyBundle){
  if(!bundle.artifact_payloads.length)return 0;const ids=bundle.artifact_payloads.map(p=>p.object_id);const rows:{id:string;storage_path:string;mime_type:string;byte_size:number;state:string}[]=[];for(let i=0;i<ids.length;i+=100){const{data,error}=await client.from('artifact_objects').select('id,storage_path,mime_type,byte_size,state').in('id',ids.slice(i,i+100));if(error)throw new Error(`Metadata object hasil migrasi gagal dibaca: ${error.message}`);rows.push(...((data??[]) as typeof rows));}const byId=new Map(rows.map(r=>[r.id,r]));if(byId.size!==ids.length)throw new Error('ArtifactObject hasil migrasi tidak lengkap.');for(const payload of bundle.artifact_payloads){const target=byId.get(payload.object_id)!;if(target.mime_type!==payload.mime_type||Number(target.byte_size)!==payload.byte_size)throw new Error(`ArtifactObject ${payload.object_id} tidak cocok dengan dry-run.`);const bytes=bytesFromBase64(payload.base64);const blob=new Blob([bytes],{type:payload.mime_type});const{error}=await client.storage.from('artifact-files').upload(target.storage_path,blob,{upsert:false,contentType:payload.mime_type});if(error){if(!/already exists/i.test(error.message))throw new Error(`Upload legacy artifact ${payload.legacy_document_id} gagal: ${error.message}`);const{data:existing,error:downloadError}=await client.storage.from('artifact-files').download(target.storage_path);if(downloadError||!existing)throw new Error(`Retry artifact ${payload.legacy_document_id} tidak dapat diverifikasi.`);const hash=await sha256Hex(existing);if(existing.size!==payload.byte_size||hash!==payload.sha256)throw new Error(`Existing target bytes berbeda untuk dokumen ${payload.legacy_document_id}.`);}await confirmArtifactObject(client,{opId:payload.object_id,objectId:payload.object_id,sha256:payload.sha256,byteSize:payload.byte_size});}return bundle.artifact_payloads.length;
}

export async function commitLegacyMigration(client:SupabaseClient,input:unknown){const bundle=await verifyNormalizedLegacyBundle(input);if(bundle.report.blocker_count)throw new Error(`Dry-run masih memiliki ${bundle.report.blocker_count} blocker; commit dilarang.`);const opId=legacyMigrationOperationId(bundle.normalized_checksum_sha256);const{data,error}=await client.rpc('migrate_legacy_bundle_operation',{p_op_id:opId,p_bundle:bundle});if(error)throw new Error(`Legacy migration gagal: ${error.message}`);const restoredArtifacts=await restoreLegacyArtifactPayloads(client,bundle);const row=Array.isArray(data)?data[0]:data;return{migratedRows:Number(row?.migrated_rows??0),replayed:Boolean(row?.replayed),restoredArtifacts};}
