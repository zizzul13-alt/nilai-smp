import type{SupabaseClient}from'@supabase/supabase-js';
import{readBrowserConfig}from'../../config/env';
import{appendArtifactVersion,createArtifact,loadArtifactWorkspace,type ArtifactType}from'../artifacts/artifacts';

export type LessonPackageProfile={subject:string;classLabel:string;duration:string;notes:string};
export type LessonPackageGenerationSource={lessonTitle:string;materialTitle:string;contentText:string};
export type LessonPackageSource=LessonPackageGenerationSource&{lessonId:string;lessonVersionId:string;versionNumber:number};
export type LessonPackageDraft={rpp:string;modul_ajar:string;lkpd:string;bahan_ajar:string;tugas:string;ulangan:string;provider:string;model:string};
export type LessonSeedDraft={lesson_content:string;provider:string;model:string};
export type LessonPackageOutputKey='RPP'|'MODUL_AJAR'|'LKPD'|'BAHAN_AJAR'|'TUGAS'|'ULANGAN';
export type LessonPackageSaveIds=Record<LessonPackageOutputKey,string>;
export type LessonPackageSaveTarget={mode:'create'}|{mode:'append';artifactId:string;expectedRevision:number};
export type LessonPackageSavePlan=Record<LessonPackageOutputKey,LessonPackageSaveTarget>;

type DraftTextField=keyof Pick<LessonPackageDraft,'rpp'|'modul_ajar'|'lkpd'|'bahan_ajar'|'tugas'|'ulangan'>;
type OutputSpec={key:LessonPackageOutputKey;artifactType:ArtifactType;titlePrefix:string;field:DraftTextField};
const OUTPUTS:OutputSpec[]=[
  {key:'RPP',artifactType:'RPP',titlePrefix:'RPP',field:'rpp'},
  {key:'MODUL_AJAR',artifactType:'MODUL_AJAR',titlePrefix:'Modul Ajar',field:'modul_ajar'},
  {key:'LKPD',artifactType:'LKPD',titlePrefix:'LKPD',field:'lkpd'},
  {key:'BAHAN_AJAR',artifactType:'OTHER',titlePrefix:'Bahan Ajar',field:'bahan_ajar'},
  {key:'TUGAS',artifactType:'OTHER',titlePrefix:'Tugas',field:'tugas'},
  {key:'ULANGAN',artifactType:'OTHER',titlePrefix:'Ulangan',field:'ulangan'},
];

export function lessonPackageTemplateKey(kind:LessonPackageOutputKey,lessonId:string){return`lesson-package-v1:${kind.toLowerCase()}:${lessonId}`;}
export function newLessonPackageSaveIds():LessonPackageSaveIds{return{RPP:crypto.randomUUID(),MODUL_AJAR:crypto.randomUUID(),LKPD:crypto.randomUUID(),BAHAN_AJAR:crypto.randomUUID(),TUGAS:crypto.randomUUID(),ULANGAN:crypto.randomUUID()};}

function validDraft(value:unknown):value is LessonPackageDraft{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  const textKeys=['rpp','modul_ajar','lkpd','bahan_ajar','tugas','ulangan']as const;
  return textKeys.every(key=>typeof row[key]==='string'&&(row[key]as string).trim().length>0&&(row[key]as string).length<=18000)
    &&typeof row.provider==='string'&&row.provider.length>0&&row.provider.length<=120
    &&typeof row.model==='string'&&row.model.length>0&&row.model.length<=200;
}
function validSeed(value:unknown):value is LessonSeedDraft{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.lesson_content==='string'&&row.lesson_content.trim().length>0&&row.lesson_content.length<=50_000
    &&typeof row.provider==='string'&&row.provider.length>0&&row.provider.length<=120
    &&typeof row.model==='string'&&row.model.length>0&&row.model.length<=200;
}

