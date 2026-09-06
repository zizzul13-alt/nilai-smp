import type{SupabaseClient}from'@supabase/supabase-js';

export type ArtifactType='RPP'|'MODUL_AJAR'|'LKPD'|'SILABUS'|'ATP'|'OTHER';
export type ArtifactSourceKind='MANUAL'|'LESSON_VERSION'|'REPORT_SNAPSHOT';
export type ArtifactObjectKind='DOCX'|'PDF'|'OTHER';
export type Artifact={id:string;workspace_id:string;artifact_type:ArtifactType;title:string;status:'active'|'archived';revision:number;current_version_id:string|null;created_at:string;updated_at:string};
export type ArtifactVersion={id:string;workspace_id:string;artifact_id:string;version_no:number;source_kind:ArtifactSourceKind;lesson_id:string|null;lesson_version_id:string|null;report_snapshot_id:string|null;canonical_text:string;structured_content:Record<string,unknown>;template_key:string|null;generator_provider:string|null;provenance:Record<string,unknown>;created_by:string;created_at:string};
export type ArtifactObject={id:string;workspace_id:string;artifact_id:string;artifact_version_id:string;object_kind:ArtifactObjectKind;state:'PENDING_UPLOAD'|'READY';storage_path:string;mime_type:string;byte_size:number;sha256:string|null;created_by:string;created_at:string;confirmed_at:string|null};
export type LessonSource={lesson_id:string;lesson_title:string;lesson_version_id:string;version_number:number;content_text:string};
export type ReportSource={id:string;class_id:string;snapshot_no:number;kind:'PROVISIONAL'|'FINALIZED';created_at:string};
export type ArtifactWorkspace={artifacts:Artifact[];versions:ArtifactVersion[];objects:ArtifactObject[];lessonSources:LessonSource[];reportSources:ReportSource[]};

export async function loadArtifactWorkspace(client:SupabaseClient,workspaceId:string):Promise<ArtifactWorkspace>{
  const[artifactsResult,versionsResult,objectsResult,lessonsResult,lessonVersionsResult,reportsResult]=await Promise.all([
    client.from('artifacts').select('*').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}),
    client.from('artifact_versions').select('*').eq('workspace_id',workspaceId).order('version_no',{ascending:false}),
    client.from('artifact_objects').select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false}),
    client.from('lessons').select('id,title').eq('workspace_id',workspaceId).eq('status','active').order('title'),
    client.from('lesson_versions').select('id,lesson_id,version_number,content_text').eq('workspace_id',workspaceId).order('version_number',{ascending:false}),
    client.from('report_snapshots').select('id,class_id,snapshot_no,kind,created_at').eq('workspace_id',workspaceId).order('created_at',{ascending:false}),
  ]);
  for(const result of[artifactsResult,versionsResult,objectsResult,lessonsResult,lessonVersionsResult,reportsResult])if(result.error)throw new Error(`Artifact workspace load failed: ${result.error.message}`);
  const lessons=new Map((lessonsResult.data??[]).map((row:any)=>[row.id,row.title]));
  const lessonSources=(lessonVersionsResult.data??[]).filter((row:any)=>lessons.has(row.lesson_id)).map((row:any)=>({lesson_id:row.lesson_id,lesson_title:lessons.get(row.lesson_id)!,lesson_version_id:row.id,version_number:row.version_number,content_text:row.content_text??''}));
  return{artifacts:(artifactsResult.data??[])as Artifact[],versions:(versionsResult.data??[])as ArtifactVersion[],objects:(objectsResult.data??[])as ArtifactObject[],lessonSources,reportSources:(reportsResult.data??[])as ReportSource[]};
}

export function latestLessonVersionByLesson(sources:LessonSource[]){
  const latest=new Map<string,LessonSource>();
  for(const source of sources){const current=latest.get(source.lesson_id);if(!current||source.version_number>current.version_number)latest.set(source.lesson_id,source);}
  return latest;
}
export function isArtifactVersionStale(version:ArtifactVersion,sources:LessonSource[]){
  if(version.source_kind!=='LESSON_VERSION'||!version.lesson_id||!version.lesson_version_id)return false;
  const latest=latestLessonVersionByLesson(sources).get(version.lesson_id);
  return Boolean(latest&&latest.lesson_version_id!==version.lesson_version_id);
}

