import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';
import {areaVariants} from '../domain/area.js';

const r=Router();
const clean=v=>String(v??'').trim();

async function candidateRows({department_code='',area='',search=''}){
  const p=[],w=['m.active=true','u.active=true',`m.material_code ~ '^[A-Z]{3}[0-9]{12}$'`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const x=await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.vendor,COALESCE(m.store_qty,0) store_qty,COALESCE(m.pr_qty,0) pr_qty,COALESCE(m.po_qty,0) po_qty,MAX(COALESCE(u.required_qty,0)) required_qty,string_agg(DISTINCT CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END,', ' ORDER BY CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END) areas,string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name)) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.id`,p);
  return x.rows.map(row=>{
    const required=Number(row.required_qty||0),store=Number(row.store_qty||0),pr=Number(row.pr_qty||0),po=Number(row.po_qty||0);
    const pipeline=store+pr+po,ideal=Math.max(required-pipeline,0),critical=required>0&&store<required,eligible=critical&&ideal>0;
    const ratio=required>0?ideal/required:0;
    const rule_priority=!eligible?'Covered':store<=0?'Urgent':ratio>=0.5?'High':'Medium';
    return {...row,required_qty:required,store_qty:store,pr_qty:pr,po_qty:po,pipeline_qty:pipeline,ideal_pr_qty:ideal,critical,pr_eligible:eligible,rule_priority,rule_reason:eligible?`Uncovered gap ${ideal} after Store + PR + PO`:(critical?'Low stock, but existing PR/PO covers the current requirement':'Stock meets current requirement')};
  });
}

r.get('/procurement',auth,async(req,res)=>{
  const {department_code='',area='',type='po',search=''}=req.query;
  if(type==='critical'||type==='eligible'){
    const rows=await candidateRows({department_code,area,search});
    const filtered=rows.filter(x=>type==='critical'?x.critical:x.pr_eligible).sort((a,b)=>b.ideal_pr_qty-a.ideal_pr_qty||String(a.material_code).localeCompare(String(b.material_code)));
    return res.json(filtered);
  }
  const p=[],w=['m.active=true','u.active=true',`(m.material_code IS NULL OR m.material_code ~ '^[A-Z]{3}[0-9]{12}$')`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(type==='pr')w.push('COALESCE(m.pr_qty,0)>0');
  else if(type==='po')w.push('COALESCE(m.po_qty,0)>0');
  else w.push('(COALESCE(m.pr_qty,0)>0 OR COALESCE(m.po_qty,0)>0)');
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const x=await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.pr_qty,m.po_qty,m.vendor,string_agg(DISTINCT CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END,', ' ORDER BY CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END) areas,string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name)) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.id ORDER BY CASE WHEN $${p.length+1}='pr' THEN COALESCE(m.pr_qty,0) ELSE COALESCE(m.po_qty,0) END DESC,m.material_code`,[...p,type]);
  res.json(x.rows);
});

r.post('/procurement/pr-eligible/screen',auth,async(req,res)=>{
  const {department_code='',area='',search=''}=req.body||{};
  const eligible=(await candidateRows({department_code,area,search})).filter(x=>x.pr_eligible).sort((a,b)=>b.ideal_pr_qty-a.ideal_pr_qty).slice(0,100);
  const fallback=eligible.map(x=>({material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason}));
  const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
  if(!base||!key||!model)return res.json({aiEnabled:false,source:'rule-screen',rows:eligible,screening:fallback,message:'AI provider is not configured. Deterministic PR eligibility and priority are shown.'});
  const payload=eligible.map(x=>({material_code:x.material_code,spare_name:x.spare_name,description:x.description,required_qty:x.required_qty,store_qty:x.store_qty,open_pr:x.pr_qty,open_po:x.po_qty,ideal_pr_qty:x.ideal_pr_qty,vendor:x.vendor,area:x.areas,equipment:x.equipment}));
  const prompt=`Review this already rule-qualified industrial spare PR list. Do NOT alter material codes, eligibility or ideal_pr_qty. Rank urgency only. Return JSON {rankings:[{material_code,priority,reason}]}. priority must be Urgent, High, Medium or Low. Use only supplied facts; never invent consumption, lead time, price or history. Candidates: ${JSON.stringify(payload)}`;
  try{
    const response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious industrial spare procurement reviewer. Deterministic rules decide eligibility and quantity; you only rank urgency and explain.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});
    if(!response.ok)throw new Error(`AI provider returned ${response.status}`);
    const body=await response.json();const raw=body?.choices?.[0]?.message?.content||'{}';const parsed=JSON.parse(String(raw).replace(/^```json\s*/i,'').replace(/```$/,'').trim());
    const allowed=new Set(eligible.map(x=>x.material_code));const rankings=(parsed.rankings||[]).filter(x=>allowed.has(clean(x.material_code))).map(x=>({material_code:clean(x.material_code),priority:['Urgent','High','Medium','Low'].includes(x.priority)?x.priority:'Medium',reason:clean(x.reason).slice(0,300)}));
    const rankMap=new Map(rankings.map(x=>[x.material_code,x]));
    return res.json({aiEnabled:true,source:'ai-review',rows:eligible,screening:eligible.map(x=>rankMap.get(x.material_code)||{material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason}),message:'AI reviewed only the deterministic PR-eligible list. Quantities were not changed.'});
  }catch(error){return res.json({aiEnabled:false,source:'rule-screen',rows:eligible,screening:fallback,message:`AI review unavailable: ${error.message}. Deterministic result shown.`})}
});

export default r;
