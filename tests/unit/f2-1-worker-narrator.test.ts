import{describe,expect,it}from'vitest';
import{parseNarrativeResult}from'../../worker/index';

describe('F2.1 Workers AI narrative normalization',()=>{
  it('accepts the legacy text response shape',()=>{
    expect(parseNarrativeResult({response:'{"headline":"Ringkas","priorities":["Cek laporan"]}'})).toEqual({headline:'Ringkas',priorities:['Cek laporan']});
  });

  it('accepts structured JSON response objects from Workers AI JSON mode',()=>{
    expect(parseNarrativeResult({response:{headline:'Ringkas',priorities:['Cek laporan']}})).toEqual({headline:'Ringkas',priorities:['Cek laporan']});
  });

  it('rejects malformed or over-broad provider responses',()=>{
    expect(()=>parseNarrativeResult({response:{headline:'',priorities:[]}})).toThrow('invalid-shape');
    expect(()=>parseNarrativeResult({response:{headline:'Ringkas',priorities:[123]}})).toThrow('invalid-shape');
    expect(()=>parseNarrativeResult({usage:{prompt_tokens:1}})).toThrow('missing-response');
  });
});
