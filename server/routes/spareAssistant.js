import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';

const r=Router();
const codeFrom=v=>String(v||'').toUpperCase().match(/[A-Z]{3}\d{12}/)?.[0]||null;
const num=v=>Number(v||0);
const safeText=(v,n=200)=>String(v||'').trim().slice(0,n);

function providerConfig(){
  const openRouterKey=process.env.OPENROUTER_API_KEY||'';
  const explicitBase=process.env.AI_BASE_URL||process.env.AI_IMPORT_BASE_URL||'';
  const explicitKey=process.env.AI_API_KEY||process.env.AI_IMPORT_API_KEY||'';
  const explicitModel=process.env.AI_MODEL||process.env.AI_IMPORT_MODEL||'';
  const base=(explicitBase||(openRouterKey?'https://openrouter.ai/api/v1':'')).replace(/\/$/,'');
  const key=explicitKey||openRouterKey;
  const model=explicitModel||(openRouterKey?'openrouter/free':'');
  let provider='Rule Engine';
  if(base&&key&&model){
    const b=base.toLowerCase(),m=model.toLowerCase();
    provider=b.includes('openrouter.ai')?'OpenRouter':b.includes('openai.com')?'OpenAI':b.includes('generativelanguage.googleapis.com')||m.includes('gemini')?'Gemini':b.includes('localhost')||b.includes('127.0.0.1')||b.includes('ollama')?'Local / Ollama':'OpenAI-compatible AI';
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

function scopedWhere(context={},extra={}){
  const p=[],w=['m.active=true','u.active=true'];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  const departmentCode=safeText(extra.department_code||context.department_code,80);
  const equipment=safeText(extra.equipment||context.equipment,120);
  const subEquipment=safeText(extra.sub_equipment||context.sub_equipment,120);
  const discipline=safeText(extra.discipline||context.discipline,80);
  if(departmentCode)add('l.department_code=?',departmentCode);
  if(equipment)add('(l.equipment_name=? OR l.area_name=?)',equipment); // fixed below when duplicated placeholder is expanded
  if(equipment){p.pop();w.pop();p.push(equipment);w.push(`(l.equipment_name=$${p.length} OR l.area_name=$${p.length})`)}
  if(subEquipment)add('l.sub_equipment_name=?',subEquipment);
  if(discipline)add('u.discipline=?',discipline);
  return {p,w};
}

async function materialRows(context={},filters={}){
  const {p,w}=scopedWhere(context,filters);
  const code=codeFrom(filters.material_code||'');
  if(code){p.push(code);w.push(`m.material_code=$${p.length}`)}
  const search=safeText(filters.search,120);
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.part_number ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  if(filters.zero_stock)w.push('COALESCE(m.store_qty,0)=0');
  if(filters.no_po)w.push('COALESCE(m.po_qty,0)=0');
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50);
  const sql=`SELECT m.material_code,m.spare_name,m.description,m.part_number,m.uom,m.vendor,m.store_qty,m.pr_qty,m.po_qty,
      SUM(COALESCE(u.required_qty,0)) required_qty,
      COUNT(DISTINCT u.location_id) usage_count,
      string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name)) locations
    FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id
    WHERE ${w.join(' AND ')}
    GROUP BY m.id
    ORDER BY GREATEST(SUM(COALESCE(u.required_qty,0))-(COALESCE(m.store_qty,0)+COALESCE(m.pr_qty,0)+COALESCE(m.po_qty,0)),0) DESC,m.material_code
    LIMIT ${limit}`;
  let rows=(await q(sql,p)).rows.map(x=>({...x,uncovered_gap:Math.max(num(x.required_qty)-(num(x.store_qty)+num(x.pr_qty)+num(x.po_qty)),0),spare_character:character(x)}));
  if(filters.pr_eligible)rows=rows.filter(x=>num(x.required_qty)>num(x.store_qty)+num(x.pr_qty)+num(x.po_qty));
  return rows;
}

const tools=[
  {type:'function',function:{name:'get_material_profile',description:'Get the authoritative current profile for one spare by Material Code, including requirement, store, PR, PO, gap, locations and spare character.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'find_pr_eligible_spares',description:'Find spares whose current stock plus open PR plus open PO does not cover the recorded required quantity.',parameters:{type:'object',properties:{equipment:{type:'string'},sub_equipment:{type:'string'},discipline:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'find_zero_stock_spares',description:'Find zero-stock spares, optionally only those without an open PO.',parameters:{type:'object',properties:{without_po:{type:'boolean'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'search_spares',description:'Search spare master data by material code fragment, spare name, description, part number or vendor.',parameters:{type:'object',properties:{search:{type:'string'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['search'],additionalProperties:false}}},
  {type:'function',function:{name:'get_procurement_justification_facts',description:'Get authoritative facts needed to draft a procurement justification for one material. This tool does not invent consumption, lead time or failure history.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}}
];

async function runTool(name,args,context){
  if(name==='get_material_profile')return {rows:await materialRows(context,{material_code:args.material_code,limit:5})};
  if(name==='find_pr_eligible_spares')return {rows:await materialRows(context,{...args,pr_eligible:true,limit:args.limit||20})};
  if(name==='find_zero_stock_spares')return {rows:await materialRows(context,{...args,zero_stock:true,no_po:Boolean(args.without_po),limit:args.limit||20})};
  if(name==='search_spares')return {rows:await materialRows(context,{...args,search:args.search,limit:args.limit||20})};
  if(name==='get_procurement_justification_facts'){
    const rows=await materialRows(context,{material_code:args.material_code,limit:5});
    return {rows,missing_evidence:['consumption history','lead time','unit price','failure history'].filter(Boolean)};
  }
  return {error:'Unknown tool'};
}

function fallbackAnswer(rows,context){
  if(!rows.length)return `I could not find matching spare data${context?.equipment?` under ${context.equipment}`:''}. Try a Material Code, spare name, or broaden the current filters.`;
  return `Based on current dashboard data:\n${rows.slice(0,8).map(x=>`${x.material_code} — ${x.spare_name||x.description||'Spare'}: required ${num(x.required_qty)}, store ${num(x.store_qty)}, open PR ${num(x.pr_qty)}, open PO ${num(x.po_qty)}, uncovered gap ${num(x.uncovered_gap)}. Character: ${x.spare_character}. Used at ${x.locations||'unmapped location'}.`).join('\n')}`;
}

async function callModel(cfg,messages,withTools=true){
  const headers={'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}`};
  if(cfg.provider==='OpenRouter'){
    headers['HTTP-Referer']=process.env.APP_PUBLIC_URL||'https://plant-spare-dashboard.onrender.com';
    headers['X-Title']='Plant Spare Dashboard - Spare Copilot';
  }
  const body={model:cfg.model,messages,temperature:0.1};
  if(withTools){body.tools=tools;body.tool_choice='auto'}
  const resp=await fetch(`${cfg.base}/chat/completions`,{method:'POST',headers,body:JSON.stringify(body)});
  if(!resp.ok){const detail=await resp.text().catch(()=> '');throw new Error(`AI provider returned ${resp.status}${detail?`: ${detail.slice(0,180)}`:''}`)}
  return resp.json();
}

r.get('/spare-assistant/status',auth,(req,res)=>{
  const c=providerConfig();
  res.json({configured:c.configured,provider:c.provider,model:c.configured?c.model:null,capabilities:{databaseGrounding:true,toolCalling:c.configured,plannerRules:true,conversationContext:true,vision:false,web:false}});
});

r.post('/spare-assistant/ask',auth,async(req,res)=>{
  const question=safeText(req.body?.question,3000);
  const context=req.body?.context&&typeof req.body.context==='object'?req.body.context:{};
  context.department_code=safeText(req.body?.department_code||context.department_code,80);
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:safeText(x.text,1800)})):[];
  if(!question)return res.status(400).json({error:'Ask a spare-related question'});
  const cfg=providerConfig();
  const code=codeFrom(question);
  const fallbackRows=await materialRows(context,code?{material_code:code,limit:5}:{search:question.split(/\s+/).filter(x=>x.length>3).slice(0,4).join(' '),limit:8});
  const fallback=fallbackAnswer(fallbackRows,context);
  if(!cfg.configured)return res.json({aiEnabled:false,engine:cfg.provider,answer:fallback,materials:fallbackRows.slice(0,12),note:'OpenRouter/API key is not configured yet; using deterministic spare-data tools.'});

  const system=`You are Spare Copilot, an industrial maintenance and spare-planning agent. You MUST use the provided tools whenever the user asks about a material, stock, PR/PO coverage, criticality, procurement justification, or lists of spares. Tool/database results are authoritative. Never invent SAP values, nameplate values, consumption, failure history, lead time, price, vendor performance or technical specifications. If evidence is missing, state what is missing. Never modify data. Current UI context: ${JSON.stringify(context)}.`;
  const messages=[{role:'system',content:system},...history,{role:'user',content:question}];
  const usedTools=[];
  try{
    for(let step=0;step<4;step++){
      const body=await callModel(cfg,messages,true);
      const msg=body?.choices?.[0]?.message;
      if(!msg)throw new Error('AI returned no message');
      messages.push(msg);
      const calls=Array.isArray(msg.tool_calls)?msg.tool_calls:[];
      if(!calls.length){
        const answer=safeText(msg.content,12000)||fallback;
        return res.json({aiEnabled:true,engine:cfg.provider,model:cfg.model,answer,materials:fallbackRows.slice(0,12),toolsUsed:usedTools});
      }
      for(const call of calls){
        const name=call?.function?.name||'';
        let args={};try{args=JSON.parse(call?.function?.arguments||'{}')}catch{}
        const result=await runTool(name,args,context);
        usedTools.push(name);
        messages.push({role:'tool',tool_call_id:call.id,name,content:JSON.stringify(result).slice(0,30000)});
      }
    }
    const body=await callModel(cfg,messages,false);
    const answer=safeText(body?.choices?.[0]?.message?.content,12000)||fallback;
    res.json({aiEnabled:true,engine:cfg.provider,model:cfg.model,answer,materials:fallbackRows.slice(0,12),toolsUsed:usedTools});
  }catch(e){
    res.json({aiEnabled:false,engine:'Rule Engine',answer:fallback,materials:fallbackRows.slice(0,12),note:`AI unavailable: ${e.message}. Fell back to deterministic spare-data tools.`});
  }
});

export default r;
