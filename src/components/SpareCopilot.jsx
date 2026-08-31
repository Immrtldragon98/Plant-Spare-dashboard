import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';
import './SpareCopilot.css';

const agents=[
  {id:'planner',label:'Planner',hint:'Stock · PR/PO · FY plan',starter:['Which materials are PR eligible?','Show zero-stock spares without PO','Draft procurement justification for the highest risk spare']},
  {id:'mechanical',label:'Mechanical',hint:'Bearings · shafts · pumps',starter:['Explain this mechanical spare from its description','Calculate bearing L10 life','What data do I need to identify this spare correctly?']},
  {id:'electrical',label:'Electrical',hint:'Motors · drives · ratings',starter:['Estimate three-phase motor current','Calculate synchronous motor speed','What nameplate data should I capture for this motor?']},
  {id:'reliability',label:'Reliability',hint:'Criticality · repair · trends',starter:['Which spares deserve planner review first?','What evidence is missing for a repair-vs-replace decision?','Explain the spare character of this material']},
  {id:'sap',label:'SAP',hint:'Material · stock · PR/PO',starter:['What does Unrestricted mean in our SAP stock file?','Explain Open PR vs Open PO','How should this SAP field map into the dashboard?']}
];

export default function SpareCopilot({departmentCode,tab,filters,setNotice}){
  const[open,setOpen]=useState(false),[mode,setMode]=useState('planner'),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState([]),[status,setStatus]=useState({provider:'Rule Engine',configured:false,capabilities:{},integrations:{},agents:{}});
  const context=useMemo(()=>({page:tab||'Dashboard',department_code:departmentCode||'',equipment:filters?.equipment||'',sub_equipment:filters?.sub_equipment||'',discipline:filters?.discipline||'',vendor:filters?.vendor||'',procurement_type:filters?.procurement_type||''}),[tab,departmentCode,JSON.stringify(filters||{})]);
  const scope=[context.equipment,context.sub_equipment,context.discipline].filter(Boolean).join(' · ')||'All CH2 spares';
  const active=agents.find(a=>a.id===mode)||agents[0];
  useEffect(()=>{if(open)request('/spare-assistant/status').then(setStatus).catch(()=>{})},[open]);
  const ask=async(text=question)=>{
    const q=String(text||'').trim();if(!q||busy)return;
    setOpen(true);setQuestion('');const before=messages;setMessages(m=>[...m,{role:'user',text:q,mode}]);setBusy(true);
    try{
      const x=await request('/spare-assistant/ask',{method:'POST',body:JSON.stringify({question:q,mode,department_code:departmentCode||'',context,history:before.slice(-10)})});
      setMessages(m=>[...m,{role:'assistant',text:x.answer||'No answer returned.',note:x.note||'',aiEnabled:x.aiEnabled,engine:x.engine||status.provider,model:x.model||null,mode:x.mode||mode,toolsUsed:x.toolsUsed||[]}]);
    }catch(e){setNotice?.(e.message);setMessages(m=>[...m,{role:'assistant',text:'I could not complete that query.',note:e.message,aiEnabled:false,engine:'Rule Engine',mode}])}
    finally{setBusy(false)}
  };
  const clear=()=>setMessages([]);
  return <>
    {open&&<aside className="spareCopilotPanel" aria-label="AI Spare Assistant">
      <div className="spareCopilotHead">
        <div><strong>Spare Copilot</strong><small>{status.configured?`${status.provider}${status.model?` · ${status.model}`:''}`:'Rule Engine · no external model'}</small></div>
        <div><button className="ghost" onClick={clear} title="Clear conversation">↺</button><button className="ghost" onClick={()=>setOpen(false)}>✕</button></div>
      </div>

      <div className="spareCopilotMeta">
        <div className="spareCopilotScope"><span>{tab||'Dashboard'}</span><strong>{scope}</strong></div>
        <div className="spareCopilotIntegrations">
          <span className={status.integrations?.openRouter?'ok':'wait'}>OpenRouter {status.integrations?.openRouter?'connected':'waiting'}</span>
          <span className="ok">Internal tools active</span>
          <span className={status.integrations?.sapMcp?'ok':'wait'}>SAP MCP {status.integrations?.sapMcp?'connected':'waiting for access'}</span>
        </div>
      </div>

      <div className="spareCopilotAgents">{agents.map(a=><button key={a.id} className={mode===a.id?'active':''} onClick={()=>setMode(a.id)}><strong>{a.label}</strong><small>{a.hint}</small></button>)}</div>

      <div className="spareCopilotWorkspace">
        {!messages.length&&<div className="spareCopilotWelcome"><strong>{active.label} Agent</strong><span>{status.agents?.[mode]?.description||active.hint}</span><div className="spareCopilotStarters">{active.starter.map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div></div>}
        {messages.map((m,i)=><div key={i} className={`spareCopilotMessage ${m.role}`}><div>{String(m.text||'').split('\n').map((line,j)=><p key={j}>{line}</p>)}</div>{m.role==='assistant'&&<small>{m.aiEnabled?`${m.engine||'AI'}${m.model?` · ${m.model}`:''}`:'Rule fallback'}{m.toolsUsed?.length?` · tools: ${[...new Set(m.toolsUsed)].join(', ')}`:''}{m.note?` · ${m.note}`:''}</small>}</div>)}
        {busy&&<div className="spareCopilotMessage assistant"><div>{active.label} agent is working…</div></div>}
      </div>

      <form className="spareCopilotComposer" onSubmit={e=>{e.preventDefault();ask()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder={`Ask ${active.label.toLowerCase()} agent…`}/><button disabled={busy||!question.trim()}>Send</button></form>
    </aside>}
    <button className="spareCopilotLauncher" onClick={()=>setOpen(v=>!v)} aria-label="Open Spare Copilot"><span>✦</span><span>Spare Copilot</span></button>
  </>;
}
