import{useEffect,useMemo,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{appendLessonVersion,latestLessonVersion,loadLessonStudio,type LessonStudioContext}from'../services/academic/lessonStudio';
import{generateLessonPackage,generateLessonSeed,newLessonPackageSaveIds,planLessonPackageSave,saveLessonPackageArtifacts,type LessonPackageDraft,type LessonPackageProfile,type LessonPackageSavePlan,type LessonPackageSource}from'../services/academic/lessonPackage';

type Props={
  client:SupabaseClient;
  workspaceId:string;
  onOpenSetup:()=>void;
  onOpenArtifacts:()=>void;
  onOpenTeaching:()=>void;
};

type Notice={kind:'info'|'error';text:string}|null;
type PackageField='rpp'|'modul_ajar'|'lkpd'|'bahan_ajar'|'tugas'|'ulangan';
const blankProfile=():LessonPackageProfile=>({subject:'',classLabel:'',duration:'',notes:''});
const packageFields:Array<{key:PackageField;label:string}>=[
  {key:'rpp',label:'RPP'},
  {key:'modul_ajar',label:'Modul Ajar'},
  {key:'lkpd',label:'LKPD'},
  {key:'bahan_ajar',label:'Bahan Ajar'},
  {key:'tugas',label:'Tugas'},
  {key:'ulangan',label:'Ulangan · soal + kunci/rubrik'},
];

export function LessonStudio({client,workspaceId,onOpenSetup,onOpenArtifacts,onOpenTeaching}:Props){
  const[context,setContext]=useState<LessonStudioContext|null>(null);
  const[lessonId,setLessonId]=useState('');
  const[content,setContent]=useState('');
  const[draftId,setDraftId]=useState(()=>crypto.randomUUID());
  const[profile,setProfile]=useState<LessonPackageProfile>(blankProfile);
  const[packageDraft,setPackageDraft]=useState<LessonPackageDraft|null>(null);
  const[packageBasisContent,setPackageBasisContent]=useState('');
  const[packageSaveIds,setPackageSaveIds]=useState<ReturnType<typeof newLessonPackageSaveIds>|null>(null);
  const[packageSavePlan,setPackageSavePlan]=useState<LessonPackageSavePlan|null>(null);
  const[packageSaveStarted,setPackageSaveStarted]=useState(false);
  const[packageSaved,setPackageSaved]=useState(false);
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState<Notice>(null);

  function clearPackage(){setPackageDraft(null);setPackageBasisContent('');setPackageSaveIds(null);setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);}

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
  const contentMatchesLatest=Boolean(latest&&content.trim()===latest.content_text);
  const packageMatchesContent=Boolean(packageDraft&&packageBasisContent===content.trim());

  function changeLesson(nextId:string){
    setLessonId(nextId);
    setContent(context?latestLessonVersion(context.lessonVersions,nextId)?.content_text??'':'');
    setDraftId(crypto.randomUUID());
    clearPackage();
    setNotice(null);
  }

  function patchProfile(key:keyof LessonPackageProfile,value:string){
    setProfile(current=>({...current,[key]:value}));
    clearPackage();
    setNotice(null);
  }

  async function save(){
    if(!lessonId||!content.trim()||busy)return;
    setBusy(true);setNotice(null);
    try{
      const result=await appendLessonVersion(client,{workspaceId,lessonId,contentText:content,draftId});
      const preservePackage=Boolean(packageDraft&&packageBasisContent===result.version.content_text);
      const message=result.replayed?`Versi v${result.version.version_number} sudah tersimpan sebelumnya; hasil yang sama dipakai kembali.`:`Versi v${result.version.version_number} tersimpan. Versi lama tetap utuh.`;
      await refresh(lessonId);
      setDraftId(crypto.randomUUID());
      if(preservePackage){setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);}else clearPackage();
      setNotice({kind:'info',text:`${message} ${preservePackage?'Draf paket tetap tersedia dan sekarang punya sumber LessonVersion exact.':'Versi ini sekarang bisa dipilih di Mengajar dan menjadi sumber exact di Dokumen.'}`});
    }catch(error){
      setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});
    }finally{setBusy(false);}
  }

  function sourceForLatest():LessonPackageSource|null{
    if(!selectedLesson||!latest)return null;
    return{lessonId:selectedLesson.id,lessonVersionId:latest.id,lessonTitle:selectedLesson.title,materialTitle:selectedMaterial?.title??'',versionNumber:latest.version_number,contentText:latest.content_text};
  }

  async function generateAllFromTitle(){
    if(!selectedLesson||busy)return;
    setBusy(true);setNotice(null);clearPackage();
    try{
      const seed=await generateLessonSeed(client,{lessonTitle:selectedLesson.title,materialTitle:selectedMaterial?.title??'',profile});
      const seededContent=seed.lesson_content.trim();
      setContent(seededContent);setDraftId(crypto.randomUUID());
      try{
        const draft=await generateLessonPackage(client,{source:{lessonTitle:selectedLesson.title,materialTitle:selectedMaterial?.title??'',contentText:seededContent},profile});
        setPackageDraft(draft);setPackageBasisContent(seededContent);setPackageSaveIds(newLessonPackageSaveIds());setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);
        setNotice({kind:'info',text:'Draf lengkap selesai dari judul: isi materi + RPP + Modul Ajar + LKPD + Bahan Ajar + Tugas + Ulangan. Review isi materi, simpan sebagai LessonVersion, lalu simpan paket ke Dokumen.'});
      }catch(error){
        setNotice({kind:'error',text:`Draf materi sudah dibuat dari judul, tetapi paket dokumen belum berhasil. Review/simpan materi dulu atau coba Buat paket dari versi tersimpan. ${error instanceof Error?error.message:String(error)}`});
      }
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  async function generatePackage(){
    const source=sourceForLatest();
    if(!source||busy)return;
    if(!contentMatchesLatest){setNotice({kind:'error',text:'Isi di editor berbeda dari versi tersimpan. Simpan sebagai versi baru dulu supaya dokumen punya sumber exact.'});return;}
    setBusy(true);setNotice(null);
    try{
      const draft=await generateLessonPackage(client,{source,profile});
      setPackageDraft(draft);setPackageBasisContent(source.contentText);setPackageSaveIds(newLessonPackageSaveIds());setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);
      setNotice({kind:'info',text:'Enam draf AI selesai. Belum ada dokumen kanonik yang disimpan — review/edit dulu lalu tekan Simpan paket ke Dokumen.'});
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  function editPackage(field:PackageField,value:string){
    if(packageSaveStarted)return;
    setPackageDraft(current=>current?{...current,[field]:value}:current);
    setPackageSaved(false);setNotice(null);
  }

  async function savePackage(){
    const source=sourceForLatest();
    if(!source||!packageDraft||!packageSaveIds||busy||packageSaved)return;
    if(!contentMatchesLatest||!packageMatchesContent||packageBasisContent!==source.contentText){setNotice({kind:'error',text:'Materi sumber berubah atau belum disimpan sebagai LessonVersion exact. Simpan materi lalu buat ulang paket bila isinya berubah.'});return;}
    setBusy(true);setNotice(null);
    try{
      const plan=packageSavePlan??await planLessonPackageSave(client,workspaceId,source.lessonId);
      if(!packageSavePlan)setPackageSavePlan(plan);
      setPackageSaveStarted(true);
      const saved=await saveLessonPackageArtifacts(client,{source,profile,draft:packageDraft,operationIds:packageSaveIds,plan});
      setPackageSaved(true);
      setNotice({kind:'info',text:`Paket tersimpan: ${saved.length} dokumen memakai provenance Lesson v${source.versionNumber}. Tugas/Ulangan tetap dokumen draft; tidak membuat Assessment atau nilai otomatis.`});
    }catch(error){
      setNotice({kind:'error',text:`Penyimpanan paket belum selesai. Jika percobaan RPC sudah dimulai, draf dan save plan tetap dikunci supaya retry memakai operation id serta jalur create/append yang sama. ${error instanceof Error?error.message:String(error)}`});
    }finally{setBusy(false);}
  }

  if(!context)return<section className="continuity-shell"><p className="eyebrow">Siapkan Materi</p><h1>Memuat pelajaran…</h1>{notice?<p role="alert" className="form-error">{notice.text}</p>:null}</section>;

  return<section className="continuity-shell lesson-studio-shell">
    <header><p className="eyebrow">Siapkan Materi</p><h1>Dari judul sampai bahan siap review</h1><p className="muted">Bisa mulai dari judul saja atau menulis materi sendiri. AI hanya membuat draf; LessonVersion dan Dokumen baru menjadi kanonik setelah Anda menyimpannya secara eksplisit.</p></header>

    {context.lessons.length===0?<div className="continuity-empty"><strong>Belum ada Pelajaran.</strong><p>Buat nama Materi dan Pelajaran dulu di Data & Pengaturan. Setelah judul ada, Anda bisa membuat seluruh draf dari judul tersebut di sini.</p><button type="button" onClick={onOpenSetup}>Buka Data & Pengaturan</button></div>:<>
      <div className="checkpoint-card lesson-package-card"><h2>Mulai cepat dari judul</h2><p className="muted">Pelajaran terpilih: <strong>{selectedLesson?.title}</strong>. Satu klik membuat draft isi materi, RPP, Modul Ajar, LKPD, Bahan Ajar, Tugas, dan Ulangan. Tidak ada yang otomatis disimpan atau diberikan ke siswa.</p>
        <div className="setup-grid">
          <label className="field-label">Mata pelajaran (opsional)<input disabled={packageSaveStarted} value={profile.subject} onChange={event=>patchProfile('subject',event.target.value)} placeholder="mis. IPA"/></label>
          <label className="field-label">Kelas/target (opsional)<input disabled={packageSaveStarted} value={profile.classLabel} onChange={event=>patchProfile('classLabel',event.target.value)} placeholder="mis. VIII"/></label>
          <label className="field-label">Alokasi waktu (opsional)<input disabled={packageSaveStarted} value={profile.duration} onChange={event=>patchProfile('duration',event.target.value)} placeholder="mis. 2 JP"/></label>
        </div>
        <label className="field-label">Catatan khusus (opsional)<textarea rows={3} maxLength={2000} disabled={packageSaveStarted} value={profile.notes} onChange={event=>patchProfile('notes',event.target.value)} placeholder="mis. siswa masih perlu dituntun, utamakan contoh sederhana…"/></label>
        <div className="today-actions"><button type="button" disabled={busy||!selectedLesson} onClick={()=>void generateAllFromTitle()}>{busy?'Memproses…':'Buat semua dari judul'}</button><button type="button" className="secondary" disabled={busy||!latest||!contentMatchesLatest} onClick={()=>void generatePackage()}>Buat paket dari versi tersimpan</button></div>
      </div>

      <div className="checkpoint-card">
        <label className="field-label">Materi / Pelajaran<select value={lessonId} onChange={event=>changeLesson(event.target.value)}>{context.materials.map(material=>{
          const lessons=context.lessons.filter(lesson=>lesson.material_id===material.id);
          if(!lessons.length)return null;
          return <optgroup key={material.id} label={material.title}>{lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</optgroup>;
        })}</select></label>
        {selectedLesson?<p className="muted">{selectedMaterial?.title??'Materi'} → {selectedLesson.title}{latest?` · versi terbaru v${latest.version_number}`:' · belum punya versi isi'}</p>:null}
        <label className="field-label">Isi pelajaran<textarea rows={16} maxLength={50000} value={content} onChange={event=>{setContent(event.target.value);setDraftId(crypto.randomUUID());clearPackage();setNotice(null);}} placeholder="Tulis sendiri, atau gunakan Buat semua dari judul di atas…"/></label>
        {!contentMatchesLatest&&latest?<p className="today-stale">Ada perubahan yang belum menjadi LessonVersion. Simpan versi baru sebelum paket dapat menjadi Dokumen.</p>:null}
        {!latest&&content.trim()?<p className="today-stale">Draf ini belum menjadi LessonVersion v1. Review lalu simpan sebelum menyimpan paket.</p>:null}
        <div className="today-actions"><button type="button" disabled={busy||!lessonId||!content.trim()} onClick={()=>void save()}>{busy?'Memproses…':'Simpan sebagai versi baru'}</button><button type="button" className="secondary" onClick={()=>{setContent(latest?.content_text??'');setDraftId(crypto.randomUUID());clearPackage();setNotice(null);}}>Kembalikan ke versi terbaru</button></div>
      </div>

      <div className="checkpoint-card"><div className="continuity-status"><strong>Versi tersimpan</strong><span>{versions.length}</span></div>{latest?<div className="artifact-text">{latest.content_text||'— isi kosong —'}</div>:<p>Belum ada versi. Simpan isi pertama untuk membuat v1.</p>}{versions.length>1?<p className="muted">Riwayat: {versions.slice(0,5).map(version=>`v${version.version_number}`).join(' · ')}{versions.length>5?' · …':''}</p>:null}</div>

      {packageDraft?<div className="checkpoint-card lesson-package-preview"><div className="continuity-status"><strong>Review draf paket</strong><span>{packageDraft.provider} · {packageDraft.model}</span></div><p className="muted">Semua masih draf. RPP/Modul/LKPD/Bahan Ajar/Tugas/Ulangan belum menjadi Artifact sampai tombol Simpan paket ditekan. Ulangan berisi lembar soal dan kunci/rubrik guru, tetapi tidak otomatis menjadi Penilaian.</p>{packageFields.map(field=><label className="field-label" key={field.key}>{field.label}<textarea rows={9} disabled={packageSaveStarted} value={packageDraft[field.key]} onChange={event=>editPackage(field.key,event.target.value)}/></label>)}{!contentMatchesLatest?<p className="today-stale">Simpan isi materi di atas sebagai LessonVersion terlebih dahulu. Paket tetap dipertahankan bila isi tidak berubah.</p>:null}<div className="today-actions"><button type="button" disabled={busy||packageSaved||!contentMatchesLatest||!packageMatchesContent||packageFields.some(field=>!packageDraft[field.key].trim())} onClick={()=>void savePackage()}>{packageSaved?'Paket tersimpan':packageSaveStarted?'Coba simpan paket lagi':'Simpan paket ke Dokumen'}</button><button type="button" className="secondary" onClick={onOpenArtifacts}>Buka Dokumen</button></div></div>:null}

      <div className="checkpoint-card"><h2>Lanjutkan dari sumber yang sama</h2><p className="muted">Mengajar memakai exact LessonVersion yang dipilih. Dokumen yang disimpan dari paket memakai provenance ke LessonVersion yang sama.</p><div className="today-actions"><button type="button" onClick={onOpenTeaching}>Buka Mengajar</button><button type="button" className="secondary" onClick={onOpenArtifacts}>Buka Dokumen</button><button type="button" className="secondary" onClick={onOpenSetup}>Data & Pengaturan</button></div></div>
    </>}

    {notice?<p className={notice.kind==='error'?'work-message form-error':'work-message'} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>:null}
  </section>;
}
