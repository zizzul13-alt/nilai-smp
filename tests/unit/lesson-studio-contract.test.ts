import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{nextLessonVersionNumber}from'../../src/services/academic/lessonStudio';
import type{LessonVersion}from'../../src/domain/academic';

const app=readFileSync('src/app/App.tsx','utf8');
const studio=readFileSync('src/components/LessonStudio.tsx','utf8');
const teaching=readFileSync('src/components/TeachingContinuity.tsx','utf8');
const service=readFileSync('src/services/academic/lessonStudio.ts','utf8');
const packageService=readFileSync('src/services/academic/lessonPackage.ts','utf8');
const worker=readFileSync('worker/index.ts','utf8');

function version(lessonId:string,versionNumber:number):LessonVersion{return{id:`${lessonId}-${versionNumber}`,workspace_id:'W',lesson_id:lessonId,version_number:versionNumber,content_text:`v${versionNumber}`,created_at:'2026-09-14T00:00:00Z'};}

describe('Lesson Studio vertical slice',()=>{
  it('keeps LessonVersion append-only and derives the next version per Lesson',()=>{
    expect(nextLessonVersionNumber([version('L1',1),version('L1',3),version('L2',8)],'L1')).toBe(4);
    expect(nextLessonVersionNumber([], 'L1')).toBe(1);
    expect(service).toContain("from('lesson_versions').insert");
    expect(service).not.toContain("from('lesson_versions').update");
    expect(service).not.toContain("from('lesson_versions').delete");
  });

  it('exposes teacher-facing preparation with deep mode as the primary path',()=>{
    expect(app).toContain('Siapkan Materi');
    expect(app).toContain("mode === 'lesson'");
    expect(studio).toContain('Buat mendalam + semua draf');
    expect(studio).toContain('Buat cepat');
    expect(studio).toContain('Planning pass · Mendalam');
    expect(studio).toContain('Simpan sebagai versi baru');
    expect(studio).toContain('Buka Mengajar');
    expect(studio).toContain('Buka Dokumen');
  });

  it('allows a new topic title to create one explicit Lesson identity and then AI drafts',()=>{
    expect(studio).toContain('Judul/topik baru');
    expect(studio).toContain('createLessonForSetup');
    expect(studio).toContain('createLessonAndGenerate');
    expect(studio).not.toContain('createAssessment(');
    expect(studio).not.toContain('createArtifact(');
  });

  it('renders the exact selected LessonVersion in teaching instead of inventing lesson content',()=>{
    expect(teaching).toContain('Materi Pelajaran');
    expect(teaching).toContain('teachingVersion.content_text');
    expect(teaching).toContain('BELUM ADA VERSI');
    expect(teaching).toContain('lesson_version_id');
    expect(app).toContain('onOpenLessonStudio');
  });

  it('uses a real multi-pass deep pipeline rather than one six-document call',()=>{
    expect(packageService).toContain('generateLessonDeepBundle');
    expect(packageService).toContain("'/api/lesson-deep-plan'");
    expect(packageService).toContain("'/api/lesson-deep-content'");
    expect(packageService).toContain("'/api/lesson-assessment-blueprint'");
    expect(packageService).toContain("'/api/lesson-deep-document'");
    expect(packageService).toContain('Promise.all(DOCUMENT_FIELDS');
    expect(worker).toContain("url.pathname==='/api/lesson-deep-plan'");
    expect(worker).toContain("url.pathname==='/api/lesson-deep-content'");
    expect(worker).toContain("url.pathname==='/api/lesson-assessment-blueprint'");
    expect(worker).toContain("url.pathname==='/api/lesson-deep-document'");
    expect(worker).toContain("if(input.kind==='ULANGAN'&&!input.assessmentBlueprint?.trim())");
  });

  it('keeps quick mode available as a fallback instead of replacing the proven path',()=>{
    expect(packageService).toContain("'/api/lesson-seed'");
    expect(packageService).toContain("'/api/lesson-package'");
    expect(worker).toContain("url.pathname==='/api/lesson-seed'");
    expect(worker).toContain("url.pathname==='/api/lesson-package'");
  });

  it('keeps six outputs draft-first, exact-source and explicit-save only',()=>{
    for(const label of['RPP','Modul Ajar','LKPD','Bahan Ajar','Tugas','Ulangan'])expect(studio).toContain(label);
    expect(studio).toContain('Simpan paket ke Dokumen');
    expect(studio).toContain('tidak otomatis menjadi Penilaian');
    expect(studio).toContain('contentMatchesLatest');
    expect(packageService).toContain("sourceKind:'LESSON_VERSION'");
    expect(packageService).toContain('lessonVersionId:input.source.lessonVersionId');
    expect(packageService).toContain("key:'TUGAS'");
    expect(packageService).toContain("key:'ULANGAN'");
    expect(packageService).toContain("generation_mode:input.draft.generation_mode??'quick'");
    expect(packageService).toContain('appendArtifactVersion');
    expect(packageService).toContain('createArtifact');
    expect(packageService).not.toContain("from('lesson_versions').update");
  });

  it('freezes create-vs-append planning before the first artifact RPC so lost-ack retry cannot switch operation kind',()=>{
    expect(studio).toContain('packageSavePlan??await planLessonPackageSave');
    expect(studio).toContain('setPackageSavePlan(plan)');
    expect(packageService).toContain("mode:'append'");
    expect(packageService).toContain("mode:'create'");
    expect(packageService).toContain('const target=input.plan[spec.key]');
  });
});