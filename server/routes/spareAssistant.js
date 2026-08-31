import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';

const r=Router();
const codeFrom=v=>String(v||'').toUpperCase().match(/[A-Z]{3}\d{12}/)?.[0]||null;

function fallbackAnswer(rows,question){
  if(!rows.length)return 'I could not find a matching spare in the current dashboard data. Try a Material Code or spare name.';
  const top=rows.slice(0,8);
  const lines=top.map(x=>{
    const req=Number(x.required_qty||0),store=Number(x.store_qty||0),pr=Number(x.pr_qty||0),po=Number(x.po_qty||0),gap=Math.max(req-(store+pr+po),0);
    const status=gap>0?'PR review':'covered';
    return `${x.material_code} — ${x.spare_name||x.description||'Spare'}: required ${req}, store ${store}, open PR ${pr}, open PO ${po}, uncovered gap ${gap}, ${status}. Used at ${x.locations||'unmapped location'}.`;
  });
  return `Based on current spare data:\n${lines.join('\n')}`;
}

r.post('/spare-assistant/ask',auth,async(req,res)=>{
  const question=String(req.body?.question||'').trim();
  const departmentCode=String(req.body?.department_code||'').trim();
  if(!question)return res.status(400).json({error:'Ask a spare-related question'});
  const code=codeFrom(question);
  const p=[],w=['m.active=true','u.active=true'];
  if(departmentCode){p.push(departmentCode);w.push(`l.department_code=$${p.length}`)}
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
    LIMIT ${code?5:40}`;
  let rows=(await q(sql,p)).rows;
  if(wantsPr)rows=rows.filter(x=>Number(x.required_qty||0)>(Number(x.store_qty||0)+Number(x.pr_qty||0)+Number(x.po_qty||0)));
  const fallback=fallbackAnswer(rows,question);
  const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
  if(!base||!key||!model)return res.json({aiEnabled:false,answer:fallback,materials:rows.slice(0,12),note:'AI provider is not configured; answer generated from dashboard rules and data.'});
  const facts=rows.slice(0,20).map(x=>({...x,uncovered_gap:Math.max(Number(x.required_qty||0)-(Number(x.store_qty||0)+Number(x.pr_qty||0)+Number(x.po_qty||0)),0)}));
  const prompt=`You are an in-app industrial Spare Assistant for planners. Answer ONLY from the supplied spare facts. Do not invent nameplate values, consumption history, failure history, lead time, prices, vendor performance or specifications unless explicitly present. Backend quantities are authoritative. If asked for procurement justification, draft a concise planner justification using current stock, required quantity, open PR/PO, uncovered gap, usage locations and known description only. If data is insufficient, say what is missing. User question: ${question}\nFacts: ${JSON.stringify(facts)}`;
  try{
    const resp=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious industrial spare-planning copilot grounded only in supplied plant data.'},{role:'user',content:prompt}],temperature:0.15})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);
    const body=await resp.json();const answer=String(body?.choices?.[0]?.message?.content||'').trim()||fallback;
    res.json({aiEnabled:true,answer,materials:rows.slice(0,12)});
  }catch(e){res.json({aiEnabled:false,answer:fallback,materials:rows.slice(0,12),note:`AI unavailable: ${e.message}. Showing rule-based answer.`})}
});

export default r;
