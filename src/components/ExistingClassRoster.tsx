import {useMemo,useState} from 'react';
import type{DailyDriverSetupContext}from'../services/academic/dailyDriverSetup';

export function ExistingClassRoster({context}:{context:DailyDriverSetupContext}){
  const[selectedClass,setSelectedClass]=useState(context.classes[0]?.id??'');
  const roster=useMemo(()=>{
    const studentIds=new Set(context.enrollments.filter(row=>row.class_id===selectedClass).map(row=>row.student_id));
    return context.students.filter(row=>studentIds.has(row.id)).sort((a,b)=>a.display_name.localeCompare(b.display_name,'id'));
  },[context,selectedClass]);
  return <section className="existing-data-browser" aria-labelledby="existing-data-title">
    <div className="existing-data-heading"><div><p className="eyebrow">Data yang sudah ada</p><h2 id="existing-data-title">Kelas & siswa</h2></div><span>{context.classes.length} kelas · {context.students.length} siswa</span></div>
    {context.classes.length===0?<p className="muted">Belum ada kelas. Tambahkan kelas lewat setup di bawah.</p>:<>
      <label className="field-label">Pilih kelas<select value={selectedClass} onChange={event=>setSelectedClass(event.target.value)}>{context.classes.map(row=><option key={row.id} value={row.id}>{row.display_name}</option>)}</select></label>
      <div className="roster-summary"><strong>{context.classes.find(row=>row.id===selectedClass)?.display_name??'Kelas'}</strong><span>{roster.length} siswa terdaftar</span></div>
      {roster.length?<ol className="student-roster">{roster.map(student=><li key={student.id}><span>{student.display_name}</span><small>{student.nis??student.nisn??'Tanpa NIS/NISN'}</small></li>)}</ol>:<p className="empty-state">Belum ada siswa yang terdaftar di kelas ini.</p>}
    </>}
  </section>;
}
