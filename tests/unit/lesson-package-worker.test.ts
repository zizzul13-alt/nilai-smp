import{describe,expect,it}from'vitest';
import{parseLessonPackageResult,parseLessonSeedResult}from'../../worker/index';

const packageDraft={rpp:'RPP ringkas',modul_ajar:'Modul lengkap',lkpd:'LKPD siswa',bahan_ajar:'Bahan ajar runtut',tugas:'Tugas terarah',ulangan:'Lembar soal\nKunci guru'};

describe('Lesson generation Workers AI normalization',()=>{
  it('accepts title-first lesson seed output',()=>{
    expect(parseLessonSeedResult({response:{lesson_content:'Konsep inti dan alur mengajar'}})).toEqual({lesson_content:'Konsep inti dan alur mengajar'});
  });

  it('accepts structured six-output package objects',()=>{
    expect(parseLessonPackageResult({response:packageDraft})).toEqual(packageDraft);
  });

  it('accepts fenced/text JSON provider responses',()=>{
    expect(parseLessonPackageResult({response:`\`\`\`json\n${JSON.stringify(packageDraft)}\n\`\`\``})).toEqual(packageDraft);
  });

  it('rejects partial, empty, or malformed generation output',()=>{
    expect(()=>parseLessonSeedResult({response:{lesson_content:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({response:{rpp:'RPP'}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({response:{...packageDraft,ulangan:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({usage:{prompt_tokens:1}})).toThrow('missing-response');
  });
});
