import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';
import {areaVariants} from '../domain/area.js';

const r=Router();

function ruleExplanation(x){
  const required=Number(x.required_qty||0),store=Number(x.store_qty||0),pr=Number(x.pr_qty||0),po=Number(x.po_qty||0),gap=Number(x.ideal_pr_qty||0);
  const reasons=[];
  if(store<=0)reasons.push('no stock available');
  else if(store<required)reasons.push(`stock ${store} is below required ${required}`);
  if(pr>0)reasons.push(`${pr} already in PR`);
  if(po>0)reasons.push(`${po} already in PO`);
  if(gap>0)reasons.push(`${gap} remains uncovered after PR/PO`);
  if(Number(x.usage_count||0)>1)reasons.push(`used in ${x.usage_count} locations`);
  if(Number(x.history_updates||0)>0)reasons.push(`${x.history_updates} historical stock/procurement update(s) recorded`);
  return reasons.length?reasons.join('; '):'Current stock and procurement pipeline cover the required quantity.';
}

function spareCharacter(x){
  const tags=[];
  const required=Number(x.required_qty||0),store=Number(x.store_qty||0),pr=Number(x.pr_qty||0),po=Number(x.po_qty||0);
  if(store<=0&&required>0)tags.push('Zero-stock');
  if(store<required&&pr+po>0)tags.push('Pipeline-dependent');
  if(Number(x.usage_count||0)>1)tags.push('Multi-location');
  if(Number(x.pr_updates||0)+Number(x.po_updates||0)>=3)tags.push('Repeat procurement activity');
  if(Number(x.stock_updates||0)>=3)tags.push('Frequently refreshed stock');
  if(x.pr_eligible)tags.push('Uncovered shortage');
  return tags.length?tags.join(' · '):'Low historical signal';
}

r.get('/spare-intelligence',auth,async(req,res)=>{
  const {department_code='',area='',discipline='',search='',status='all'}=req.query;
  const p=[],w=['m.active=true','u.active=true',`m.material_code ~ '^[A-Z]{3}[0-9]{12}$'`];
  if(department_code){p.push(department_code);w.push(`l.department_code=$${p.length}`)}
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(discipline){p.push(discipline);w.push(`u.discipline=$${p.length}`)}
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const sql=`WITH base AS (
    SELECT m.id,m.material_code,m.spare_name,m.description,m.uom,m.store_qty,m.pr_qty,m.po_qty,m.vendor,
      SUM(COALESCE(u.required_qty,0)) required_qty,
      COUNT(DISTINCT u.location_id) usage_count,
      string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name)) locations
    FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id
    WHERE ${w.join(' AND ')} GROUP BY m.id
  ), hist AS (
    SELECT c->>'material_code' material_code,
      COUNT(*) history_updates,
      COUNT(*) FILTER (WHERE (c->'new') ? 'store_qty') stock_updates,
      COUNT(*) FILTER (WHERE (c->'new') ? 'pr_qty') pr_updates,
      COUNT(*) FILTER (WHERE (c->'new') ? 'po_qty') po_updates,
      MAX(h.imported_at) last_history_update,
      MIN(h.imported_at) first_history_update
    FROM import_history h
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(h.details->'changes')='array' THEN h.details->'changes' ELSE '[]'::jsonb END) c
    GROUP BY c->>'material_code'
  )
  SELECT base.*,
    COALESCE(hist.history_updates,0) history_updates,
    COALESCE(hist.stock_updates,0) stock_updates,
    COALESCE(hist.pr_updates,0) pr_updates,
    COALESCE(hist.po_updates,0) po_updates,
    hist.first_history_update,hist.last_history_update,
    COALESCE(store_qty,0)+COALESCE(pr_qty,0)+COALESCE(po_qty,0) pipeline_qty,
    (COALESCE(store_qty,0)<required_qty) critical,
    (COALESCE(store_qty,0)+COALESCE(pr_qty,0)+COALESCE(po_qty,0)<required_qty) pr_eligible,
    GREATEST(required_qty-(COALESCE(store_qty,0)+COALESCE(pr_qty,0)+COALESCE(po_qty,0)),0) ideal_pr_qty,
    LEAST(100,ROUND((CASE WHEN required_qty>0 THEN GREATEST(required_qty-COALESCE(store_qty,0),0)/required_qty ELSE 0 END)*55
      + CASE WHEN COALESCE(store_qty,0)=0 AND required_qty>0 THEN 20 ELSE 0 END
      + CASE WHEN COALESCE(store_qty,0)+COALESCE(pr_qty,0)+COALESCE(po_qty,0)<required_qty THEN 20 ELSE 0 END
      + CASE WHEN COALESCE(hist.pr_updates,0)+COALESCE(hist.po_updates,0)>=3 THEN 5 ELSE 0 END))::int risk_score
    FROM base LEFT JOIN hist ON hist.material_code=base.material_code`;
  const rows=(await q(sql,p)).rows.map(x=>({...x,rule_explanation:ruleExplanation(x),spare_character:spareCharacter(x)}));
  const filtered=rows.filter(x=>status==='critical'?x.critical:status==='pr_eligible'?x.pr_eligible:status==='covered'?!x.pr_eligible:true)
    .sort((a,b)=>Number(b.risk_score)-Number(a.risk_score)||Number(b.ideal_pr_qty)-Number(a.ideal_pr_qty));
  const historyReady=rows.filter(x=>Number(x.history_updates||0)>0).length;
  res.json({rows:filtered,summary:{total:rows.length,critical:rows.filter(x=>x.critical).length,pr_eligible:rows.filter(x=>x.pr_eligible).length,covered:rows.filter(x=>!x.pr_eligible).length,history_ready:historyReady}});
});

r.post('/spare-intelligence/review',auth,async(req,res)=>{
  const items=Array.isArray(req.body?.items)?req.body.items.slice(0,25):[];
  if(!items.length)return res.status(400).json({error:'No spare candidates supplied'});
  const fallback=items.map((x,i)=>({material_code:x.material_code,priority:i+1,classification:x.pr_eligible?'PR Review':'Monitor',reason:`${ruleExplanation(x)} Character: ${spareCharacter(x)}.`,confidence:'rule-based'}));
  const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
  if(!base||!key||!model)return res.json({aiEnabled:false,reviews:fallback,note:'AI provider is not configured; showing deterministic historical review.'});
  const prompt=`You are reviewing industrial spare-material planning candidates. Backend calculations are authoritative. Never change material codes, stock, required quantity, PR, PO or ideal PR quantity. Rank urgency and explain only from supplied facts. Historical update counts indicate how often this dashboard has received stock/PR/PO changes; they are NOT consumption counts. Do not claim consumption, failure frequency, lead time, vendor delay or price trends unless those fields are explicitly supplied. Return JSON object {reviews:[{material_code,priority,classification,reason,confidence}]}. Classification must be one of: Immediate PR Review, Planner Review, Monitor, Covered. Facts: ${JSON.stringify(items)}`;
  try{
    const resp=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious industrial spare-planning reviewer. Do not invent history or quantities.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);
    const body=await resp.json();const raw=String(body?.choices?.[0]?.message?.content||'').replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    const parsed=JSON.parse(raw);return res.json({aiEnabled:true,reviews:Array.isArray(parsed.reviews)?parsed.reviews:fallback});
  }catch(e){return res.json({aiEnabled:false,reviews:fallback,note:`AI unavailable: ${e.message}. Showing deterministic historical review.`})}
});

export default r;
