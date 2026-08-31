import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';

const r=Router();
const codeFrom=v=>String(v||'').toUpperCase().match(/[A-Z]{3}\d{12}/)?.[0]||null;
const num=v=>Number(v||0);
const safeText=(v,n=200)=>String(v||'').trim().slice(0,n);

const agentModes={
  planner:{label:'Spare Planner',description:'Stock, PR/PO coverage, criticality, procurement justification and FY planning.'},
  mechanical:{label:'Mechanical',description:'Mechanical spare identification, bearings, shafts, seals, pumps, gearboxes and nameplate/spec interpretation.'},
  electrical:{label:'Electrical',description:'Motors, drives, electrical spares, ratings and nameplate/spec interpretation.'},
  reliability:{label:'Reliability',description:'Criticality, failure context, repair-vs-replace and consumption/maintenance planning.'},
  sap:{label:'SAP',description:'SAP material, stock, PR/PO fields, hierarchy and future SAP MCP integration.'}
};

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
  const departmentCode=safeText(extra.department_code||context.department_code,80);
  const equipment=safeText(extra.equipment||context.equipment,120);
  const subEquipment=safeText(extra.sub_equipment||context.sub_equipment,120);
  const discipline=safeText(extra.discipline||context.discipline,80);
  if(departmentCode){p.push(departmentCode);w.push(`l.department_code=$${p.length}`)}
  if(equipment){p.push(equipment);w.push(`(l.equipment_name=$${p.length} OR l.area_name=$${p.length})`)}
  if(subEquipment){p.push(subEquipment);w.push(`l.sub_equipment_name=$${p.length}`)}
  if(discipline){p.push(discipline);w.push(`u.discipline=$${p.length}`)}
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

const sapGlossary={
  material:'SAP Material Number / Material Code used to identify the material master record.',
  'material no':'SAP Material Number / Material Code used to identify the material master record.',
  unrestricted:'Unrestricted-use stock currently available for normal issue/use.',
  'purchase requisition':'PR document/request for procurement before a purchase order is created.',
  'purchase req':'PR document/request for procurement before a purchase order is created.',
  'open pr':'PR quantity still not converted/closed depending on the source report definition.',
  'open po':'PO quantity still open / not fully delivered depending on the source report definition.',
  'still to be delivered':'Open PO quantity still expected from the supplier.',
  'order quantity':'Requested/order quantity in the source report; confirm report context before treating it as open PR.',
  'name of supplier':'Supplier/Vendor name.',
  'purchasing document':'Purchase Order document number in typical purchasing reports.',
  'purchase requisition no':'Purchase Requisition document number.',
  plant:'SAP Plant organizational code.',
  'base unit of measure':'Material master base UOM.',
  'last issue date':'Most recent recorded goods issue date for the material in the report context.'
};

