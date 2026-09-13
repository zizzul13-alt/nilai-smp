import type{SupabaseClient}from'@supabase/supabase-js';
import{readBrowserConfig}from'../../config/env';
import{appendArtifactVersion,createArtifact,loadArtifactWorkspace,type ArtifactType}from'../artifacts/artifacts';

export type LessonPackageProfile={subject:string;classLabel:string;duration:string;notes:string};
export type LessonPackageGenerationSource={lessonTitle:string;materialTitle:string;contentText:string};
export type LessonPackageSource=LessonPackageGenerationSource&{lessonId:string;lessonVersionId:string;versionNumber:number};
export type LessonGenerationMode='quick'|'deep';
export type LessonDeepPlan={
  objectives:string[];scope:string[];core_concepts:string[];prerequisites:string[];misconceptions:string[];teaching_sequence:string[];guided_examples:string[];activities:string[];checks_for_understanding:string[];differentiation:string[];assessment_targets:string[];
};
export type LessonPackageDraft={rpp:string;modul_ajar:string;lkpd:string;bahan_ajar:string;tugas:string;ulangan:string;provider:string;model:string;generation_mode?:LessonGenerationMode};
export type LessonSeedDraft={lesson_content:string;provider:string;model:string;generation_mode?:LessonGenerationMode};
export type LessonDeepBundle={seed:LessonSeedDraft;draft:LessonPackageDraft;plan:LessonDeepPlan};
export type LessonDeepPackageResult={draft:LessonPackageDraft;plan:LessonDeepPlan};
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
const PLAN_KEYS=['objectives','scope','core_concepts','prerequisites','misconceptions','teaching_sequence','guided_examples','activities','checks_for_understanding','differentiation','assessment_targets']as const;
const DOCUMENT_FIELDS:{kind:LessonPackageOutputKey;field:DraftTextField}[]=[
  {kind:'RPP',field:'rpp'},{kind:'MODUL_AJAR',field:'modul_ajar'},{kind:'LKPD',field:'lkpd'},{kind:'BAHAN_AJAR',field:'bahan_ajar'},{kind:'TUGAS',field:'tugas'}
];

export function lessonPackageTemplateKey(kind:LessonPackageOutputKey,lessonId:string){return`lesson-package-v1:${kind.toLowerCase()}:${lessonId}`;}
export function newLessonPackageSaveIds():LessonPackageSaveIds{return{RPP:crypto.randomUUID(),MODUL_AJAR:crypto.randomUUID(),LKPD:crypto.randomUUID(),BAHAN_AJAR:crypto.randomUUID(),TUGAS:crypto.randomUUID(),ULANGAN:crypto.randomUUID()};}

function validDraft(value:unknown):value is LessonPackageDraft{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  const textKeys=['rpp','modul_ajar','lkpd','bahan_ajar','tugas','ulangan']as const;
  const modeOk=row.generation_mode===undefined||row.generation_mode==='quick'||row.generation_mode==='deep';
  return textKeys.every(key=>typeof row[key]==='string'&&(row[key]as string).trim().length>0&&(row[key]as string).length<=18000)
    &&typeof row.provider==='string'&&row.provider.length>0&&row.provider.length<=120
    &&typeof row.model==='string'&&row.model.length>0&&row.model.length<=200&&modeOk;
}
function validSeed(value:unknown):value is LessonSeedDraft{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  const modeOk=row.generation_mode===undefined||row.generation_mode==='quick'||row.generation_mode==='deep';
  return typeof row.lesson_content==='string'&&row.lesson_content.trim().length>0&&row.lesson_content.length<=50_000
    &&typeof row.provider==='string'&&row.provider.length>0&&row.provider.length<=120
    &&typeof row.model==='string'&&row.model.length>0&&row.model.length<=200&&modeOk;
}
function validPlan(value:unknown):value is LessonDeepPlan{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return PLAN_KEYS.every(key=>Array.isArray(row[key])&&(row[key]as unknown[]).length>0&&(row[key]as unknown[]).every(item=>typeof item==='string'&&item.trim().length>0));
}
function validProviderEnvelope(value:unknown){if(!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;if(typeof row.provider!=='string'||!row.provider||typeof row.model!=='string'||!row.model)return null;return{provider:row.provider,model:row.model};}
function validTextEnvelope(value:unknown){const provider=validProviderEnvelope(value);if(!provider||!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;if(typeof row.text!=='string'||!row.text.trim()||row.text.length>24_000)return null;return{text:row.text,...provider};}
function validBlueprintEnvelope(value:unknown){const provider=validProviderEnvelope(value);if(!provider||!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;if(typeof row.blueprint!=='string'||!row.blueprint.trim()||row.blueprint.length>12_000)return null;return{blueprint:row.blueprint,...provider};}
function validPlanEnvelope(value:unknown){const provider=validProviderEnvelope(value);if(!provider||!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;if(!validPlan(row.plan))return null;return{plan:row.plan,...provider};}

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
  return{...value,generation_mode:'quick' as const};
}

export async function generateLessonPackage(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile}){
  if(!input.source.contentText.trim())throw new Error('Isi materi sumber masih kosong.');
  const value=await aiPost(client,'/api/lesson-package',input,'Draf paket');
  if(!validDraft(value))throw new Error('Draf paket dari AI tidak memiliki bentuk yang valid.');
  return{...value,generation_mode:'quick' as const};
}

async function generateDeepPlan(client:SupabaseClient,input:{lessonTitle:string;materialTitle:string;profile:LessonPackageProfile;sourceContent?:string}){
  const raw=await aiPost(client,'/api/lesson-deep-plan',input,'Planning pass mendalam');
  const value=validPlanEnvelope(raw);
  if(!value)throw new Error('Planning pass AI tidak memiliki bentuk yang valid.');
  return value;
}

async function generateDeepContent(client:SupabaseClient,input:{lessonTitle:string;materialTitle:string;profile:LessonPackageProfile;plan:LessonDeepPlan}){
  const raw=await aiPost(client,'/api/lesson-deep-content',input,'Materi mendalam');
  const value=validTextEnvelope(raw);
  if(!value)throw new Error('Materi mendalam AI tidak memiliki bentuk yang valid.');
  return value;
}

async function generateAssessmentBlueprint(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile;plan:LessonDeepPlan}){
  const raw=await aiPost(client,'/api/lesson-assessment-blueprint',input,'Blueprint ulangan');
  const value=validBlueprintEnvelope(raw);
  if(!value)throw new Error('Blueprint ulangan AI tidak memiliki bentuk yang valid.');
  return value;
}

async function generateDeepDocument(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile;plan:LessonDeepPlan;kind:LessonPackageOutputKey;assessmentBlueprint?:string}){
  const raw=await aiPost(client,'/api/lesson-deep-document',input,`Draf ${input.kind}`);
  const value=validTextEnvelope(raw);
  if(!value)throw new Error(`Draf ${input.kind} AI tidak memiliki bentuk yang valid.`);
  return value;
}

