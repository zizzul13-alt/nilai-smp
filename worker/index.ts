type AiBinding={run:(model:string,input:unknown)=>Promise<unknown>};
type Env={AI:AiBinding;ASSETS:{fetch:(request:Request)=>Promise<Response>}};

const SUPABASE_URL='https://ifnnmmilurqtvvxywrlo.supabase.co';
const MODEL='@cf/meta/llama-3.2-3b-instruct';
const MAX_BODY=12_000;

type BriefContext={
  generated_at:string;
  active_meetings:Array<{class_id:string;class_name:string;meeting_id:string}>;
  continuity_attention:Array<{class_id:string;class_name:string;reason:string}>;
  active_correction:null|{assessment_id:string;assessment_title:string;class_id:string;class_name:string};
  pending_safe_summary:{pending:number;failed:number;conflict:number};
  pacing_attention:{compressed:number;total:number};
  assessment_attention:{unchecked:number;missing:number;total:number};
  reporting_attention:{open:number;finalized:number;total:number};
};

function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
function validNarrative(value:unknown):value is {headline:string;priorities:string[]}{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  return typeof row.headline==='string'&&row.headline.length>0&&row.headline.length<=240&&Array.isArray(row.priorities)&&row.priorities.length<=7&&row.priorities.every(item=>typeof item==='string'&&item.length>0&&item.length<=300);
}
function extractJson(text:string){const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);const source=fenced?.[1]??text;const start=source.indexOf('{');const end=source.lastIndexOf('}');if(start<0||end<=start)throw new Error('no-json');return JSON.parse(source.slice(start,end+1)) as unknown;}

async function authenticate(request:Request){
  const authorization=request.headers.get('authorization');
  const publishable=request.headers.get('x-supabase-publishable-key');
  if(!authorization?.startsWith('Bearer ')||!publishable)return false;
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:authorization,apikey:publishable}});
  return response.ok;
}

async function teacherBrief(request:Request,env:Env){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!(await authenticate(request)))return json({error:'unauthorized'},401);
  const raw=await request.text();
  if(raw.length>MAX_BODY)return json({error:'payload_too_large'},413);
  let context:BriefContext;
  try{context=(JSON.parse(raw) as {context:BriefContext}).context;}catch{return json({error:'invalid_json'},400);}
  if(!context||!Array.isArray(context.active_meetings)||!context.assessment_attention||!context.pending_safe_summary)return json({error:'invalid_context'},400);
  const safeContext={...context,active_meetings:context.active_meetings.map(({class_id,class_name})=>({class_id,class_name})),active_correction:context.active_correction?{assessment_title:context.active_correction.assessment_title,class_id:context.active_correction.class_id,class_name:context.active_correction.class_name}:null};
  const result=await env.AI.run(MODEL,{messages:[
    {role:'system',content:'Anda adalah asisten ringkas untuk guru SMP. Data yang diberikan adalah konteks kanonik read-only. Jangan menciptakan fakta, nilai, siswa, Meeting, deadline, atau tindakan. Jangan mengubah data. Tulis Bahasa Indonesia yang singkat dan praktis. Kembalikan JSON saja: {"headline":"...","priorities":["..."]}. Maksimal 5 prioritas. Jika tidak ada perhatian nyata, katakan demikian.'},
    {role:'user',content:`Ringkas konteks berikut tanpa menambah fakta:\n${JSON.stringify(safeContext)}`}
  ],max_tokens:450,temperature:0.2});
  const responseText=typeof result==='object'&&result!==null&&'response' in result?String((result as {response:unknown}).response):'';
  try{const narrative=extractJson(responseText);if(!validNarrative(narrative))throw new Error('invalid-shape');return json(narrative);}catch{return json({error:'invalid_provider_response'},502);}
}

export default{async fetch(request:Request,env:Env){const url=new URL(request.url);if(url.pathname==='/api/teacher-brief')return teacherBrief(request,env);return env.ASSETS.fetch(request);}};