const tools=[
  {type:'function',function:{name:'get_material_profile',description:'Get the authoritative current profile for one spare by Material Code, including requirement, store, PR, PO, gap, locations and spare character.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'find_pr_eligible_spares',description:'Find spares whose current stock plus open PR plus open PO does not cover the recorded required quantity.',parameters:{type:'object',properties:{equipment:{type:'string'},sub_equipment:{type:'string'},discipline:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'find_zero_stock_spares',description:'Find zero-stock spares, optionally only those without an open PO.',parameters:{type:'object',properties:{without_po:{type:'boolean'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false}}},
  {type:'function',function:{name:'search_spares',description:'Search spare master data by material code fragment, spare name, description, part number or vendor.',parameters:{type:'object',properties:{search:{type:'string'},equipment:{type:'string'},sub_equipment:{type:'string'},limit:{type:'integer',minimum:1,maximum:50}},required:['search'],additionalProperties:false}}},
  {type:'function',function:{name:'get_procurement_justification_facts',description:'Get authoritative facts needed to draft a procurement justification for one material. This tool does not invent consumption, lead time or failure history.',parameters:{type:'object',properties:{material_code:{type:'string'}},required:['material_code'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_three_phase_motor_current',description:'Estimate three-phase motor line current from kW, voltage, power factor and efficiency. Result is an engineering estimate, not a protection/device selection approval.',parameters:{type:'object',properties:{power_kw:{type:'number',exclusiveMinimum:0},voltage_v:{type:'number',exclusiveMinimum:0},power_factor:{type:'number',exclusiveMinimum:0,maximum:1},efficiency:{type:'number',exclusiveMinimum:0,maximum:1}},required:['power_kw','voltage_v','power_factor','efficiency'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_synchronous_speed',description:'Calculate AC motor synchronous speed from frequency and pole count.',parameters:{type:'object',properties:{frequency_hz:{type:'number',exclusiveMinimum:0},poles:{type:'integer',minimum:2,maximum:24}},required:['frequency_hz','poles'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_shaft_surface_speed',description:'Calculate shaft/cylindrical surface speed from diameter and RPM.',parameters:{type:'object',properties:{diameter_mm:{type:'number',exclusiveMinimum:0},rpm:{type:'number',minimum:0}},required:['diameter_mm','rpm'],additionalProperties:false}}},
  {type:'function',function:{name:'calculate_bearing_l10_life',description:'Estimate basic bearing L10 life using dynamic load rating C, equivalent dynamic load P and RPM. Uses exponent 3 for ball bearings and 10/3 for roller bearings.',parameters:{type:'object',properties:{dynamic_capacity_kn:{type:'number',exclusiveMinimum:0},equivalent_load_kn:{type:'number',exclusiveMinimum:0},rpm:{type:'number',exclusiveMinimum:0},bearing_type:{type:'string',enum:['ball','roller']}},required:['dynamic_capacity_kn','equivalent_load_kn','rpm','bearing_type'],additionalProperties:false}}},
  {type:'function',function:{name:'sap_field_help',description:'Explain common SAP material, stock, PR and PO report fields used by spare planners.',parameters:{type:'object',properties:{field_name:{type:'string'}},required:['field_name'],additionalProperties:false}}}
];

async function runTool(name,args,context){
  if(name==='get_material_profile')return {rows:await materialRows(context,{material_code:args.material_code,limit:5})};
  if(name==='find_pr_eligible_spares')return {rows:await materialRows(context,{...args,pr_eligible:true,limit:args.limit||20})};
  if(name==='find_zero_stock_spares')return {rows:await materialRows(context,{...args,zero_stock:true,no_po:Boolean(args.without_po),limit:args.limit||20})};
  if(name==='search_spares')return {rows:await materialRows(context,{...args,search:args.search,limit:args.limit||20})};
  if(name==='get_procurement_justification_facts'){
    const rows=await materialRows(context,{material_code:args.material_code,limit:5});
    return {rows,missing_evidence:['consumption history','lead time','unit price','failure history']};
  }
  if(name==='calculate_three_phase_motor_current'){
    const kw=num(args.power_kw),v=num(args.voltage_v),pf=num(args.power_factor),eff=num(args.efficiency);
    if(!(kw>0&&v>0&&pf>0&&pf<=1&&eff>0&&eff<=1))return {error:'Invalid motor inputs'};
    return {line_current_a:kw*1000/(Math.sqrt(3)*v*pf*eff),formula:'I = P/(sqrt(3) × V × PF × efficiency)',note:'Estimate only; verify nameplate current and applicable protection/cable standards before design use.'};
  }
  if(name==='calculate_synchronous_speed'){
    const f=num(args.frequency_hz),p=num(args.poles);if(!(f>0&&p>=2))return {error:'Invalid frequency or pole count'};
    return {synchronous_speed_rpm:120*f/p,formula:'Ns = 120f/p',note:'Actual induction motor running speed is lower because of slip.'};
  }
  if(name==='calculate_shaft_surface_speed'){
    const d=num(args.diameter_mm),rpm=num(args.rpm);if(!(d>0&&rpm>=0))return {error:'Invalid diameter or RPM'};
    return {surface_speed_m_s:Math.PI*(d/1000)*rpm/60,formula:'v = pi × D × RPM / 60'};
  }
  if(name==='calculate_bearing_l10_life'){
    const C=num(args.dynamic_capacity_kn),P=num(args.equivalent_load_kn),rpm=num(args.rpm),power=args.bearing_type==='roller'?10/3:3;
    if(!(C>0&&P>0&&rpm>0))return {error:'Invalid bearing inputs'};
    const revolutions_million=Math.pow(C/P,power),hours=revolutions_million*1e6/(60*rpm);
    return {l10_million_revolutions:revolutions_million,l10_hours:hours,exponent:power,note:'Basic rating life estimate only. Actual life depends on lubrication, contamination, alignment, temperature, load spectrum and mounting.'};
  }
  if(name==='sap_field_help'){
    const raw=safeText(args.field_name,120).toLowerCase();
    const key=Object.keys(sapGlossary).find(k=>raw===k||raw.includes(k));
    return {field:args.field_name,meaning:key?sapGlossary[key]:'No exact local glossary entry. Ask SAP report owner to confirm this field definition before using it in calculations.'};
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
  res.json({configured:c.configured,provider:c.provider,model:c.configured?c.model:null,agents:agentModes,integrations:{openRouter:c.provider==='OpenRouter'&&c.configured,internalTools:true,sapMcp:false,sapMcpNote:'Ready to connect when company SAP Integration Suite/MCP endpoint and authorization are available.'},capabilities:{databaseGrounding:true,toolCalling:c.configured,plannerRules:true,conversationContext:true,engineeringCalculators:true,vision:false,web:false}});
});

r.post('/spare-assistant/ask',auth,async(req,res)=>{
  const question=safeText(req.body?.question,3000);
  const mode=agentModes[req.body?.mode]?req.body.mode:'planner';
  const context=req.body?.context&&typeof req.body.context==='object'?req.body.context:{};
  context.department_code=safeText(req.body?.department_code||context.department_code,80);
  context.agent_mode=mode;
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:safeText(x.text,1800)})):[];
  if(!question)return res.status(400).json({error:'Ask a spare-related question'});
  const cfg=providerConfig();
  const code=codeFrom(question);
  const fallbackRows=await materialRows(context,code?{material_code:code,limit:5}:{search:question.split(/\s+/).filter(x=>x.length>3).slice(0,4).join(' '),limit:8});
  const fallback=fallbackAnswer(fallbackRows,context);
  if(!cfg.configured)return res.json({aiEnabled:false,engine:cfg.provider,answer:fallback,materials:fallbackRows.slice(0,12),note:'OpenRouter/API key is not configured yet; using deterministic spare-data tools.'});

  const modeInstructions={
    planner:'Prioritize stock coverage, PR/PO gaps, procurement justification and planner actions. Use material tools before making plant-specific claims.',
    mechanical:'Act as a cautious mechanical maintenance engineer. Help interpret spare descriptions, bearings, shafts, seals, pumps, gearboxes and mechanical nameplate/spec data. Use engineering calculator tools where applicable. Never infer a missing dimension, material grade, tolerance, fit, load rating or OEM specification.',
    electrical:'Act as a cautious electrical maintenance engineer. Help with motors, drives, electrical spares, ratings and nameplate interpretation. Use electrical calculator tools where applicable. Never infer missing voltage, current, protection, cable size, fault level or safety category.',
    reliability:'Act as a maintenance reliability planner. Focus on criticality, recurring shortage signals, repair-vs-replace evidence, failure context and planning gaps. Do not call import/update counts consumption or failure frequency.',
    sap:'Act as an SAP-aware spare planner. Explain SAP material/stock/PR/PO terminology and dashboard mappings. Use sap_field_help when needed. Do not claim direct SAP access; SAP MCP is not connected yet.'
  };
  const system=`You are Spare Copilot in ${agentModes[mode].label} mode. ${modeInstructions[mode]} The application database and deterministic engineering calculations are authoritative. You MUST use provided tools whenever the user asks about plant spare facts or a calculation that a tool covers. Never invent SAP values, technical specifications, nameplate values, consumption, failure history, lead time, prices or vendor performance. Clearly label estimates/calculations and missing evidence. Never modify data. Current UI context: ${JSON.stringify(context)}.`;
  const messages=[{role:'system',content:system},...history,{role:'user',content:question}];
  const usedTools=[];
  try{
    for(let step=0;step<5;step++){
      const body=await callModel(cfg,messages,true);
      const msg=body?.choices?.[0]?.message;
      if(!msg)throw new Error('AI returned no message');
      messages.push(msg);
      const calls=Array.isArray(msg.tool_calls)?msg.tool_calls:[];
      if(!calls.length){
        const answer=safeText(msg.content,12000)||fallback;
        return res.json({aiEnabled:true,engine:cfg.provider,model:cfg.model,mode,answer,materials:fallbackRows.slice(0,12),toolsUsed:usedTools});
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
    res.json({aiEnabled:true,engine:cfg.provider,model:cfg.model,mode,answer,materials:fallbackRows.slice(0,12),toolsUsed:usedTools});
  }catch(e){
    res.json({aiEnabled:false,engine:'Rule Engine',mode,answer:fallback,materials:fallbackRows.slice(0,12),note:`AI unavailable: ${e.message}. Fell back to deterministic spare-data tools.`});
  }
});

export default r;
