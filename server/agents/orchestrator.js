import {agentModes,normalizeMode} from './modes.js';
import {toolDefinitions,executeTool} from './toolRegistry.js';
import {providerConfig,callChatModel} from '../ai/provider.js';
import {materialRows,codeFrom,safeText,fallbackAnswer} from '../services/materialQuery.js';
import {getConsumptionStudy} from '../services/consumption.js';

function buildSystem(mode,context){
  return `You are Spare Copilot in ${agentModes[mode].label} mode. ${agentModes[mode].instructions}

You are an equipment-aware maintenance-planning assistant, not a generic chatbot. The application database, equipment knowledge graph, uploaded engineering evidence and deterministic calculations are authoritative.

Planner behavior:
- When the user asks about an equipment/sub-equipment, call get_equipment_knowledge first. Teach what the planner should understand, then relate it to current spares, critical gaps and available documents.
- When the user asks which Material Code belongs to a spare/component, call find_material_code and/or search_spares. Never invent a Material Code. Explain why the best candidate matches and state uncertainty when evidence is weak.
- When a Material Code is supplied, call get_material_profile before discussing Store/Open PR/Open PO/requirement. For consumption, usage, issue trend, weekly/monthly history, run rate or FY demand, always call get_material_consumption. Use get_material_history and get_procurement_history for other dated history questions.
- For drawings/manuals/OEM claims, call search_knowledge before making the claim.
- For SAP planning questions, call sap_planner_guide or sap_field_help. SAP transaction guidance is procedural guidance only; never imply you checked live SAP unless a live connector actually exists.
- Separate inventory/procurement snapshots from true consumption/issue history. Only SAP movements 201/261/551 minus reversals 202/262 are confirmed consumption. If true issue history is missing, say so clearly. Report period, date range, quantities, trend and confidence.
- Prefer concise planner education: what it is, why it matters, what to check, linked Material Codes/evidence, and the next planning action.

Never invent SAP values, technical specifications, nameplate values, consumption, failure history, lead time, prices or vendor performance. Distinguish facts, calculations, assessment and missing evidence. Never modify data. Current UI context: ${JSON.stringify(context)}.`;
}

function consumptionAnswer(study){
  if(!study?.found)return 'This Material Code is not present in the active material master.';
  const s=study.summary||{},m=study.material||{};
  if(!study.series?.length)return `${m.material_code} · ${m.spare_name||m.description||'Unnamed spare'}\nNo confirmed SAP goods-issue consumption history is available. Upload MB51 movement data containing 201/261/551 issues and 202/262 reversals. Current Store: ${study.inventory?.store_qty??'—'}; Open PR: ${study.inventory?.open_pr_qty??'—'}; Open PO: ${study.inventory?.open_po_qty??'—'}. Inventory snapshots are not treated as consumption.`;
  const unit=m.uom||'units';
  const periods=study.series.slice(-12).map(x=>`${String(x.period).slice(0,10)}: ${Number(x.confirmed_consumption||0)} ${unit}`).join('\n');
  return `${m.material_code} · ${m.spare_name||m.description||'Unnamed spare'}\nConfirmed ${study.period} consumption over ${s.first_period} to ${s.last_period}: ${Number(s.total_consumption||0)} ${unit}.\nAverage per ${study.period}: ${Number(s.average_per_period||0).toFixed(2)} ${unit}; annualized run rate: ${Number(s.annualized_run_rate||0).toFixed(2)} ${unit}; trend: ${s.trend}; confidence: ${s.confidence}.\nCurrent Store: ${study.inventory?.store_qty??'—'}; Open PR: ${study.inventory?.open_pr_qty??'—'}; Open PO: ${study.inventory?.open_po_qty??'—'}.\n\nRecent periods:\n${periods}\n\nSource: confirmed SAP goods movements only. Stock snapshots are excluded.`;
}

export function getAgentStatus(){
  const c=providerConfig();
  return {
    configured:c.configured,provider:c.provider,model:c.configured?c.model:null,agents:agentModes,
    integrations:{openRouter:c.provider==='OpenRouter'&&c.configured,internalTools:true,knowledgeRag:true,equipmentKnowledge:true,rawObjectStorage:false,sapMcp:false,sapMcpNote:'SAP MCP remains optional; Excel exports and planner guidance are supported as the current source.'},
    capabilities:{databaseGrounding:true,toolCalling:c.configured,plannerRules:true,conversationContext:true,engineeringCalculators:true,history:true,knowledgeRag:true,equipmentKnowledge:true,sapGuidance:true,vision:false,web:false}
  };
}

export async function askSpareAgent({question,mode='planner',context={},history=[]}){
  const selectedMode=normalizeMode(mode),cfg=providerConfig();
  const cleanQuestion=safeText(question,3000);
  if(!cleanQuestion)throw Object.assign(new Error('Ask a spare-related question'),{status:400});
  const code=codeFrom(cleanQuestion);
  const consumptionIntent=/consum|goods issue|movement|usage history|used per|monthly use|weekly use|run rate|annual demand/i.test(cleanQuestion);
  const consumption=code&&consumptionIntent?await getConsumptionStudy(code,{period:/week/i.test(cleanQuestion)?'week':'month',months:24}):null;
  const fallbackRows=await materialRows(context,code?{material_code:code,limit:5}:{search:cleanQuestion.split(/\s+/).filter(x=>x.length>3).slice(0,4).join(' '),limit:8});
  const fallback=fallbackAnswer(fallbackRows,context);
  if(!cfg.configured)return {aiEnabled:false,engine:cfg.provider,mode:selectedMode,answer:consumption?consumptionAnswer(consumption):fallback,materials:fallbackRows.slice(0,12),consumption,note:consumption?'Calculated from confirmed SAP movement history.':'AI provider is not configured; using deterministic spare-data tools.'};

  const messages=[{role:'system',content:buildSystem(selectedMode,context)},...history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:safeText(x.text||x.content,1800)})),{role:'user',content:cleanQuestion}];
  const usedTools=[];
  try{
    for(let step=0;step<5;step++){
      const body=await callChatModel(cfg,messages,{tools:toolDefinitions,withTools:true});
      const msg=body?.choices?.[0]?.message;
      if(!msg)throw new Error('AI returned no message');
      messages.push(msg);
      const calls=Array.isArray(msg.tool_calls)?msg.tool_calls:[];
      if(!calls.length){
        return {aiEnabled:true,engine:cfg.provider,model:cfg.model,mode:selectedMode,answer:safeText(msg.content,12000)||fallback,materials:fallbackRows.slice(0,12),toolsUsed:usedTools};
      }
      for(const call of calls){
        const name=call?.function?.name||'';
        let args={};try{args=JSON.parse(call?.function?.arguments||'{}')}catch{}
        const result=await executeTool(name,args,context);
        usedTools.push(name);
        messages.push({role:'tool',tool_call_id:call.id,name,content:JSON.stringify(result).slice(0,30000)});
      }
    }
    const body=await callChatModel(cfg,messages,{withTools:false});
    return {aiEnabled:true,engine:cfg.provider,model:cfg.model,mode:selectedMode,answer:safeText(body?.choices?.[0]?.message?.content,12000)||fallback,materials:fallbackRows.slice(0,12),toolsUsed:usedTools};
  }catch(e){
    return {aiEnabled:false,engine:'Rule Engine',mode:selectedMode,answer:fallback,materials:fallbackRows.slice(0,12),note:`AI unavailable: ${e.message}. Fell back to deterministic spare-data tools.`};
  }
}
