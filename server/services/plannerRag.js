import {q} from '../db.js';
import {searchKnowledge} from './knowledge.js';

const clean=v=>String(v??'').trim();
const clip=(v,n=900)=>clean(v).slice(0,n);
const materialPattern=/\b[A-Z]{3}\d{12}\b/g;
const labels=[
  ['root_cause',/\b(root cause|probable cause|cause of failure)\b/i],
  ['failure_mode',/\b(failure mode|failed due|failure observed|symptom)\b/i],
  ['corrective_action',/\b(corrective action|action taken|recommendation|prevent recurrence)\b/i],
  ['fmea_risk',/\b(RPN|severity|occurrence|detection)\b/i],
  ['drawing_reference',/\b(drawing|drg\.?|revision|rev\.?|item no\.?|tolerance)\b/i],
  ['inspection_point',/\b(inspect|inspection|check|measure|clearance|alignment)\b/i],
  ['safety_control',/\b(LOTO|LOTOV|isolation|permit|PPE|hazard)\b/i]
];

export function extractPlannerFacts(text){
  const blocks=clean(text).split(/\n+|(?<=[.!?])\s+/).map(x=>clip(x,700)).filter(x=>x.length>12);
  const facts=[];
  for(const body of blocks){
    for(const code of body.toUpperCase().match(materialPattern)||[])facts.push({type:'material_code',key:code,value:{material_code:code},excerpt:body,confidence:.98});
    for(const [type,re] of labels)if(re.test(body))facts.push({type,key:clip(body.toLowerCase().replace(/[^a-z0-9]+/g,'-'),120),value:{text:body},excerpt:body,confidence:type==='fmea_risk'||type==='drawing_reference'?.72:.66});
  }
  const seen=new Set();
  return facts.filter(x=>{const k=x.type+'|'+x.key;if(seen.has(k))return false;seen.add(k);return true}).slice(0,120);
}

export async function indexPlannerProposals(documentId){
  if(!documentId)return {created:0};
  const chunks=(await q(`SELECT id,content FROM knowledge_chunks WHERE document_id=$1 ORDER BY chunk_index`,[documentId])).rows;
  let created=0;
  for(const chunk of chunks)for(const fact of extractPlannerFacts(chunk.content)){
    const out=await q(`INSERT INTO knowledge_fact_proposals(document_id,chunk_id,fact_type,fact_key,fact_value,source_excerpt,confidence)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(document_id,chunk_id,fact_type,fact_key) DO NOTHING RETURNING id`,
      [documentId,chunk.id,fact.type,fact.key,JSON.stringify(fact.value),fact.excerpt,fact.confidence]);
    created+=out.rowCount||0;
  }
  return {created};
}

export async function listFactProposals({status='pending',limit=100}={}){
  const max=Math.min(Math.max(Number(limit)||100,1),250);
  return (await q(`SELECT p.*,d.title,d.file_name,d.document_type,d.equipment,d.sub_equipment,d.material_code
    FROM knowledge_fact_proposals p JOIN knowledge_documents d ON d.id=p.document_id
    WHERE d.active=true AND ($1='' OR p.status=$1)
    ORDER BY p.created_at DESC LIMIT $2`,[clean(status),max])).rows;
}

export async function reviewFactProposal(id,status,userId){
  if(!['approved','rejected'].includes(status))throw new Error('Review status must be approved or rejected');
  const row=(await q(`UPDATE knowledge_fact_proposals SET status=$2,reviewed_by=$3,reviewed_at=NOW()
    WHERE id=$1 AND status='pending' RETURNING *`,[Number(id),status,userId])).rows[0];
  if(!row)throw new Error('Pending proposal not found');
  return row;
}

function provider(){
  if(process.env.GEMINI_API_KEY)return {kind:'gemini',key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL||'gemini-2.5-flash'};
  const key=process.env.AI_API_KEY||process.env.OPENROUTER_API_KEY;
  if(key)return {kind:'openai',key,base:(process.env.AI_BASE_URL||'https://openrouter.ai/api/v1').replace(/\/$/,''),model:process.env.AI_MODEL||'google/gemini-2.5-flash'};
  return null;
}

async function llmAnswer(question,hits){
  const cfg=provider();if(!cfg)return null;
  const evidence=hits.map((h,i)=>`[S${i+1}] ${h.metadata?.title||h.file_name}, chunk ${Number(h.chunk_index)+1}: ${clip(h.text,1800)}`).join('\n\n');
  const prompt=`You are a senior aluminium plant maintenance planner. Answer only from the supplied evidence. Do not infer dimensions, tolerances, causes, part compatibility, stock, or safety requirements. If evidence is insufficient, say so. Separate: Finding, Planner checks, Spares/materials, Safety, Missing information. Cite every factual sentence with [S1], [S2], etc.\n\nQuestion: ${question}\n\nEvidence:\n${evidence}`;
  if(cfg.kind==='gemini'){
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.1,maxOutputTokens:1200}})});
    if(!response.ok)throw new Error('Gemini planner answer failed');
    const json=await response.json();return json.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||null;
  }
  const response=await fetch(cfg.base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${cfg.key}`},body:JSON.stringify({model:cfg.model,temperature:.1,messages:[{role:'user',content:prompt}]})});
  if(!response.ok)throw new Error('Configured AI planner answer failed');
  const json=await response.json();return json.choices?.[0]?.message?.content||null;
}

function fallbackAnswer(question,hits){
  if(!hits.length)return 'No approved plant evidence was found for this question. Upload or select the relevant RCA/RCFA, FMEA, drawing, manual or repair report.';
  return `Evidence found for “${question}”. Review the cited excerpts below before planning work. An LLM provider is not configured, so the system has not generated conclusions or recommendations.`;
}

export async function askPlanner(question,context={},limit=8){
  const hits=await searchKnowledge(question,context,limit);
  let answer=null,mode='evidence-only';
  try{answer=await llmAnswer(question,hits);if(answer)mode='llm-grounded'}catch{answer=null}
  const sources=hits.map((h,i)=>({id:`S${i+1}`,document_id:h.document_id,title:h.metadata?.title||h.file_name,document_type:h.metadata?.document_type||null,equipment:h.metadata?.equipment||null,sub_equipment:h.metadata?.sub_equipment||null,material_code:h.metadata?.material_code||null,chunk:Number(h.chunk_index)+1,excerpt:clip(h.text,900),score:h.score}));
  return {question,answer:answer||fallbackAnswer(question,hits),mode,sources,warning:'Use as planning support. Verify drawings, dimensions, tolerances, isolation points and material compatibility against approved plant documents before execution.'};
}
