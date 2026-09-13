import{useEffect,useMemo,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{appendLessonVersion,latestLessonVersion,loadLessonStudio,type LessonStudioContext}from'../services/academic/lessonStudio';

type Props={
  client:SupabaseClient;
  workspaceId:string;
  onOpenSetup:()=>void;
  onOpenArtifacts:()=>void;
  onOpenTeaching:()=>void;
};

type Notice={kind:'info'|'error';text:string}|null;

export function LessonStudio({client,workspaceId,onOpenSetup,onOpenArtifacts,onOpenTeaching}:Props){
  const[context,setContext]=useState<LessonStudioContext|null>(null);
  const[lessonId,setLessonId]=useState('');
  const[content,setContent]=useState('');
  const[draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState<Notice>(null);

  function selectFrom(next:LessonStudioContext,preferred?:string){
    const id=preferred&&next.lessons.some(lesson=>lesson.id===preferred)?preferred:(next.lessons[0]?.id??'');
    setLessonId(id);
    setContent(id?(latestLessonVersion(next.lessonVersions,id)?.content_text??''):'');
  }

  async function refresh(preferred?:string){
    const next=await loadLessonStudio(client,workspaceId);
    setContext(next);
    selectFrom(next,preferred);
  }

  useEffect(()=>{
    let mounted=true;
    void loadLessonStudio(client,workspaceId).then(next=>{
      if(!mounted)return;
      setContext(next);
      selectFrom(next);
    }).catch(error=>{
      if(mounted)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});
    });
    return()=>{mounted=false;};
  },[client,workspaceId]);

  const selectedLesson=useMemo(()=>context?.lessons.find(lesson=>lesson.id===lessonId)??null,[context,lessonId]);
  const selectedMaterial=useMemo(()=>selectedLesson&&context?context.materials.find(material=>material.id===selectedLesson.material_id)??null:null,[context,selectedLesson]);
  const versions=useMemo(()=>context?context.lessonVersions.filter(version=>version.lesson_id===lessonId).sort((a,b)=>b.version_number-a.version_number):[],[context,lessonId]);
  const latest=versions[0]??null;

  function changeLesson(nextId:string){
    setLessonId(nextId);
    setContent(context?latestLessonVersion(context.lessonVersions,nextId)?.content_text??'':'');
    setDraftId(crypto.randomUUID());
    setNotice(null);
  }

  async function save(){
    if(!lessonId||!content.trim()||busy)return;
    setBusy(true);setNotice(null);
    try{
      const result=await appendLessonVersion(client,{workspaceId,lessonId,contentText:content,draftId});
      const message=result.replayed?`Versi v${result.version.version_number} sudah tersimpan sebelumnya; hasil yang sama dipakai kembali.`:`Versi v${result.version.version_number} tersimpan. Versi lama tetap utuh.`;
      await refresh(lessonId);
      setDraftId(crypto.randomUUID());
      setNotice({kind:'info',text:`${message} Versi ini sekarang bisa dipilih di Mengajar dan menjadi sumber exact di Dokumen.`});
    }catch(error){
      setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});
    }finally{setBusy(false);}
  }

  if(!context)return<section className="continuity-shell"><p className="eyebrow">Siapkan Materi</p><h1>Memuat pelajaran…</h1>{notice?<p role="alert" className="form-error">{notice.text}</p>:null}</section>;

  return<section className="continuity-shell lesson-studio-shell">
    <header><p className="eyebrow">Siapkan Materi</p><h1>Tulis sekali, pakai versi yang sama saat mengajar dan membuat dokumen</h1><p className="muted">Isi pelajaran disimpan sebagai LessonVersion append-only. Menyimpan perubahan selalu membuat versi baru; versi lama tidak ditimpa. AI belum dipakai di langkah ini.</p></header>

    {context.lessons.length===0?<div className="continuity-empty"><strong>Belum ada Pelajaran.</strong><p>Buat nama Materi dan Pelajaran dulu di Data & Pengaturan, lalu kembali ke sini untuk menulis isinya.</p><button type="button" onClick={onOpenSetup}>Buka Data & Pengaturan</button></div>:<>
      <div className="checkpoint-card">
        <label className="field-label">Materi / Pelajaran<select value={lessonId} onChange={event=>changeLesson(event.target.value)}>{context.materials.map(material=>{
          const lessons=context.lessons.filter(lesson=>lesson.material_id===material.id);
          if(!lessons.length)return null;
          return <optgroup key={material.id} label={material.title}>{lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</optgroup>;
        })}</select></label>
        {selectedLesson?<p className="muted">{selectedMaterial?.title??'Materi'} → {selectedLesson.title}{latest?` · versi terbaru v${latest.version_number}`:' · belum punya versi isi'}</p>:null}
        <label className="field-label">Isi pelajaran<textarea rows={16} maxLength={50000} value={content} onChange={event=>{setContent(event.target.value);setDraftId(crypto.randomUUID());setNotice(null);}} placeholder="Contoh: tujuan pembelajaran, urutan penjelasan, contoh, aktivitas, latihan, pertanyaan pemantik, catatan guru…"/></label>
        <div className="today-actions"><button type="button" disabled={busy||!lessonId||!content.trim()} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan sebagai versi baru'}</button><button type="button" className="secondary" onClick={()=>{setContent(latest?.content_text??'');setDraftId(crypto.randomUUID());setNotice(null);}}>Kembalikan ke versi terbaru</button></div>
      </div>

      <div className="checkpoint-card"><div className="continuity-status"><strong>Versi tersimpan</strong><span>{versions.length}</span></div>{latest?<div className="artifact-text">{latest.content_text||'— isi kosong —'}</div>:<p>Belum ada versi. Simpan isi pertama untuk membuat v1.</p>}{versions.length>1?<p className="muted">Riwayat: {versions.slice(0,5).map(version=>`v${version.version_number}`).join(' · ')}{versions.length>5?' · …':''}</p>:null}</div>

      <div className="checkpoint-card"><h2>Lanjutkan dari sumber yang sama</h2><p className="muted">Mengajar akan memakai exact LessonVersion yang dipilih. Dokumen dapat memakai LessonVersion yang sama sebagai provenance, jadi RPP/LKPD tidak kehilangan sumbernya.</p><div className="today-actions"><button type="button" onClick={onOpenTeaching}>Buka Mengajar</button><button type="button" className="secondary" onClick={onOpenArtifacts}>Buka Dokumen</button><button type="button" className="secondary" onClick={onOpenSetup}>Data & Pengaturan</button></div></div>
    </>}

    {notice?<p className={notice.kind==='error'?'work-message form-error':'work-message'} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>:null}
  </section>;
}
