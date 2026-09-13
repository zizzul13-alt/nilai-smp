import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lesson, LessonVersion, Material } from '../../domain/academic';

export type LessonStudioContext={
  materials:Material[];
  lessons:Lesson[];
  lessonVersions:LessonVersion[];
};

export function nextLessonVersionNumber(versions:LessonVersion[],lessonId:string){
  return Math.max(0,...versions.filter(version=>version.lesson_id===lessonId).map(version=>version.version_number))+1;
}

export function latestLessonVersion(versions:LessonVersion[],lessonId:string){
  return versions.filter(version=>version.lesson_id===lessonId).sort((a,b)=>b.version_number-a.version_number)[0]??null;
}

export async function loadLessonStudio(client:SupabaseClient,workspaceId:string):Promise<LessonStudioContext>{
  const[materialResult,lessonResult,versionResult]=await Promise.all([
    client.from('materials').select('*').eq('workspace_id',workspaceId).eq('status','active').order('title',{ascending:true}),
    client.from('lessons').select('*').eq('workspace_id',workspaceId).eq('status','active').order('title',{ascending:true}),
    client.from('lesson_versions').select('*').eq('workspace_id',workspaceId).order('version_number',{ascending:false}),
  ]);
  if(materialResult.error)throw new Error(`Materi belum dapat dimuat: ${materialResult.error.message}`);
  if(lessonResult.error)throw new Error(`Pelajaran belum dapat dimuat: ${lessonResult.error.message}`);
  if(versionResult.error)throw new Error(`Versi pelajaran belum dapat dimuat: ${versionResult.error.message}`);
  return{
    materials:(materialResult.data??[])as Material[],
    lessons:(lessonResult.data??[])as Lesson[],
    lessonVersions:(versionResult.data??[])as LessonVersion[],
  };
}

export async function appendLessonVersion(client:SupabaseClient,input:{workspaceId:string;lessonId:string;contentText:string;draftId:string}){
  const contentText=input.contentText.trim();
  if(!contentText)throw new Error('Isi pelajaran tidak boleh kosong.');

  const latestQuery=await client.from('lesson_versions')
    .select('version_number')
    .eq('workspace_id',input.workspaceId)
    .eq('lesson_id',input.lessonId)
    .order('version_number',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(latestQuery.error)throw new Error(`Nomor versi pelajaran belum dapat ditentukan: ${latestQuery.error.message}`);
  const versionNumber=((latestQuery.data as {version_number:number}|null)?.version_number??0)+1;

  const inserted=await client.from('lesson_versions').insert({
    id:input.draftId,
    workspace_id:input.workspaceId,
    lesson_id:input.lessonId,
    version_number:versionNumber,
    content_text:contentText,
  }).select('*').single();
  if(!inserted.error)return{version:inserted.data as LessonVersion,replayed:false};

  // Lost acknowledgements must not tempt the UI into silently creating another semantic version.
  const replay=await client.from('lesson_versions').select('*').eq('workspace_id',input.workspaceId).eq('id',input.draftId).maybeSingle();
  if(replay.error)throw new Error(`Versi pelajaran belum terkonfirmasi: ${inserted.error.message}`);
  const existing=replay.data as LessonVersion|null;
  if(existing&&existing.lesson_id===input.lessonId&&existing.content_text===contentText)return{version:existing,replayed:true};

  throw new Error(`Versi pelajaran belum tersimpan. Muat ulang sebelum mencoba lagi: ${inserted.error.message}`);
}
