import type{SupabaseClient}from'@supabase/supabase-js';
import{readBrowserConfig}from'../../config/env';
import{appendArtifactVersion,createArtifact,loadArtifactWorkspace,type ArtifactType}from'../artifacts/artifacts';

export type LessonPackageProfile={subject:string;classLabel:string;duration:string;notes:string};
export type LessonPackageSource={lessonId:string;lessonVersionId:string;lessonTitle:string;materialTitle:string;versionNumber:number;contentText:string};
export type LessonPackageDraft={rpp:string;modul_ajar:string;lkpd:string;bahan_ajar:string;provider:string;model:string};
export type LessonPackageOutputKey='RPP'|'MODUL_AJAR'|'LKPD'|'BAHAN_AJAR';
export type LessonPackageSaveIds=Record<LessonPackageOutputKey,string>;

type OutputSpec={key:LessonPackageOutputKey;artifactType:ArtifactType;titlePrefix:string;field:keyof Pick<LessonPackageDraft,'rpp'|'modul_ajar'|'lkpd'|'bahan_ajar'>};
const OUTPUTS:OutputSpec[]=[
  {key:'RPP',artifactType:'RPP',titlePrefix:'RPP',field:'rpp'},
  {key:'MODUL_AJAR',artifactType:'MODUL_AJAR',titlePrefix:'Modul Ajar',field:'modul_ajar'},
  {key:'LKPD',artifactType:'LKPD',titlePrefix:'LKPD',field:'lkpd'},
  {key:'BAHAN_AJAR',artifactType:'OTHER',titlePrefix:'Bahan Ajar',field:'bahan_ajar'},
];

export function lessonPackageTemplateKey(kind:LessonPackageOutputKey,lessonId:string){return`lesson-package-v1:${kind.toLowerCase()}:${lessonId}`;}
export function newLessonPackageSaveIds():LessonPackageSaveIds{return{RPP:crypto.randomUUID(),MODUL_AJAR:crypto.randomUUID(),LKPD:crypto.randomUUID(),BAHAN_AJAR:crypto.randomUUID()};}

function validDraft(value:unknown):value is LessonPackageDraft{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  const textKeys=['rpp','modul_ajar','lkpd','bahan_ajar'] as const;
  return textKeys.every(key=>typeof row[key]==='string'&&(row[key]as string).trim().length>0&&(row[key]as string).length<=18000)
    &&typeof row.provider==='string'&&row.provider.length>0&&row.provider.length<=120
    &&typeof row.model==='string'&&row.model.length>0&&row.model.length<=200;
}

export async function generateLessonPackage(client:SupabaseClient,input:{source:LessonPackageSource;profile:LessonPackageProfile}){
  if(!input.source.contentText.trim())throw new Error('LessonVersion sumber masih kosong.');
  const[{data:{session}},configResult]=await Promise.all([client.auth.getSession(),Promise.resolve(readBrowserConfig())]);
  if(!session?.access_token)throw new Error('Sesi masuk tidak tersedia untuk membuat draf AI.');
  if(!configResult.ok)throw new Error('Konfigurasi browser belum siap untuk membuat draf AI.');
  const response=await fetch('/api/lesson-package',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'X-Supabase-Publishable-Key':configResult.config.supabasePublishableKey},body:JSON.stringify(input)});
  if(!response.ok){
    let code='HTTP_ERROR';
    try{const value=await response.json()as{error?:unknown};if(typeof value.error==='string'&&/^[a-z0-9_]+$/i.test(value.error))code=value.error.toUpperCase();}catch{/* bounded diagnostic */}
    throw new Error(`Draf paket belum dapat dibuat: ${code} (${response.status}).`);
  }
  const value=await response.json()as unknown;
  if(!validDraft(value))throw new Error('Draf paket dari AI tidak memiliki bentuk yang valid.');
  return value;
}

export async function saveLessonPackageArtifacts(client:SupabaseClient,input:{workspaceId:string;source:LessonPackageSource;profile:LessonPackageProfile;draft:LessonPackageDraft;operationIds:LessonPackageSaveIds}){
  const workspace=await loadArtifactWorkspace(client,input.workspaceId);
  const saved:Array<{kind:LessonPackageOutputKey;artifactId:string;versionId:string|null;versionNo:number|null;replayed:boolean}>=[];

  for(const spec of OUTPUTS){
    const canonicalText=input.draft[spec.field].trim();
    if(!canonicalText)throw new Error(`${spec.titlePrefix} kosong; paket belum disimpan.`);
    const templateKey=lessonPackageTemplateKey(spec.key,input.source.lessonId);
    const existing=workspace.versions
      .filter(version=>version.template_key===templateKey)
      .sort((a,b)=>b.version_no-a.version_no)
      .map(version=>({version,artifact:workspace.artifacts.find(artifact=>artifact.id===version.artifact_id)}))
      .find(item=>item.artifact?.status==='active');
    const structuredContent={package_version:1,output_kind:spec.key,generator_model:input.draft.model,lesson_version_number:input.source.versionNumber,profile:input.profile};
    const common={sourceKind:'LESSON_VERSION' as const,lessonId:input.source.lessonId,lessonVersionId:input.source.lessonVersionId,reportSnapshotId:null,canonicalText,structuredContent,templateKey,generatorProvider:input.draft.provider};

    if(existing?.artifact){
      const result=await appendArtifactVersion(client,{opId:input.operationIds[spec.key],artifactId:existing.artifact.id,expectedRevision:existing.artifact.revision,...common});
      if(result.outcome==='conflict')throw new Error(`${spec.titlePrefix} berubah di tempat lain. Muat ulang Dokumen lalu coba lagi.`);
      saved.push({kind:spec.key,artifactId:existing.artifact.id,versionId:result.version_id,versionNo:result.version_no,replayed:result.replayed});
      continue;
    }

    const result=await createArtifact(client,{opId:input.operationIds[spec.key],artifactType:spec.artifactType,title:`${spec.titlePrefix} · ${input.source.lessonTitle}`,...common});
    saved.push({kind:spec.key,artifactId:result.artifact_id,versionId:result.version_id,versionNo:1,replayed:result.replayed});
  }

  return saved;
}
