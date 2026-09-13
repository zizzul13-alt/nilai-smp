import{useEffect,useMemo,useState}from'react';
import type{SupabaseClient}from'@supabase/supabase-js';
import{createLessonForSetup}from'../services/academic/dailyDriverSetup';
import{appendLessonVersion,latestLessonVersion,loadLessonStudio,type LessonStudioContext}from'../services/academic/lessonStudio';
import{generateLessonDeepBundle,generateLessonDeepPackage,generateLessonPackage,generateLessonSeed,newLessonPackageSaveIds,planLessonPackageSave,saveLessonPackageArtifacts,type LessonDeepPlan,type LessonGenerationMode,type LessonPackageDraft,type LessonPackageProfile,type LessonPackageSavePlan,type LessonPackageSource}from'../services/academic/lessonPackage';

type Props={client:SupabaseClient;workspaceId:string;onOpenSetup:()=>void;onOpenArtifacts:()=>void;onOpenTeaching:()=>void};
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
  const[newLessonTitle,setNewLessonTitle]=useState('');
  const[newMaterialId,setNewMaterialId]=useState('');
  const[profile,setProfile]=useState<LessonPackageProfile>(blankProfile);
  const[packageDraft,setPackageDraft]=useState<LessonPackageDraft|null>(null);
  const[deepPlan,setDeepPlan]=useState<LessonDeepPlan|null>(null);
  const[packageBasisContent,setPackageBasisContent]=useState('');
  const[packageSaveIds,setPackageSaveIds]=useState<ReturnType<typeof newLessonPackageSaveIds>|null>(null);
  const[packageSavePlan,setPackageSavePlan]=useState<LessonPackageSavePlan|null>(null);
  const[packageSaveStarted,setPackageSaveStarted]=useState(false);
  const[packageSaved,setPackageSaved]=useState(false);
  const[busy,setBusy]=useState(false);
  const[generationMode,setGenerationMode]=useState<LessonGenerationMode|null>(null);
  const[notice,setNotice]=useState<Notice>(null);

  function clearPackage(){setPackageDraft(null);setDeepPlan(null);setPackageBasisContent('');setPackageSaveIds(null);setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);setGenerationMode(null);}

  function selectFrom(next:LessonStudioContext,preferred?:string){
    const id=preferred&&next.lessons.some(lesson=>lesson.id===preferred)?preferred:(next.lessons[0]?.id??'');
    setLessonId(id);
    setContent(id?(latestLessonVersion(next.lessonVersions,id)?.content_text??''):'');
    setNewMaterialId(current=>current&&next.materials.some(material=>material.id===current)?current:(next.materials[0]?.id??''));
  }

  async function refresh(preferred?:string){const next=await loadLessonStudio(client,workspaceId);setContext(next);selectFrom(next,preferred);}
  useEffect(()=>{let mounted=true;void loadLessonStudio(client,workspaceId).then(next=>{if(!mounted)return;setContext(next);selectFrom(next);}).catch(error=>{if(mounted)setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});});return()=>{mounted=false;};},[client,workspaceId]);

  const selectedLesson=useMemo(()=>context?.lessons.find(lesson=>lesson.id===lessonId)??null,[context,lessonId]);
  const selectedMaterial=useMemo(()=>selectedLesson&&context?context.materials.find(material=>material.id===selectedLesson.material_id)??null:null,[context,selectedLesson]);
  const versions=useMemo(()=>context?context.lessonVersions.filter(version=>version.lesson_id===lessonId).sort((a,b)=>b.version_number-a.version_number):[],[context,lessonId]);
  const latest=versions[0]??null;
  const contentMatchesLatest=Boolean(latest&&content.trim()===latest.content_text);
  const packageMatchesContent=Boolean(packageDraft&&packageBasisContent===content.trim());

  function changeLesson(nextId:string){setLessonId(nextId);setContent(context?latestLessonVersion(context.lessonVersions,nextId)?.content_text??'':'');setDraftId(crypto.randomUUID());clearPackage();setNotice(null);}
  function patchProfile(key:keyof LessonPackageProfile,value:string){setProfile(current=>({...current,[key]:value}));clearPackage();setNotice(null);}
  function preparePackageState(draft:LessonPackageDraft,basis:string,mode:LessonGenerationMode,plan:LessonDeepPlan|null){setPackageDraft(draft);setDeepPlan(plan);setPackageBasisContent(basis);setPackageSaveIds(newLessonPackageSaveIds());setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);setGenerationMode(mode);}

  async function createDraftBundle(lessonTitle:string,materialTitle:string,mode:LessonGenerationMode){
    if(mode==='deep'){
      const bundle=await generateLessonDeepBundle(client,{lessonTitle,materialTitle,profile});
      const seededContent=bundle.seed.lesson_content.trim();
      setContent(seededContent);setDraftId(crypto.randomUUID());
      preparePackageState(bundle.draft,seededContent,'deep',bundle.plan);
      return seededContent;
    }
    const seed=await generateLessonSeed(client,{lessonTitle,materialTitle,profile});
    const seededContent=seed.lesson_content.trim();
    setContent(seededContent);setDraftId(crypto.randomUUID());
    const draft=await generateLessonPackage(client,{source:{lessonTitle,materialTitle,contentText:seededContent},profile});
    preparePackageState(draft,seededContent,'quick',null);
    return seededContent;
  }

  async function createLessonAndGenerate(mode:LessonGenerationMode){
    const title=newLessonTitle.trim();const material=context?.materials.find(item=>item.id===newMaterialId)??null;if(!title||!material||busy)return;
    setBusy(true);setGenerationMode(mode);setNotice({kind:'info',text:mode==='deep'?'Menyusun mendalam: planning pass → materi rinci → generator spesialis → blueprint ulangan. Tunggu sebentar…':'Membuat draf cepat…'});clearPackage();setGenerationMode(mode);
    let createdId:string|null=null;
    try{
      const created=await createLessonForSetup(client,workspaceId,material.id,title);createdId=created.id;
      const next=await loadLessonStudio(client,workspaceId);setContext(next);selectFrom(next,created.id);setNewLessonTitle('');
      try{
        await createDraftBundle(created.title,material.title,mode);
        setNotice({kind:'info',text:mode==='deep'?`Pelajaran “${created.title}” dibuat. Paket MENDALAM selesai: planning pass + materi rinci + 5 dokumen spesialis + blueprint dan Ulangan. Semua masih draf sampai Anda review/simpan.`:`Pelajaran “${created.title}” dibuat. Paket cepat selesai dan siap review.`});
      }catch(error){setNotice({kind:'error',text:`Pelajaran “${created.title}” sudah dibuat, tetapi AI belum menyelesaikan seluruh generasi. Anda tetap bisa menulis/simpan materi manual atau mencoba lagi. ${error instanceof Error?error.message:String(error)}`});}
    }catch(error){setNotice({kind:'error',text:`${createdId?'Pelajaran mungkin sudah dibuat; muat ulang sebelum mencoba lagi. ':''}${error instanceof Error?error.message:String(error)}`});}
    finally{setBusy(false);}
  }

  async function save(){
    if(!lessonId||!content.trim()||busy)return;setBusy(true);setNotice(null);
    try{
      const result=await appendLessonVersion(client,{workspaceId,lessonId,contentText:content,draftId});
      const preservePackage=Boolean(packageDraft&&packageBasisContent===result.version.content_text);
      const message=result.replayed?`Versi v${result.version.version_number} sudah tersimpan sebelumnya; hasil yang sama dipakai kembali.`:`Versi v${result.version.version_number} tersimpan. Versi lama tetap utuh.`;
      await refresh(lessonId);setDraftId(crypto.randomUUID());
      if(preservePackage){setPackageSavePlan(null);setPackageSaveStarted(false);setPackageSaved(false);}else clearPackage();
      setNotice({kind:'info',text:`${message} ${preservePackage?'Draf paket tetap tersedia dan sekarang punya sumber LessonVersion exact.':'Versi ini sekarang bisa dipilih di Mengajar dan menjadi sumber exact di Dokumen.'}`});
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  function sourceForLatest():LessonPackageSource|null{if(!selectedLesson||!latest)return null;return{lessonId:selectedLesson.id,lessonVersionId:latest.id,lessonTitle:selectedLesson.title,materialTitle:selectedMaterial?.title??'',versionNumber:latest.version_number,contentText:latest.content_text};}

  async function generateAllFromTitle(mode:LessonGenerationMode){
    if(!selectedLesson||busy)return;setBusy(true);setGenerationMode(mode);setNotice({kind:'info',text:mode==='deep'?'Menyusun ulang secara mendalam. Planning dan tiap dokumen dibuat terpisah agar tidak dangkal…':'Membuat ulang draf cepat…'});clearPackage();setGenerationMode(mode);
    try{await createDraftBundle(selectedLesson.title,selectedMaterial?.title??'',mode);setNotice({kind:'info',text:mode==='deep'?'Generasi MENDALAM selesai. Review planning, materi, dan enam dokumen sebelum menyimpan.':'Generasi cepat selesai. Review materi dan paket sebelum menyimpan.'});}
    catch(error){setNotice({kind:'error',text:`AI belum menyelesaikan semua draf. ${error instanceof Error?error.message:String(error)}`});}
    finally{setBusy(false);}
  }

  async function generatePackage(mode:LessonGenerationMode){
    const source=sourceForLatest();if(!source||busy)return;if(!contentMatchesLatest){setNotice({kind:'error',text:'Isi di editor berbeda dari versi tersimpan. Simpan sebagai versi baru dulu supaya dokumen punya sumber exact.'});return;}
    setBusy(true);setGenerationMode(mode);setNotice({kind:'info',text:mode==='deep'?'Menganalisis LessonVersion exact → planning pass → dokumen spesialis → blueprint Ulangan…':'Membuat paket cepat dari LessonVersion…'});
    try{
      if(mode==='deep'){
        const result=await generateLessonDeepPackage(client,{source,profile});preparePackageState(result.draft,source.contentText,'deep',result.plan);
        setNotice({kind:'info',text:'Paket MENDALAM selesai dari LessonVersion exact. Planning dan enam dokumen siap direview.'});
      }else{
        const draft=await generateLessonPackage(client,{source,profile});preparePackageState(draft,source.contentText,'quick',null);
        setNotice({kind:'info',text:'Paket cepat selesai. Belum ada dokumen kanonik yang disimpan.'});
      }
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:String(error)});}finally{setBusy(false);}
  }

  function editPackage(field:PackageField,value:string){if(packageSaveStarted)return;setPackageDraft(current=>current?{...current,[field]:value}:current);setPackageSaved(false);setNotice(null);}

  async function savePackage(){
    const source=sourceForLatest();if(!source||!packageDraft||!packageSaveIds||busy||packageSaved)return;
    if(!contentMatchesLatest||!packageMatchesContent||packageBasisContent!==source.contentText){setNotice({kind:'error',text:'Materi sumber berubah atau belum disimpan sebagai LessonVersion exact. Simpan materi lalu buat ulang paket bila isinya berubah.'});return;}
    setBusy(true);setNotice(null);
    try{
      const plan=packageSavePlan??await planLessonPackageSave(client,workspaceId,source.lessonId);if(!packageSavePlan)setPackageSavePlan(plan);setPackageSaveStarted(true);
      const saved=await saveLessonPackageArtifacts(client,{source,profile,draft:packageDraft,operationIds:packageSaveIds,plan});setPackageSaved(true);
      setNotice({kind:'info',text:`Paket ${packageDraft.generation_mode==='deep'?'MENDALAM':'cepat'} tersimpan: ${saved.length} dokumen memakai provenance Lesson v${source.versionNumber}. Tugas/Ulangan tetap dokumen; tidak membuat Assessment atau nilai otomatis.`});
    }catch(error){setNotice({kind:'error',text:`Penyimpanan paket belum selesai. Draf dan save plan tetap dikunci untuk retry aman. ${error instanceof Error?error.message:String(error)}`});}
    finally{setBusy(false);}
  }

  if(!context)return<section className="continuity-shell"><p className="eyebrow">Siapkan Materi</p><h1>Memuat pelajaran…</h1>{notice?<p role="alert" className="form-error">{notice.text}</p>:null}</section>;

  return<section className="continuity-shell lesson-studio-shell">
    <header><p className="eyebrow">Siapkan Materi</p><h1>Dari judul sampai bahan siap review</h1><p className="muted"><strong>Mendalam</strong> adalah mode utama: AI membuat planning pass, materi rinci, dokumen spesialis, dan blueprint Ulangan secara terpisah. Mode Cepat tetap tersedia untuk draft kilat. Tidak ada hasil AI yang menjadi kanonik sebelum Anda simpan.</p></header>

    <div className="checkpoint-card lesson-package-card"><h2>Topik baru</h2><p className="muted">Ketik judul/topik dan pilih Materi induk. Mode Mendalam lebih lama, tetapi tidak memaksa satu call menulis enam dokumen sekaligus.</p>
      {context.materials.length?<><div className="setup-grid"><label className="field-label">Materi induk<select value={newMaterialId} onChange={event=>setNewMaterialId(event.target.value)}>{context.materials.map(material=><option key={material.id} value={material.id}>{material.title}</option>)}</select></label><label className="field-label">Judul/topik baru<input value={newLessonTitle} maxLength={240} onChange={event=>setNewLessonTitle(event.target.value)} placeholder="mis. Sistem Pernapasan Manusia"/></label></div><div className="today-actions"><button type="button" disabled={busy||!newMaterialId||!newLessonTitle.trim()} onClick={()=>void createLessonAndGenerate('deep')}>{busy&&generationMode==='deep'?'Menyusun mendalam…':'Buat mendalam + semua draf'}</button><button type="button" className="secondary" disabled={busy||!newMaterialId||!newLessonTitle.trim()} onClick={()=>void createLessonAndGenerate('quick')}>Buat cepat</button></div></>:<><p>Belum ada Materi induk. Buat satu dulu di Data & Pengaturan.</p><button type="button" className="secondary" onClick={onOpenSetup}>Buka Data & Pengaturan</button></>}
    </div>

    {context.lessons.length===0?<div className="continuity-empty"><strong>Belum ada Pelajaran.</strong><p>Gunakan Topik baru di atas setelah Materi induk tersedia, atau buat struktur manual di Data & Pengaturan.</p></div>:<>
      <div className="checkpoint-card lesson-package-card"><h2>Pelajaran yang sudah ada</h2><p className="muted">Pelajaran terpilih: <strong>{selectedLesson?.title}</strong>. Isi profil supaya AI punya konteks kelas dan waktu yang lebih baik.</p>
        <div className="setup-grid">
          <label className="field-label">Mata pelajaran (opsional)<input disabled={packageSaveStarted} value={profile.subject} onChange={event=>patchProfile('subject',event.target.value)} placeholder="mis. IPA"/></label>
          <label className="field-label">Kelas/target (opsional)<input disabled={packageSaveStarted} value={profile.classLabel} onChange={event=>patchProfile('classLabel',event.target.value)} placeholder="mis. VIII"/></label>
          <label className="field-label">Alokasi waktu (opsional)<input disabled={packageSaveStarted} value={profile.duration} onChange={event=>patchProfile('duration',event.target.value)} placeholder="mis. 2 JP"/></label>
        </div>
        <label className="field-label">Catatan khusus (opsional)<textarea rows={3} maxLength={2000} disabled={packageSaveStarted} value={profile.notes} onChange={event=>patchProfile('notes',event.target.value)} placeholder="mis. siswa masih perlu dituntun, utamakan contoh sederhana, ulangan 10 soal…"/></label>
        <div className="today-actions"><button type="button" disabled={busy||!selectedLesson} onClick={()=>void generateAllFromTitle('deep')}>{busy&&generationMode==='deep'?'Menyusun mendalam…':'Buat mendalam dari judul'}</button><button type="button" className="secondary" disabled={busy||!selectedLesson} onClick={()=>void generateAllFromTitle('quick')}>Cepat dari judul</button><button type="button" className="secondary" disabled={busy||!latest||!contentMatchesLatest} onClick={()=>void generatePackage('deep')}>Paket mendalam dari versi tersimpan</button></div>
      </div>

      <div className="checkpoint-card">
        <label className="field-label">Materi / Pelajaran<select value={lessonId} onChange={event=>changeLesson(event.target.value)}>{context.materials.map(material=>{const lessons=context.lessons.filter(lesson=>lesson.material_id===material.id);if(!lessons.length)return null;return <optgroup key={material.id} label={material.title}>{lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</optgroup>;})}</select></label>
        {selectedLesson?<p className="muted">{selectedMaterial?.title??'Materi'} → {selectedLesson.title}{latest?` · versi terbaru v${latest.version_number}`:' · belum punya versi isi'}</p>:null}
        <label className="field-label">Isi pelajaran<textarea rows={18} maxLength={50000} value={content} onChange={event=>{setContent(event.target.value);setDraftId(crypto.randomUUID());clearPackage();setNotice(null);}} placeholder="Tulis sendiri, atau gunakan mode Mendalam di atas…"/></label>
        {!contentMatchesLatest&&latest?<p className="today-stale">Ada perubahan yang belum menjadi LessonVersion. Simpan versi baru sebelum paket dapat menjadi Dokumen.</p>:null}
        {!latest&&content.trim()?<p className="today-stale">Draf ini belum menjadi LessonVersion v1. Review lalu simpan sebelum menyimpan paket.</p>:null}
        <div className="today-actions"><button type="button" disabled={busy||!lessonId||!content.trim()} onClick={()=>void save()}>{busy?'Memproses…':'Simpan sebagai versi baru'}</button><button type="button" className="secondary" onClick={()=>{setContent(latest?.content_text??'');setDraftId(crypto.randomUUID());clearPackage();setNotice(null);}}>Kembalikan ke versi terbaru</button></div>
      </div>

      {deepPlan?<div className="checkpoint-card"><div className="continuity-status"><strong>Planning pass · Mendalam</strong><span>AI DRAFT</span></div><p className="muted">Planning ini menjadi jangkar agar materi, LKPD, tugas, dan ulangan tidak berjalan sendiri-sendiri.</p><h3>Tujuan draft</h3><ul>{deepPlan.objectives.map((item,index)=><li key={`o-${index}`}>{item}</li>)}</ul><h3>Konsep inti</h3><ul>{deepPlan.core_concepts.map((item,index)=><li key={`c-${index}`}>{item}</li>)}</ul><h3>Miskonsepsi yang perlu dijaga</h3><ul>{deepPlan.misconceptions.map((item,index)=><li key={`m-${index}`}>{item}</li>)}</ul><h3>Target asesmen</h3><ul>{deepPlan.assessment_targets.map((item,index)=><li key={`a-${index}`}>{item}</li>)}</ul></div>:null}

      <div className="checkpoint-card"><div className="continuity-status"><strong>Versi tersimpan</strong><span>{versions.length}</span></div>{latest?<div className="artifact-text">{latest.content_text||'— isi kosong —'}</div>:<p>Belum ada versi. Simpan isi pertama untuk membuat v1.</p>}{versions.length>1?<p className="muted">Riwayat: {versions.slice(0,5).map(version=>`v${version.version_number}`).join(' · ')}{versions.length>5?' · …':''}</p>:null}</div>

      {packageDraft?<div className="checkpoint-card lesson-package-preview"><div className="continuity-status"><strong>Review draf paket</strong><span>{packageDraft.generation_mode==='deep'?'MENDALAM':'CEPAT'} · {packageDraft.model}</span></div><p className="muted">Semua masih draf. RPP/Modul/LKPD/Bahan Ajar/Tugas/Ulangan belum menjadi Artifact sampai tombol Simpan paket ditekan. Ulangan tetap dokumen soal + kunci/rubrik; tidak otomatis menjadi Penilaian.</p>{packageFields.map(field=><label className="field-label" key={field.key}>{field.label}<textarea rows={12} disabled={packageSaveStarted} value={packageDraft[field.key]} onChange={event=>editPackage(field.key,event.target.value)}/></label>)}{!contentMatchesLatest?<p className="today-stale">Simpan isi materi di atas sebagai LessonVersion terlebih dahulu. Paket tetap dipertahankan bila isi tidak berubah.</p>:null}<div className="today-actions"><button type="button" disabled={busy||packageSaved||!contentMatchesLatest||!packageMatchesContent||packageFields.some(field=>!packageDraft[field.key].trim())} onClick={()=>void savePackage()}>{packageSaved?'Paket tersimpan':packageSaveStarted?'Coba simpan paket lagi':'Simpan paket ke Dokumen'}</button><button type="button" className="secondary" onClick={onOpenArtifacts}>Buka Dokumen</button></div></div>:null}

      <div className="checkpoint-card"><h2>Lanjutkan dari sumber yang sama</h2><p className="muted">Mengajar memakai exact LessonVersion yang dipilih. Dokumen yang disimpan dari paket memakai provenance ke LessonVersion yang sama.</p><div className="today-actions"><button type="button" onClick={onOpenTeaching}>Buka Mengajar</button><button type="button" className="secondary" onClick={onOpenArtifacts}>Buka Dokumen</button><button type="button" className="secondary" onClick={onOpenSetup}>Data & Pengaturan</button></div></div>
    </>}

    {notice?<p className={notice.kind==='error'?'work-message form-error':'work-message'} role={notice.kind==='error'?'alert':'status'}>{notice.text}</p>:null}
  </section>;
}