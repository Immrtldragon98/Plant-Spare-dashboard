import {agentModes,normalizeMode} from './modes.js';
import {toolDefinitions,executeTool} from './toolRegistry.js';
import {providerConfig,callChatModel} from '../ai/provider.js';
import {materialRows,codeFrom,safeText,fallbackAnswer} from '../services/materialQuery.js';

function buildSystem(mode,context){
  return `You are Spare Copilot in ${agentModes[mode].label} mode. ${agentModes[mode].instructions} The application database, uploaded engineering evidence and deterministic calculations are authoritative. Use provided tools whenever the user asks about plant-specific facts, document-specific/OEM-specific claims, historical changes or a calculation that a tool covers. Never invent SAP values, technical specifications, nameplate values, consumption, failure history, lead time, prices or vendor performance. Distinguish facts, calculations, assessment and missing evidence. Never modify data. Current UI context: ${JSON.stringify(context)}.`;
}

export function getAgentStatus(){
  const c=providerConfig();
  return {
    configured:c.configured,provider:c.provider,model:c.configured?c.model:null,agents:agentModes,
    integrations:{openRouter:c.provider==='OpenRouter'&&c.configured,internalTools:true,knowledgeRag:true,rawObjectStorage:false,sapMcp:false,sapMcpNote:'SAP MCP remains optional; Excel exports are supported as the current source.'},
    capabilities:{databaseGrounding:true,toolCalling:c.configured,plannerRules:true,conversationContext:true,engineeringCalculators:true,history:true,knowledgeRag:true,vision:false,web:false}
  };
}

export async function askSpareAgent({question,mode='planner',context={},history=[]}){
  const selectedMode=normalizeMode(mode),cfg=providerConfig();
  const cleanQuestion=safeText(question,3000);
  if(!cleanQuestion)throw Object.assign(new Error('Ask a spare-related question'),{status:400});
  const code=codeFrom(cleanQuestion);
  const fallbackRows=await materialRows(context,code?{material_code:code,limit:5}:{search:cleanQuestion.split(/\s+/).filter(x=>x.length>3).slice(0,4).join(' '),limit:8});
  const fallback=fallbackAnswer(fallbackRows,context);
  if(!cfg.configured)return {aiEnabled:false,engine:cfg.provider,mode:selectedMode,answer:fallback,materials:fallbackRows.slice(0,12),note:'AI provider is not configured; using deterministic spare-data tools.'};

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