export async function createArtifact(client:SupabaseClient,input:{opId:string;artifactType:ArtifactType;title:string;sourceKind:ArtifactSourceKind;lessonId?:string|null;lessonVersionId?:string|null;reportSnapshotId?:string|null;canonicalText:string;structuredContent?:Record<string,unknown>;templateKey?:string|null;generatorProvider?:string|null}){
  const{data,error}=await client.rpc('create_artifact_operation',{p_op_id:input.opId,p_artifact_type:input.artifactType,p_title:input.title,p_source_kind:input.sourceKind,p_lesson_id:input.lessonId??null,p_lesson_version_id:input.lessonVersionId??null,p_report_snapshot_id:input.reportSnapshotId??null,p_canonical_text:input.canonicalText,p_structured_content:input.structuredContent??{},p_template_key:input.templateKey??null,p_generator_provider:input.generatorProvider??null});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Artifact create RPC returned no result.');return row as{artifact_id:string;version_id:string;revision:number;replayed:boolean};
}
export async function appendArtifactVersion(client:SupabaseClient,input:{opId:string;artifactId:string;expectedRevision:number;sourceKind:ArtifactSourceKind;lessonId?:string|null;lessonVersionId?:string|null;reportSnapshotId?:string|null;canonicalText:string;structuredContent?:Record<string,unknown>;templateKey?:string|null;generatorProvider?:string|null}){
  const{data,error}=await client.rpc('append_artifact_version_operation',{p_op_id:input.opId,p_artifact_id:input.artifactId,p_expected_revision:input.expectedRevision,p_source_kind:input.sourceKind,p_lesson_id:input.lessonId??null,p_lesson_version_id:input.lessonVersionId??null,p_report_snapshot_id:input.reportSnapshotId??null,p_canonical_text:input.canonicalText,p_structured_content:input.structuredContent??{},p_template_key:input.templateKey??null,p_generator_provider:input.generatorProvider??null});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Artifact version RPC returned no result.');return row as{outcome:'saved'|'conflict';version_id:string|null;version_no:number|null;revision:number;replayed:boolean};
}
export async function archiveArtifact(client:SupabaseClient,input:{opId:string;artifactId:string;expectedRevision:number}){
  const{data,error}=await client.rpc('archive_artifact_operation',{p_op_id:input.opId,p_artifact_id:input.artifactId,p_expected_revision:input.expectedRevision});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Artifact archive RPC returned no result.');return row as{outcome:'saved'|'conflict';revision:number;replayed:boolean};
}
export async function reserveArtifactObject(client:SupabaseClient,input:{opId:string;artifactId:string;artifactVersionId:string;objectKind:ArtifactObjectKind;mimeType:string;byteSize:number}){
  const{data,error}=await client.rpc('reserve_artifact_object_operation',{p_op_id:input.opId,p_artifact_id:input.artifactId,p_artifact_version_id:input.artifactVersionId,p_object_kind:input.objectKind,p_mime_type:input.mimeType,p_byte_size:input.byteSize});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Artifact object reserve RPC returned no result.');return row as{outcome:'saved';object_id:string;storage_path:string;replayed:boolean};
}
export async function confirmArtifactObject(client:SupabaseClient,input:{opId:string;objectId:string;sha256:string;byteSize:number}){
  const{data,error}=await client.rpc('confirm_artifact_object_operation',{p_op_id:input.opId,p_object_id:input.objectId,p_sha256:input.sha256,p_byte_size:input.byteSize});
  if(error)throw new Error(error.message);const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Artifact object confirm RPC returned no result.');return row as{outcome:'saved';object_id:string;replayed:boolean};
}

export async function sha256Hex(file:Blob){const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function verifyExistingUpload(client:SupabaseClient,storagePath:string,file:File,expectedHash:string){
  const{data,error}=await client.storage.from('artifact-files').download(storagePath);
  if(error||!data)throw new Error(`Artifact retry verification failed: ${error?.message??'object missing'}`);
  const existingHash=await sha256Hex(data);
  if(data.size!==file.size||existingHash!==expectedHash)throw new Error('Artifact retry ditolak: object yang sudah ada tidak sama byte-for-byte dengan file ini. Buat artifact version baru bila file sumber berubah.');
}
export async function uploadArtifactObject(client:SupabaseClient,reservation:{objectId:string;storagePath:string;mimeType:string},file:File){
  const hash=await sha256Hex(file);
  const{error}=await client.storage.from('artifact-files').upload(reservation.storagePath,file,{upsert:false,contentType:reservation.mimeType});
  if(error){
    if(!/already exists/i.test(error.message))throw new Error(`Artifact upload failed: ${error.message}`);
    await verifyExistingUpload(client,reservation.storagePath,file,hash);
  }
  // objectId is itself a stable UUID, so it is also the deterministic confirm operation id.
  // A lost ACK after confirmation therefore replays the same AppliedOperation instead of
  // turning a successful READY object into an "already confirmed" false failure.
  await confirmArtifactObject(client,{opId:reservation.objectId,objectId:reservation.objectId,sha256:hash,byteSize:file.size});
  return hash;
}
export async function signedArtifactUrl(client:SupabaseClient,storagePath:string){const{data,error}=await client.storage.from('artifact-files').createSignedUrl(storagePath,120);if(error||!data?.signedUrl)throw new Error(`Artifact download failed: ${error?.message??'signed URL missing'}`);return data.signedUrl;}