async function generateDeepDocuments(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile;plan:LessonDeepPlan}):Promise<LessonPackageDraft>{
  const regularPromise=Promise.all(DOCUMENT_FIELDS.map(async spec=>({spec,value:await generateDeepDocument(client,{...input,kind:spec.kind})})));
  const blueprint=await generateAssessmentBlueprint(client,input);
  const ulanganPromise=generateDeepDocument(client,{...input,kind:'ULANGAN',assessmentBlueprint:blueprint.blueprint});
  const[regular,ulangan]=await Promise.all([regularPromise,ulanganPromise]);
  const draft={}as Pick<LessonPackageDraft,DraftTextField>;
  for(const item of regular)draft[item.spec.field]=item.value.text;
  draft.ulangan=ulangan.text;
  const provider=regular[0]?.value.provider??ulangan.provider;
  const model=regular[0]?.value.model??ulangan.model;
  return{...draft,provider,model,generation_mode:'deep'};
}

export async function generateLessonDeepBundle(client:SupabaseClient,input:{lessonTitle:string;materialTitle:string;profile:LessonPackageProfile}):Promise<LessonDeepBundle>{
  if(!input.lessonTitle.trim())throw new Error('Judul/topik pelajaran wajib diisi.');
  const planResult=await generateDeepPlan(client,input);
  const contentResult=await generateDeepContent(client,{...input,plan:planResult.plan});
  const source={lessonTitle:input.lessonTitle,materialTitle:input.materialTitle,contentText:contentResult.text};
  const draft=await generateDeepDocuments(client,{source,profile:input.profile,plan:planResult.plan});
  return{seed:{lesson_content:contentResult.text,provider:contentResult.provider,model:contentResult.model,generation_mode:'deep'},draft,plan:planResult.plan};
}

export async function generateLessonDeepPackage(client:SupabaseClient,input:{source:LessonPackageGenerationSource;profile:LessonPackageProfile}):Promise<LessonDeepPackageResult>{
  if(!input.source.contentText.trim())throw new Error('Isi materi sumber masih kosong.');
  const planResult=await generateDeepPlan(client,{lessonTitle:input.source.lessonTitle,materialTitle:input.source.materialTitle,profile:input.profile,sourceContent:input.source.contentText});
  const draft=await generateDeepDocuments(client,{source:input.source,profile:input.profile,plan:planResult.plan});
  return{draft,plan:planResult.plan};
}

export async function planLessonPackageSave(client:SupabaseClient,workspaceId:string,lessonId:string):Promise<LessonPackageSavePlan>{
  const workspace=await loadArtifactWorkspace(client,workspaceId);
  const plan={}as LessonPackageSavePlan;
  for(const spec of OUTPUTS){
    const templateKey=lessonPackageTemplateKey(spec.key,lessonId);
    const existing=workspace.versions.filter(version=>version.template_key===templateKey).sort((a,b)=>b.version_no-a.version_no).map(version=>workspace.artifacts.find(artifact=>artifact.id===version.artifact_id)).find(artifact=>artifact?.status==='active');
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
    const structuredContent={package_version:2,output_kind:spec.key,generator_model:input.draft.model,generation_mode:input.draft.generation_mode??'quick',lesson_version_number:input.source.versionNumber,profile:input.profile};
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