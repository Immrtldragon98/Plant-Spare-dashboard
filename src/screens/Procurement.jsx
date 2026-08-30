import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';

export default function Procurement({filters,setFilters,setNotice}){
  const[type,setType]=useState(filters.procurement_type||'eligible'),[rows,setRows]=useState([]),[search,setSearch]=useState(''),[screening,setScreening]=useState([]),[screenBusy,setScreenBusy]=useState(false),[screenSource,setScreenSource]=useState('');
  useEffect(()=>{if(filters.procurement_type&&filters.procurement_type!==type)setType(filters.procurement_type)},[filters.procurement_type]);
  const chooseType=t=>{setType(t);setScreening([]);setScreenSource('');setFilters?.(f=>({...f,procurement_type:t}))};
  const liveType=['eligible','critical','pr','po'].includes(type);
  useEffect(()=>{
    if(!liveType){setRows([]);return;}
    const qs=new URLSearchParams({department_code:filters.department_code||'',area:filters.area||'',type,search});
    request('/procurement?'+qs).then(setRows).catch(e=>setNotice(e.message));
  },[filters.department_code,filters.area,type,search]);
  const rankMap=useMemo(()=>new Map(screening.map(x=>[x.material_code,x])),[screening]);
  const aiScreen=async()=>{setScreenBusy(true);try{const x=await request('/procurement/pr-eligible/screen',{method:'POST',body:JSON.stringify({department_code:filters.department_code||'',area:filters.area||'',search})});setScreening(x.screening||[]);setScreenSource(x.source||'');setNotice(x.message)}catch(e){setNotice(e.message)}finally{setScreenBusy(false)}};
  const criticalView=type==='eligible'||type==='critical';
  return <>
    <div className="pageTitle"><div><h1>Procurement</h1><p>Critical spares, PR eligibility, PR, PO, RGP and NRGP under one workflow.</p></div></div>
    <div className="subTabs">
      <button className={type==='eligible'?'subTab active':'subTab'} onClick={()=>chooseType('eligible')}>PR Eligible</button>
      <button className={type==='critical'?'subTab active':'subTab'} onClick={()=>chooseType('critical')}>Critical Spares</button>
      <button className={type==='pr'?'subTab active':'subTab'} onClick={()=>chooseType('pr')}>PR</button>
      <button className={type==='po'?'subTab active':'subTab'} onClick={()=>chooseType('po')}>PO</button>
      <button className={type==='rgp'?'subTab active':'subTab'} onClick={()=>chooseType('rgp')}>RGP</button>
      <button className={type==='nrgp'?'subTab active':'subTab'} onClick={()=>chooseType('nrgp')}>NRGP</button>
    </div>
    {liveType?<>
      <div className="procFilters"><input placeholder="Search material code, spare, vendor..." value={search} onChange={e=>setSearch(e.target.value)}/><span>{filters.department_code}{filters.area?` → ${filters.area}`:''}</span>{type==='eligible'&&<button onClick={aiScreen} disabled={screenBusy}>{screenBusy?'Screening...':'AI Screen Eligible Spares'}</button>}</div>
      {type==='eligible'&&<div className="fileHelp"><strong>Rule first, AI second</strong><span>Eligible only when Store + open PR + open PO is still below Required/Safety Qty. AI may rank urgency, but cannot change Material Code or Ideal PR Qty.{screenSource?` Current screen: ${screenSource}.`:''}</span></div>}
      <div className="tableWrap"><table><thead><tr>{criticalView?<><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Required / Safety</th><th>Store</th><th>PR</th><th>PO</th><th>Ideal PR Qty</th><th>Priority</th><th>Reason</th><th>Vendor</th></>:<><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Area</th><th>Equipment</th><th>{type==='pr'?'Open PR Qty':'Open PO Qty'}</th><th>Vendor</th></>}</tr></thead><tbody>{rows.map(r=>{const screened=rankMap.get(r.material_code);return criticalView?<tr key={r.id}><td className="code">{r.material_code||'—'}</td><td>{r.spare_name||'—'}</td><td>{r.description||'—'}</td><td>{r.required_qty??'—'}</td><td>{r.store_qty??'—'}</td><td>{r.pr_qty??'—'}</td><td>{r.po_qty??'—'}</td><td><strong>{r.ideal_pr_qty??0}</strong></td><td>{screened?.priority||r.rule_priority||'—'}</td><td>{screened?.reason||r.rule_reason||'—'}</td><td>{r.vendor||'—'}</td></tr>:<tr key={r.id}><td className="code">{r.material_code||'—'}</td><td>{r.spare_name||'—'}</td><td>{r.description||'—'}</td><td>{r.areas||'—'}</td><td>{r.equipment||'—'}</td><td>{type==='pr'?(r.pr_qty??'—'):(r.po_qty??'—')}</td><td>{r.vendor||'—'}</td></tr>})}</tbody></table></div>
      <p className="muted">Showing {rows.length} {type==='eligible'?'PR-eligible materials':type==='critical'?'critical materials':`materials with active ${type==='pr'?'PR':'PO'} quantity`}.</p>
    </>:<div className="emptyState"><h3>{type.toUpperCase()}</h3><p>{type.toUpperCase()} is ready in the navigation and import analyzer. Historical transaction storage will be enabled once the procurement transaction table is committed safely.</p></div>}
  </>;
}
