import {useCallback,useEffect,useMemo,useState} from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{archivePlannedSchedule,createPlannedSchedule,loadPlannedScheduleContexts,updatePlannedSchedule,type PlannedScheduleInput,type PlannedSlotContext}from'../services/academic/plannedTimetable';

type Props={client:SupabaseClient;workspaceId:string};
type ClassOption={id:string;display_name:string};
type EditState={id:string|null;revision:number|null;input:PlannedScheduleInput};
const DAYS=['','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
const today=()=>{const d=new Date(),pad=(n:number)=>String(n).padStart(2,'0');return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const emptyInput=(classId=''):PlannedScheduleInput=>({classId,weekday:1,localStartTime:'07:00',localEndTime:'07:40',effectiveFrom:today(),effectiveUntil:null});

export function PlannedTimetable({client,workspaceId}:Props){
 const[slots,setSlots]=useState<PlannedSlotContext[]>([]),[classes,setClasses]=useState<ClassOption[]>([]),[edit,setEdit]=useState<EditState>({id:null,revision:null,input:emptyInput()}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{setMessage('');try{const[rows,classQ]=await Promise.all([loadPlannedScheduleContexts(client,workspaceId),client.from('classes').select('id,display_name').eq('workspace_id',workspaceId).eq('status','active').order('display_name')]);if(classQ.error)throw classQ.error;const opts=(classQ.data??[])as ClassOption[];setSlots(rows);setClasses(opts);setEdit(current=>current.input.classId||opts.length===0?current:{...current,input:{...current.input,classId:opts[0].id}});}catch(error){setMessage(error instanceof Error?error.message:'Jadwal belum dapat dimuat.');}},[client,workspaceId]);
 useEffect(()=>{void refresh();},[refresh]);
 const active=useMemo(()=>slots.filter(s=>s.status!=='archived'),[slots]);
 function patch(input:Partial<PlannedScheduleInput>){setEdit(current=>({...current,input:{...current.input,...input}}));}
 function begin(slot:PlannedSlotContext){setEdit({id:slot.schedule_id,revision:slot.revision??null,input:{classId:slot.class_id,weekday:slot.weekday,localStartTime:slot.local_start_time.slice(0,5),localEndTime:slot.local_end_time.slice(0,5),effectiveFrom:slot.effective_from,effectiveUntil:slot.effective_until??null}});setMessage('');}
 function reset(){setEdit({id:null,revision:null,input:emptyInput(classes[0]?.id??'')});setMessage('');}
 async function save(){setBusy(true);setMessage('');try{if(edit.id){if(edit.revision==null)throw new Error('Revision jadwal tidak tersedia. Muat ulang.');await updatePlannedSchedule(client,workspaceId,edit.id,edit.revision,edit.input);setMessage('Jadwal diperbarui.');}else{await createPlannedSchedule(client,workspaceId,edit.input);setMessage('Jadwal ditambahkan.');}reset();await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Jadwal belum dapat disimpan.');}finally{setBusy(false);}}
 async function archive(slot:PlannedSlotContext){if(slot.revision==null)return;setBusy(true);setMessage('');try{await archivePlannedSchedule(client,workspaceId,slot.schedule_id,slot.revision);setMessage('Jadwal diarsipkan; riwayat tidak dihapus.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Jadwal belum dapat diarsipkan.');}finally{setBusy(false);}}
 return <section className="setup-shell">
  <header><p className="eyebrow">Jadwal Mengajar</p><h1>Atur jadwal rencana</h1><p className="muted">Jadwal hanya membantu menyarankan kelas. Pertemuan tetap dibuat hanya saat Anda menekan Mulai Kelas.</p></header>
  <section className="setup-card"><h2>{edit.id?'Edit jadwal':'Tambah jadwal'}</h2><div className="setup-grid">
   <label className="field-label">Kelas<select value={edit.input.classId} onChange={e=>patch({classId:e.target.value})}><option value="">Pilih kelas</option>{classes.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>
   <label className="field-label">Hari<select value={edit.input.weekday} onChange={e=>patch({weekday:Number(e.target.value)})}>{DAYS.slice(1).map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>
   <label className="field-label">Mulai<input type="time" value={edit.input.localStartTime} onChange={e=>patch({localStartTime:e.target.value})}/></label>
   <label className="field-label">Selesai<input type="time" value={edit.input.localEndTime} onChange={e=>patch({localEndTime:e.target.value})}/></label>
   <label className="field-label">Berlaku mulai<input type="date" value={edit.input.effectiveFrom} onChange={e=>patch({effectiveFrom:e.target.value})}/></label>
   <label className="field-label">Sampai (opsional)<input type="date" value={edit.input.effectiveUntil??''} onChange={e=>patch({effectiveUntil:e.target.value||null})}/></label>
  </div><div className="today-actions"><button type="button" disabled={busy||!edit.input.classId} onClick={()=>void save()}>{busy?'Menyimpan…':edit.id?'Simpan perubahan':'Tambah jadwal'}</button>{edit.id?<button type="button" className="secondary" onClick={reset}>Batal</button>:null}</div></section>
  {message?<p className="work-message" role="status">{message}</p>:null}
  <section className="setup-card"><h2>Jadwal aktif</h2>{active.length===0?<p>Belum ada jadwal. Hari ini tetap bisa dipakai secara manual.</p>:<div className="today-list">{active.map(slot=><div className="today-item" key={slot.schedule_id}><strong>{DAYS[slot.weekday]} · {slot.class_name}</strong><span>{slot.local_start_time.slice(0,5)}–{slot.local_end_time.slice(0,5)} · mulai {slot.effective_from}{slot.effective_until?` s.d. ${slot.effective_until}`:''}</span><div className="today-actions"><button type="button" className="secondary" onClick={()=>begin(slot)}>Edit</button><button type="button" className="secondary" disabled={busy} onClick={()=>void archive(slot)}>Arsipkan</button></div></div>)}</div>}</section>
 </section>;
}
