import React,{useState} from 'react';
import {request} from '../api/client.js';

const quick=[
  'Show zero-stock spares without PO',
  'Which materials are PR eligible?',
  'Draft procurement justification for the highest risk spare'
];

export default function SpareCopilot({departmentCode,setNotice}){
  const[open,setOpen]=useState(false),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState([]);
  const ask=async(text=question)=>{
    const q=String(text||'').trim();if(!q||busy)return;
    setOpen(true);setQuestion('');setMessages(m=>[...m,{role:'user',text:q}]);setBusy(true);
    try{
      const x=await request('/spare-assistant/ask',{method:'POST',body:JSON.stringify({question:q,department_code:departmentCode||''})});
      setMessages(m=>[...m,{role:'assistant',text:x.answer||'No answer returned.',note:x.note||'',aiEnabled:x.aiEnabled}]);
    }catch(e){setNotice?.(e.message);setMessages(m=>[...m,{role:'assistant',text:'I could not complete that spare-data query.',note:e.message,aiEnabled:false}])}
    finally{setBusy(false)}
  };
  return <>
    {open&&<aside className="spareCopilotPanel" aria-label="AI Spare Assistant">
      <div className="spareCopilotHead"><div><strong>AI Spare Assistant</strong><small>Planner copilot · grounded in spare data</small></div><button className="ghost" onClick={()=>setOpen(false)}>✕</button></div>
      <div className="spareCopilotQuick">{quick.map(x=><button key={x} onClick={()=>ask(x)}>{x}</button>)}</div>
      <div className="spareCopilotMessages">
        {!messages.length&&<div className="spareCopilotEmpty"><strong>Ask about your spares</strong><span>Material character, stock coverage, PR/PO gaps, criticality and procurement justification.</span></div>}
        {messages.map((m,i)=><div key={i} className={`spareCopilotMessage ${m.role}`}><div>{String(m.text||'').split('\n').map((line,j)=><p key={j}>{line}</p>)}</div>{m.role==='assistant'&&<small>{m.aiEnabled?'AI answer · grounded in dashboard data':'Rule-based answer'}{m.note?` · ${m.note}`:''}</small>}</div>)}
        {busy&&<div className="spareCopilotMessage assistant"><div>Checking spare data…</div></div>}
      </div>
      <form className="spareCopilotComposer" onSubmit={e=>{e.preventDefault();ask()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about a Material Code or spare…"/><button disabled={busy||!question.trim()}>Send</button></form>
    </aside>}
    <button className="spareCopilotLauncher" onClick={()=>setOpen(v=>!v)} aria-label="Open AI Spare Assistant"><span>✦</span><span>Spare Assistant</span></button>
  </>;
}
