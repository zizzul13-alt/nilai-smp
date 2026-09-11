import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';
import{deriveTeacherBriefContext,deterministicTeacherBrief,narrateTeacherBrief}from'../../src/services/academic/teacherBrief';
import type{TodayServerSnapshot}from'../../src/services/academic/today';

const service=readFileSync('src/services/academic/teacherBrief.ts','utf8');
const ui=readFileSync('src/components/TeacherBrief.tsx','utf8');
const app=readFileSync('src/app/App.tsx','utf8');

const cls=(patch:Record<string,unknown>={})=>({class_id:'c1',class_name:'8D',active_meeting_id:null,active_meeting_occurred_at:null,active_lesson_title:null,latest_actual_meeting_id:null,latest_actual_meeting_occurred_at:null,latest_actual_meeting_status:null,active_checkpoint_id:null,active_checkpoint_stopped_at:null,active_checkpoint_next_step:null,active_checkpoint_recorded_at:null,latest_checkpoint_id:null,latest_checkpoint_meeting_id:null,latest_checkpoint_stopped_at:null,latest_checkpoint_next_step:null,latest_checkpoint_recorded_at:null,latest_baseline_id:null,latest_baseline_kind:null,latest_baseline_stopped_at:null,latest_baseline_next_step:null,latest_baseline_recorded_at:null,effective_source:null,effective_stopped_at:null,effective_next_step:null,effective_recorded_at:null,...patch});

describe('F2 deterministic Teacher Brief',()=>{
  it('builds bounded aggregate attention without student names or mutation commands',()=>{
    const today={classes:[cls({active_meeting_id:'m1'}),cls({class_id:'c2',class_name:'9A',effective_stopped_at:'Bab 1',effective_recorded_at:'2026-07-01T00:00:00Z'})],correction:{session_id:'s',assessment_id:'a',assessment_title:'Kuis',class_id:'c1',class_name:'8D',current_enrollment_id:null,started_at:'x',updated_at:'x',active_count:1}} as TodayServerSnapshot;
    const context=deriveTeacherBriefContext({now:new Date('2026-09-11T07:00:00Z'),today,safe:{pending:1,failed:1,conflict:0},results:[{state:'UNCHECKED'},{state:'MISSING'},{state:'GRADED'}],pacing:[{normal_meetings:4,available_meetings:3,correction_reserve:0}],reporting:[{status:'OPEN'}]});
    expect(context.active_meetings).toHaveLength(1);
    expect(context.continuity_attention.map(x=>x.reason)).toEqual(['NO_CHECKPOINT','STALE_CONTEXT']);
    expect(context.assessment_attention).toEqual({unchecked:1,missing:1,total:3});
    expect(context.pacing_attention.compressed).toBe(1);
    expect(context.reporting_attention.open).toBe(1);
    expect(JSON.stringify(context)).not.toContain('student_display_name');
  });

  it('remains useful with no AI/provider configured',async()=>{
    const context=deriveTeacherBriefContext({now:new Date('2026-09-11T07:00:00Z'),today:{classes:[],correction:null},safe:{pending:0,failed:0,conflict:0},results:[],pacing:[],reporting:[]});
    expect(deterministicTeacherBrief(context).source).toBe('deterministic');
    expect((await narrateTeacherBrief(context)).source).toBe('deterministic');
  });

  it('falls back deterministically when an optional provider fails',async()=>{
    const context=deriveTeacherBriefContext({now:new Date('2026-09-11T07:00:00Z'),today:{classes:[],correction:null},safe:{pending:0,failed:0,conflict:0},results:[],pacing:[],reporting:[]});
    const result=await narrateTeacherBrief(context,async()=>{throw new Error('quota');});
    expect(result.source).toBe('deterministic');
  });

  it('contains no canonical mutation or provider-specific dependency path',()=>{
    for(const forbidden of[".insert(",".update(",".delete(","client.rpc('","openai","gemini","groq"])expect(service.toLowerCase()).not.toContain(forbidden);
    expect(service).toContain("client.from('assessment_results').select('state').eq('workspace_id',workspaceId)");
    expect(service).toContain("client.from('lesson_pacing_plans')");
    expect(service).toContain("client.from('reporting_cycles')");
  });

  it('is secondary UI and states its advisory/non-mutating boundary',()=>{
    expect(app).toContain("setMode('brief')");
    expect(app).toContain('Brief Guru');
    expect(ui).toContain('Tidak mengubah nilai, Meeting, laporan, atau dokumen');
    expect(ui).toContain('AI/provider bersifat opsional');
  });
});
