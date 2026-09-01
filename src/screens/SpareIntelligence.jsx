import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';

const Kpi=({n,t,sub})=><div className="intelKpi"><span>{t}</span><strong>{n??0}</strong>{sub&&<small>{sub}</small>}</div>;

export default function SpareIntelligence({filters,setNotice}){
  const[status,setStatus]=useState('pr_eligible'),[search,setSearch]=useState(''),[data,setData]=useState({rows:[],summary:{}}),[busy,setBusy]=useState(false),[reviews,setReviews]=useState([]),[aiNote,setAiNote]=useState('');
  const qs=useMemo(()=>new URLSearchParams({department_code:filters.department_code||'',area:filters.area||'',discipline:filters.discipline||'',status,search}),[filters.department_code,filters.area,filters.discipline,status,search]);
  useEffect(()=>{if(!filters.department_code)return;request('/spare-intelligence?'+qs).then(x=>{setData(x);setReviews([]);setAiNote('')}).catch(e=>setNotice(e.message))},[String(qs)]);
  const review=async()=>{const items=(data.rows||[]).slice(0,25);if(!items.length)return;setBusy(true);try{const x=await request('/spare-intelligence/review',{method:'POST',body:JSON.stringify({items})});setReviews(x.reviews||[]);setAiNote(x.note||(x.aiEnabled?'AI review complete':'Rule-based review complete'))}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const reviewMap=new Map((reviews||[]).map(x=>[x.material_code,x]));
  return <>
    <div className="pageTitle"><div><span className="eyebrow">PLANNING INTELLIGENCE</span><h1>Spare Intelligence</h1><p>See shortages, procurement coverage and the materials that need planner attention first.</p></div><button disabled={busy||!data.rows?.length} onClick={review}>{busy?'Reviewing…':'AI Review Top 25'}</button></div>

    <div className="intelKpis"><Kpi n={data.summary?.total} t="Screened"/><Kpi n={data.summary?.critical} t="Critical"/><Kpi n={data.summary?.pr_eligible} t="PR Eligible"/><Kpi n={data.summary?.covered} t="Covered"/><Kpi n={data.summary?.history_ready} t="With History"/></div>

    <div className="intelToolbar"><div className="segmented">{[['all','All'],['critical','Critical'],['pr_eligible','PR Eligible'],['covered','Covered']].map(([k,l])=><button key={k} className={status===k?'active':''} onClick={()=>setStatus(k)}>{l}</button>)}</div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search material code, spare or vendor…"/><span>{filters.equipment||'All equipment'}{filters.discipline?` · ${filters.discipline}`:''}</span></div>

    {aiNote&&<div className="intelAiNote"><strong>AI review</strong><span>{aiNote}</span></div>}

    <div className="tableWrap intelligenceTable"><table><thead><tr><th>Material</th><th>Required</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Gap</th><th>Risk</th><th>Action</th><th>Planner note</th></tr></thead><tbody>{(data.rows||[]).map(x=>{const r=reviewMap.get(x.material_code);return <tr key={x.material_code}><td><strong className="code">{x.material_code}</strong><span className="tableTitle">{x.spare_name||x.description||'Unnamed spare'}</span>{x.locations&&<small>{x.locations}</small>}</td><td>{x.required_qty??0}</td><td>{x.store_qty??0}</td><td>{x.pr_qty??0}</td><td>{x.po_qty??0}</td><td><strong>{x.ideal_pr_qty??0}</strong><small>Pipeline {x.pipeline_qty??0}</small></td><td><span className={Number(x.risk_score)>=80?'riskBadge highRisk':Number(x.risk_score)>=50?'riskBadge mediumRisk':'riskBadge'}>{x.risk_score}</span></td><td>{x.pr_eligible?<span className="statusPill dangerPill">PR Eligible</span>:x.critical?<span className="statusPill warnPill">Critical</span>:<span className="statusPill okPill">Covered</span>}</td><td>{r?<><strong>{r.classification}</strong><small>{r.reason}</small></>:<span>{x.rule_explanation}</span>}</td></tr>})}</tbody></table></div>
    <p className="muted intelFootnote">History means recorded import/change events, not true SAP consumption. Consumption remains a separate planning signal.</p>
  </>;
}
