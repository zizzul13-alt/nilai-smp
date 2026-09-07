import {useEffect,useMemo,useState} from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{
  createAcademicPeriodForSetup,createAcademicYearForSetup,createClassForSetup,createEnrollmentForSetup,createLessonForSetup,createMaterialForSetup,createStudentForSetup,loadDailyDriverSetup,type DailyDriverSetupContext,
}from'../services/academic/dailyDriverSetup';

type Props={client:SupabaseClient;workspaceId:string;onReady?:()=>void};
const nextSort=(rows:{sort_order:number}[])=>Math.max(0,...rows.map(row=>row.sort_order))+1;

export function DailyDriverSetup({client,workspaceId,onReady}:Props){
  const[context,setContext]=useState<DailyDriverSetupContext|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const[year,setYear]=useState(''),[period,setPeriod]=useState(''),[className,setClassName]=useState(''),[student,setStudent]=useState(''),[nis,setNis]=useState(''),[material,setMaterial]=useState(''),[lesson,setLesson]=useState('');
  const[selectedYear,setSelectedYear]=useState(''),[selectedPeriod,setSelectedPeriod]=useState(''),[selectedClass,setSelectedClass]=useState(''),[selectedStudent,setSelectedStudent]=useState(''),[selectedMaterial,setSelectedMaterial]=useState('');

  async function refresh(){
    const next=await loadDailyDriverSetup(client,workspaceId);setContext(next);
    setSelectedYear(current=>current&&next.years.some(x=>x.id===current)?current:next.years[0]?.id??'');
    setSelectedPeriod(current=>current&&next.periods.some(x=>x.id===current)?current:next.periods[0]?.id??'');
    setSelectedClass(current=>current&&next.classes.some(x=>x.id===current)?current:next.classes[0]?.id??'');
    setSelectedStudent(current=>current&&next.students.some(x=>x.id===current)?current:next.students[0]?.id??'');
    setSelectedMaterial(current=>current&&next.materials.some(x=>x.id===current)?current:next.materials[0]?.id??'');
  }
  useEffect(()=>{let active=true;void loadDailyDriverSetup(client,workspaceId).then(next=>{if(!active)return;setContext(next);setSelectedYear(next.years[0]?.id??'');setSelectedPeriod(next.periods[0]?.id??'');setSelectedClass(next.classes[0]?.id??'');setSelectedStudent(next.students[0]?.id??'');setSelectedMaterial(next.materials[0]?.id??'');}).catch(e=>{if(active)setMessage(e instanceof Error?e.message:String(e));});return()=>{active=false};},[client,workspaceId]);
  const ready=useMemo(()=>Boolean(context?.years.length&&context.periods.length&&context.classes.length&&context.students.length&&context.enrollments.length),[context]);
  async function run(task:()=>Promise<unknown>,clear:()=>void,text:string){setBusy(true);setMessage('');try{await task();clear();await refresh();setMessage(text);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  if(!context)return<section className="setup-shell"><h1>Menyiapkan data guru…</h1>{message?<p role="alert">{message}</p>:null}</section>;
  const periodsForYear=context.periods.filter(x=>x.academic_year_id===selectedYear);
  return<section className="setup-shell">
    <header><p className="eyebrow">Data & setup</p><h1>Siapkan kelas untuk dipakai sehari-hari</h1><p className="muted">Buat hanya data yang benar-benar ada. Schedule tidak dibuat otomatis dan Setup tidak pernah menciptakan Meeting.</p></header>
    <div className="setup-progress"><strong>{ready?'Siap mengajar':'Belum lengkap'}</strong><span>{context.classes.length} kelas · {context.students.length} siswa · {context.enrollments.length} enrollment · {context.lessons.length} lesson</span></div>
    <div className="setup-grid">
      <section className="setup-card"><h2>1 · Tahun ajaran</h2><input value={year} onChange={e=>setYear(e.target.value)} placeholder="2026/2027"/><button disabled={busy||!year.trim()} onClick={()=>void run(()=>createAcademicYearForSetup(client,workspaceId,year,nextSort(context.years)),()=>setYear(''),'Tahun ajaran tersimpan.')}>Tambah tahun</button></section>
      <section className="setup-card"><h2>2 · Periode</h2><select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}><option value="">Pilih tahun ajaran</option>{context.years.map(x=><option key={x.id} value={x.id}>{x.display_name}</option>)}</select><input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="Semester 1"/><button disabled={busy||!selectedYear||!period.trim()} onClick={()=>void run(()=>createAcademicPeriodForSetup(client,workspaceId,selectedYear,period,nextSort(periodsForYear)),()=>setPeriod(''),'Periode tersimpan.')}>Tambah periode</button></section>
      <section className="setup-card"><h2>3 · Kelas</h2><select value={selectedPeriod} onChange={e=>setSelectedPeriod(e.target.value)}><option value="">Pilih periode</option>{context.periods.map(x=><option key={x.id} value={x.id}>{x.display_name}</option>)}</select><input value={className} onChange={e=>setClassName(e.target.value)} placeholder="VIII A"/><button disabled={busy||!selectedPeriod||!className.trim()} onClick={()=>void run(()=>createClassForSetup(client,workspaceId,selectedPeriod,className),()=>setClassName(''),'Kelas tersimpan.')}>Tambah kelas</button></section>
      <section className="setup-card"><h2>4 · Siswa</h2><input value={student} onChange={e=>setStudent(e.target.value)} placeholder="Nama siswa"/><input value={nis} onChange={e=>setNis(e.target.value)} placeholder="NIS (opsional)"/><button disabled={busy||!student.trim()} onClick={()=>void run(()=>createStudentForSetup(client,workspaceId,student,nis),()=>{setStudent('');setNis('')},'Siswa tersimpan.')}>Tambah siswa</button></section>
      <section className="setup-card"><h2>5 · Enrollment</h2><select value={selectedStudent} onChange={e=>setSelectedStudent(e.target.value)}><option value="">Pilih siswa</option>{context.students.map(x=><option key={x.id} value={x.id}>{x.display_name}</option>)}</select><select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}><option value="">Pilih kelas</option>{context.classes.map(x=><option key={x.id} value={x.id}>{x.display_name}</option>)}</select><button disabled={busy||!selectedStudent||!selectedClass} onClick={()=>void run(()=>createEnrollmentForSetup(client,workspaceId,selectedStudent,selectedClass),()=>{},'Enrollment tersimpan.')}>Masukkan ke kelas</button></section>
      <section className="setup-card"><h2>6 · Materi & Lesson</h2><input value={material} onChange={e=>setMaterial(e.target.value)} placeholder="Materi, mis. Gaya"/><button disabled={busy||!material.trim()} onClick={()=>void run(()=>createMaterialForSetup(client,workspaceId,material),()=>setMaterial(''),'Material tersimpan.')}>Tambah material</button><select value={selectedMaterial} onChange={e=>setSelectedMaterial(e.target.value)}><option value="">Pilih material</option>{context.materials.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select><input value={lesson} onChange={e=>setLesson(e.target.value)} placeholder="Lesson, mis. Gesekan"/><button disabled={busy||!selectedMaterial||!lesson.trim()} onClick={()=>void run(()=>createLessonForSetup(client,workspaceId,selectedMaterial,lesson),()=>setLesson(''),'Lesson tersimpan.')}>Tambah lesson</button></section>
    </div>
    {message?<p className="work-message" role="status">{message}</p>:null}
    {ready&&onReady?<button type="button" className="continue-primary" onClick={onReady}>Kembali ke Today</button>:null}
  </section>;
}
