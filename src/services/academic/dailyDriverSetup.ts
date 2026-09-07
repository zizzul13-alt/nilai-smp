import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcademicClass, AcademicPeriod, AcademicYear, Enrollment, Lesson, Material, Student } from '../../domain/academic';

export type DailyDriverSetupContext={
  years:AcademicYear[];
  periods:AcademicPeriod[];
  classes:AcademicClass[];
  students:Student[];
  enrollments:Enrollment[];
  materials:Material[];
  lessons:Lesson[];
};

function keyFrom(label:string){
  const base=label.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'item';
  return `${base}-${crypto.randomUUID().slice(0,8)}`;
}

async function rows<T>(client:SupabaseClient,table:string,workspaceId:string,order='created_at'){
  const {data,error}=await client.from(table).select('*').eq('workspace_id',workspaceId).order(order,{ascending:true});
  if(error)throw new Error(`Setup load failed for ${table}: ${error.message}`);
  return (data??[]) as T[];
}

export async function loadDailyDriverSetup(client:SupabaseClient,workspaceId:string):Promise<DailyDriverSetupContext>{
  const[years,periods,classes,students,enrollments,materials,lessons]=await Promise.all([
    rows<AcademicYear>(client,'academic_years',workspaceId,'sort_order'),
    rows<AcademicPeriod>(client,'academic_periods',workspaceId,'sort_order'),
    rows<AcademicClass>(client,'classes',workspaceId,'display_name'),
    rows<Student>(client,'students',workspaceId,'display_name'),
    rows<Enrollment>(client,'enrollments',workspaceId,'created_at'),
    rows<Material>(client,'materials',workspaceId,'title'),
    rows<Lesson>(client,'lessons',workspaceId,'title'),
  ]);
  return{years,periods,classes,students,enrollments,materials,lessons};
}

async function insertOne<T>(client:SupabaseClient,table:string,payload:Record<string,unknown>):Promise<T>{
  const{data,error}=await client.from(table).insert(payload).select('*').single();
  if(error)throw new Error(`Tidak dapat menyimpan ${table}: ${error.message}`);
  return data as T;
}

export async function createAcademicYearForSetup(client:SupabaseClient,workspaceId:string,displayName:string,sortOrder:number){
  return insertOne<AcademicYear>(client,'academic_years',{workspace_id:workspaceId,identity_key:keyFrom(displayName),display_name:displayName.trim(),sort_order:sortOrder,status:'active'});
}
export async function createAcademicPeriodForSetup(client:SupabaseClient,workspaceId:string,academicYearId:string,displayName:string,sortOrder:number){
  return insertOne<AcademicPeriod>(client,'academic_periods',{workspace_id:workspaceId,academic_year_id:academicYearId,identity_key:keyFrom(displayName),display_name:displayName.trim(),sort_order:sortOrder,status:'active'});
}
export async function createClassForSetup(client:SupabaseClient,workspaceId:string,academicPeriodId:string,displayName:string){
  return insertOne<AcademicClass>(client,'classes',{workspace_id:workspaceId,academic_period_id:academicPeriodId,identity_key:keyFrom(displayName),display_name:displayName.trim(),status:'active'});
}
export async function createStudentForSetup(client:SupabaseClient,workspaceId:string,displayName:string,nis:string){
  return insertOne<Student>(client,'students',{workspace_id:workspaceId,display_name:displayName.trim(),nis:nis.trim()||null,nisn:null,status:'active'});
}
export async function createEnrollmentForSetup(client:SupabaseClient,workspaceId:string,studentId:string,classId:string){
  return insertOne<Enrollment>(client,'enrollments',{workspace_id:workspaceId,student_id:studentId,class_id:classId,status:'active',started_on:null,ended_on:null});
}
export async function createMaterialForSetup(client:SupabaseClient,workspaceId:string,title:string){
  return insertOne<Material>(client,'materials',{workspace_id:workspaceId,title:title.trim(),status:'active'});
}
export async function createLessonForSetup(client:SupabaseClient,workspaceId:string,materialId:string,title:string){
  return insertOne<Lesson>(client,'lessons',{workspace_id:workspaceId,material_id:materialId,title:title.trim(),status:'active'});
}
