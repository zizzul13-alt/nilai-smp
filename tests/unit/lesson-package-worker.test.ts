import{describe,expect,it}from'vitest';
import{parseLessonPackageResult}from'../../worker/index';

const packageDraft={rpp:'RPP ringkas',modul_ajar:'Modul lengkap',lkpd:'LKPD siswa',bahan_ajar:'Bahan ajar runtut'};

describe('Lesson package Workers AI normalization',()=>{
  it('accepts structured JSON response objects',()=>{
    expect(parseLessonPackageResult({response:packageDraft})).toEqual(packageDraft);
  });

  it('accepts fenced/text JSON provider responses',()=>{
    expect(parseLessonPackageResult({response:`\`\`\`json\n${JSON.stringify(packageDraft)}\n\`\`\``})).toEqual(packageDraft);
  });

  it('rejects partial, empty, or malformed package output',()=>{
    expect(()=>parseLessonPackageResult({response:{rpp:'RPP'}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({response:{...packageDraft,lkpd:''}})).toThrow('invalid-shape');
    expect(()=>parseLessonPackageResult({usage:{prompt_tokens:1}})).toThrow('missing-response');
  });
});