async function authHeaders(client:SupabaseClient){
  const[{data:{session}},configResult]=await Promise.all([client.auth.getSession(),Promise.resolve(readBrowserConfig())]);
  if(!session?.access_token)throw new Error('Sesi masuk tidak tersedia untuk membuat draf AI.');
  if(!configResult.ok)throw new Error('Konfigurasi browser belum siap untuk membuat draf AI.');
  return{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'X-Supabase-Publishable-Key':configResult.config.supabasePublishableKey};
}
async function aiPost(client:SupabaseClient,path:string,body:unknown,label:string){
  const headers=await authHeaders(client);
  const response=await fetch(path,{method:'POST',headers,body:JSON.stringify(body)});
  if(!response.ok){
    let code='HTTP_ERROR';
    try{const value=await response.json()as{error?:unknown};if(typeof value.error==='string'&&/^[a-z0-9_]+$/i.test(value.error))code=value.error.toUpperCase();}catch{/* bounded diagnostic */}
    throw new Error(`${label} belum dapat dibuat: ${code} (${response.status}).`);
  }
  return response.json()as Promise<unknown>;
}

export async function generateLessonSeed(client:SupabaseClient,input:{lessonTitle:string;materialTitle:string;profile:LessonPackageProfile}){
  if(!input.lessonTitle.trim())throw new Error('Judul/topik pelajaran wajib diisi.');
  const value=await aiPost(client,'/api/lesson-seed',input,'Draf materi');
  if(!validSeed(value))throw new Error('Draf materi dari AI tidak memiliki bentuk yang valid.');
  return value;
}

export async function generateLessonPackage(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile}){
  if(!input.source.contentText.trim())throw new Error('Isi materi sumber masih kosong.');
  const value=await aiPost(client,'/api/lesson-package',input,'Draf paket');
  if(!validDraft(value))throw new Error('Draf paket dari AI tidak memiliki bentuk yang valid.');
  return value;
}

export async function planLessonPackageSave(client:SupabaseClient,workspaceId:string,lessonId:string):Promise<LessonPackageSavePlan>{
  const workspace=await loadArtifactWorkspace(client,workspaceId);
  const plan={}as LessonPackageSavePlan;
  for(const spec of OUTPUTS){
    const templateKey=lessonPackageTemplateKey(spec.key,lessonId);
    const existing=workspace.versions
      .filter(version=>version.template_key===templateKey)
      .sort((a,b)=>b.version_no-a.version_no)
      .map(version=>workspace.artifacts.find(artifact=>artifact.id===version.artifact_id))
      .find(artifact=>artifact?.status==='active');
    plan[spec.key]=existing?{mode:'append',artifactId:existing.id,expectedRevision:existing.revision}:{mode:'create'};
  }
  return plan;
}

export async function saveLessonPackageArtifacts(client:SupabaseClient,input:{source:LessonPackageSource;profile:LessonPackageProfile;draft:LessonPackageDraft;operationIds:LessonPackageSaveIds;plan:LessonPackageSavePlan}){
  const saved:Array<{kind:LessonPackageOutputKey;artifactId:string;versionId:string|null;versionNo:number|null;replayed:boolean}>=[];

  for(const spec of OUTPUTS){
    const canonicalText=input.draft[spec.field].trim();
    if(!canonicalText)throw new Error(`${spec.titlePrefix} kosong; paket belum disimpan.`);
    const templateKey=lessonPackageTemplateKey(spec.key,input.source.lessonId);
    const structuredContent={package_version:1,output_kind:spec.key,generator_model:input.draft.model,lesson_version_number:input.source.versionNumber,profile:input.profile};
    const common={sourceKind:'LESSON_VERSION'as const,lessonId:input.source.lessonId,lessonVersionId:input.source.lessonVersionId,reportSnapshotId:null,canonicalText,structuredContent,templateKey,generatorProvider:input.draft.provider};
    const target=input.plan[spec.key];

    if(target.mode==='append'){
      const result=await appendArtifactVersion(client,{opId:input.operationIds[spec.key],artifactId:target.artifactId,expectedRevision:target.expectedRevision,...common});
      if(result.outcome==='conflict')throw new Error(`${spec.titlePrefix} berubah di tempat lain. Muat ulang Dokumen lalu buat ulang draf sebelum mencoba lagi.`);
      saved.push({kind:spec.key,artifactId:target.artifactId,versionId:result.version_id,versionNo:result.version_no,replayed:result.replayed});
      continue;
    }

    const result=await createArtifact(client,{opId:input.operationIds[spec.key],artifactType:spec.artifactType,title:`${spec.titlePrefix} · ${input.source.lessonTitle}`,...common});
    saved.push({kind:spec.key,artifactId:result.artifact_id,versionId:result.version_id,versionNo:1,replayed:result.replayed});
  }

  return saved;
}
