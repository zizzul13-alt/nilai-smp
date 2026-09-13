import{describe,expect,it}from'vitest';
import{parseAssessmentBlueprintResult,parseLessonPackageResult,parseLessonPlanResult,parseLessonSeedResult,parseLessonTextResult}from'../../worker/index';

const packageDraft={rpp:'RPP ringkas',modul_ajar:'Modul lengkap',lkpd:'LKPD siswa',bahan_ajar:'Bahan ajar runtut',tugas:'Tugas terarah',ulangan:'Lembar soal\nKunci guru'};
const deepPlan={
  objectives:['Memahami konsep inti'],scope:['Batas topik'],core_concepts:['Konsep A'],prerequisites:['Pengetahuan awal'],misconceptions:['Miskonsepsi umum'],teaching_sequence:['Langkah 1'],guided_examples:['Contoh terpandu'],activities:['Aktivitas'],checks_for_understanding:['Cek pemahaman'],differentiation:['Dukungan siswa'],assessment_targets:['Target asesmen']
};

describe('Lesson generation Workers AI normalization',()=>{
  it('accepts title-first quick lesson seed output',()=>{
    expect(parseLessonSeedResult({response:{lesson_content:'Konsep inti dan alur mengajar'}})).toEqual({lesson_content:'Konsep inti dan alur mengajar'});
  });

  it('accepts structured six-output quick package objects',()=>{
    expect(parseLessonPackageResult({response:packageDraft})).toEqual(packageDraft);
  });

  it('accepts deep planning, specialist text and assessment blueprint outputs',()=>{
    expect(parseLessonPlanResult({response:deepPlan})).toEqual(deepPlan);
    expect(parseLessonTextResult({response:{text:'Dokumen spesialis rinci'}})).toEqual({text:'Dokumen spesialis rinci'});
    expect(parseAssessmentBlueprintResult({response:{blueprint:'10 butir; cakupan dan tingkat kesulitan jelas'}})).toEqual({blueprint:'10 butir; cakupan dan tingkat kesulitan jelas'});
  });

  it('accepts fenced/text JSON provider responses',()=>{
    expect(parseLessonPackageResult({response:`\`\`\`json\n${JSON.stringify(packageDraft)}\n\`\`\``})).toEqual(packageDraft);
  });

  it('rejects partial, empty, or malformed generation output',()=>{
    expect(()=>parseLessonSeedResult({response:{lesson_content:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({response:{rpp:'RPP'}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({response:{...packageDraft,ulangan:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPlanResult({response:{...deepPlan,objectives:[]}})).toThrow('invalid-shape');
    expect(()=>parseLessonTextResult({response:{text:''}})).toThrow('invalid-shape');
    expect(()=>parseAssessmentBlueprintResult({response:{blueprint:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({usage:{prompt_tokens:1}})).toThrow('missing-response');
  });
});