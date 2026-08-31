import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';

const r=Router();
const codeFrom=v=>String(v||'').toUpperCase().match(/[A-Z]{3}\d{12}/)?.[0]||null;
const num=v=>Number(v||0);

function providerConfig(){
  const base=(process.env.AI_BASE_URL||process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_API_KEY||process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_MODEL||process.env.AI_IMPORT_MODEL||'';
  let provider='Rule Engine';
  if(base&&key&&model){
    const b=base.toLowerCase(),m=model.toLowerCase();
    provider=b.includes('openai.com')?'OpenAI':b.includes('generativelanguage.googleapis.com')||m.includes('gemini')?'Gemini':b.includes('localhost')||b.includes('127.0.0.1')||b.includes('ollama')?'Local / Ollama':'OpenAI-compatible AI';
  }
  return {base,key,model,provider,configured:Boolean(base&&key&&model)};
}

function character(x){
  const tags=[];const req=num(x.required_qty),store=num(x.store_qty),pr=num(x.pr_qty),po=num(x.po_qty);
  if(req>0&&store===0)tags.push('Zero stock');
  if(req>0&&store<req)tags.push('Below required');
  if(store+pr+po<req)tags.push('Uncovered shortage');
  if(pr+po>0&&store<req)tags.push('Pipeline dependent');
  if(num(x.usage_count)>1)tags.push('Multi-location');
  return tags.length?tags.join(' · '):'Currently covered';
}

function fallbackAnswer(rows,question,context){
  if(!rows.length)return `I could not find matching spare data${context?.equipment?` under ${context.equipment}`:''}. Try a Material Code, spare name, or broaden the current filters.`;
  const wantsJustification=/justification|justify|procure|purchase/i.test(question);
  const top=rows.slice(0,wantsJustification?3:8);
  const lines=top.map(x=>{
    const req=num(x.required_qty),store=num(x.store_qty),pr=num(x.pr_qty),po=num(x.po_qty),gap=Math.max(req-(store+pr+po),0);
    const name=x.spare_name||x.description||'Spare';
    if(wantsJustification)return `${x.material_code} — ${name}: Required ${req}; available stock ${store}; open PR ${pr}; open PO ${po}; uncovered gap ${gap}. Used at ${x.locations||'unmapped location'}. Planner justification: ${gap>0?`procurement review is required because ${gap} unit(s) remain uncovered after current stock and pipeline.`:'current stock and procurement pipeline cover the recorded requirement; additional procurement needs further consumption/lead-time evidence.'}`;
    return `${x.material_code} — ${name}: required ${req}, store ${store}, open PR ${pr}, open PO ${po}, uncovered gap ${gap}. Character: ${character(x)}. Used at ${x.locations||'unmapped location'}.`;
  });
  return `Based on the current dashboard data${context?.page?` on ${context.page}`:''}:\n${lines.join('\n')}`;
}

r.get('/spare-assistant/status',auth,(req,res)=>{
  const c=providerConfig();
  res.json({configured:c.configured,provider:c.provider,model:c.configured?c.model:null,capabilities:{databaseGrounding:true,plannerRules:true,conversationContext:true,vision:false,web:false}});
});

r.post('/spare-assistant/ask',auth,async(req,res)=>{
  const question=String(req.body?.question||'').trim();
  const context=req.body?.context&&typeof req.body.context==='object'?req.body.context:{};
  const departmentCode=String(req.body?.department_code||context.department_code||'').trim();
  const equipment=String(context.equipment||'').trim(),subEquipment=String(context.sub_equipment||'').trim(),discipline=String(context.discipline||'').trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.text||'').slice(0,1500)})):[];
  if(!question)return res.status(400).json({error:'Ask a spare-related question'});
  const code=codeFrom(question);
  const p=[],w=['m.active=true','u.active=true'];
  if(departmentCode){p.push(departmentCode);w.push(`l.department_code=$${p.length}`)}
  if(equipment){p.push(equipment);w.push(`(l.equipment_name=$${p.length} OR l.area_name=$${p.length})`)}
  if(subEquipment){p.push(subEquipment);w.push(`l.sub_equipment_name=$${p.length}`)}
  if(discipline){p.push(discipline);w.push(`u.discipline=$${p.length}`)}
  if(code){p.push(code);w.push(`m.material_code=$${p.length}`)}
  const wantsZero=/zero\s*stock|no\s*stock/i.test(question),wantsNoPo=/no\s*po|without\s*po/i.test(question),wantsPr=/pr\s*eligible|pr\s*review|raise\s*pr/i.test(question);
  if(wantsZero)w.push('COALESCE(m.store_qty,0)=0');
  if(wantsNoPo)w.push('COALESCE(m.po_qty,0)=0');
  const sql=`SELECT m.material_code,m.spare_name,m.description,m.part_number,m.uom,m.vendor,m.store_qty,m.pr_qty,m.po_qty,
      SUM(COALESCE(u.required_qty,0)) required_qty,
      COUNT(DISTINCT u.location_id) usage_count,
      string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name)) locations
    FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id
    WHERE ${w.join(' AND ')}
    GROUP BY m.id
    ORDER BY GREATEST(SUM(COALESCE(u.required_qty,0))-(COALESCE(m.store_qty,0)+COALESCE(m.pr_qty,0)+COALESCE(m.po_qty,0)),0) DESC,m.material_code
    LIMIT ${code?5:60}`;
  let rows=(await q(sql,p)).rows;
  if(wantsPr)rows=rows.filter(x=>num(x.required_qty)>num(x.store_qty)+num(x.pr_qty)+num(x.po_qty));
  const fallback=fallbackAnswer(rows,question,context);
  const cfg=providerConfig();
  if(!cfg.configured)return res.json({aiEnabled:false,engine:cfg.provider,answer:fallback,materials:rows.slice(0,12),note:'No external model configured; using deterministic spare-data tools.'});
  const facts=rows.slice(0,24).map(x=>({...x,uncovered_gap:Math.max(num(x.required_qty)-(num(x.store_qty)+num(x.pr_qty)+num(x.po_qty)),0),spare_character:character(x)}));
  const prompt=`You are an industrial Spare Planning Copilot. The application database and backend calculations are the source of truth. Answer ONLY from supplied facts and conversation context. Never invent nameplate values, consumption history, failure history, lead time, prices, vendor performance or technical specifications unless explicitly present. Clearly separate Facts, Assessment, and Missing evidence when useful. If asked for procurement justification, draft a concise planner-ready justification using recorded stock, requirement, open PR/PO, uncovered gap, locations and known description. Current UI context: ${JSON.stringify(context)}. User question: ${question}\nFacts: ${JSON.stringify(facts)}`;
  try{
    const resp=await fetch(`${cfg.base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}`},body:JSON.stringify({model:cfg.model,messages:[{role:'system',content:'You are a cautious industrial spare-planning copilot. Never override SAP/database facts.'},...history,{role:'user',content:prompt}],temperature:0.1})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);
    const body=await resp.json();const answer=String(body?.choices?.[0]?.message?.content||'').trim()||fallback;
    res.json({aiEnabled:true,engine:cfg.provider,model:cfg.model,answer,materials:rows.slice(0,12)});
  }catch(e){res.json({aiEnabled:false,engine:'Rule Engine',answer:fallback,materials:rows.slice(0,12),note:`AI unavailable: ${e.message}. Fell back to deterministic spare-data tools.`})}
});

export default r;
