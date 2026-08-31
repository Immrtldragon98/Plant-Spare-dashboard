import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';
import './SpareCopilot.css';

const quick=[
  'Show zero-stock spares without PO',
  'Which materials are PR eligible?',
  'Draft procurement justification for the highest risk spare'
];

export default function SpareCopilot({departmentCode,tab,filters,setNotice}){
  const[open,setOpen]=useState(false),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState([]),[status,setStatus]=useState({provider:'Rule Engine',configured:false,capabilities:{}});
  const context=useMemo(()=>({page:tab||'Dashboard',department_code:departmentCode||'',equipment:filters?.equipment||'',sub_equipment:filters?.sub_equipment||'',discipline:filters?.discipline||'',vendor:filters?.vendor||'',procurement_type:filters?.procurement_type||''}),[tab,departmentCode,JSON.stringify(filters||{})]);
  const scope=[context.equipment,context.sub_equipment,context.discipline].filter(Boolean).join(' · ')||'All CH2 spares';
  useEffect(()=>{if(open)request('/spare-assistant/status').then(setStatus).catch(()=>{})},[open]);
  const ask=async(text=question)=>{
    const q=String(text||'').trim();if(!q||busy)return;
    setOpen(true);setQuestion('');const before=messages;setMessages(m=>[...m,{role:'user',text:q}]);setBusy(true);
    try{
      const x=await request('/spare-assistant/ask',{method:'POST',body:JSON.stringify({question:q,department_code:departmentCode||'',context,history:before.slice(-8)})});
      setMessages(m=>[...m,{role:'assistant',text:x.answer||'No answer returned.',note:x.note||'',aiEnabled:x.aiEnabled,engine:x.engine||status.provider,model:x.model||null}]);
    }catch(e){setNotice?.(e.message);setMessages(m=>[...m,{role:'assistant',text:'I could not complete that spare-data query.',note:e.message,aiEnabled:false,engine:'Rule Engine'}])}
    finally{setBusy(false)}
  };
  const clear=()=>setMessages([]);
  return <>
    {open&&<aside className="spareCopilotPanel" aria-label="AI Spare Assistant">
      <div className="spareCopilotHead"><div><strong>AI Spare Assistant</strong><small>{status.configured?`${status.provider}${status.model?` · ${status.model}`:''}`:'Rule Engine · no external model'}</small></div><div><button className="ghost" onClick={clear} title="Clear conversation">↺</button><button className="ghost" onClick={()=>setOpen(false)}>✕</button></div></div>
      <div className="spareCopilotScope"><span>{tab||'Dashboard'}</span><strong>{scope}</strong></div>
      <div className="spareCopilotQuick">{quick.map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div>
      <div className="spareCopilotMessages">
        {!messages.length&&<div className="spareCopilotEmpty"><strong>Planner copilot</strong><span>Ask about Material Code, stock coverage, PR/PO gaps, spare character or procurement justification. Current page/filter context is applied automatically.</span></div>}
        {messages.map((m,i)=><div key={i} className={`spareCopilotMessage ${m.role}`}><div>{String(m.text||'').split('\n').map((line,j)=><p key={j}>{line}</p>)}</div>{m.role==='assistant'&&<small>{m.aiEnabled?`${m.engine||'AI'}${m.model?` · ${m.model}`:''} · grounded answer`:'Rule Engine · grounded answer'}{m.note?` · ${m.note}`:''}</small>}</div>)}
        {busy&&<div className="spareCopilotMessage assistant"><div>Checking the current spare data…</div></div>}
      </div>
      <form className="spareCopilotComposer" onSubmit={e=>{e.preventDefault();ask()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about a Material Code or spare…"/><button disabled={busy||!question.trim()}>Send</button></form>
    </aside>}
    <button className="spareCopilotLauncher" onClick={()=>setOpen(v=>!v)} aria-label="Open AI Spare Assistant"><span>✦</span><span>Spare Assistant</span></button>
  </>;
}
