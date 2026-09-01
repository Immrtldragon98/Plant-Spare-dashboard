import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';

export default function Procurement({filters,setFilters,setNotice}){
  const[type,setType]=useState(filters.procurement_type||'eligible'),[rows,setRows]=useState([]),[search,setSearch]=useState(''),[screening,setScreening]=useState([]),[screenBusy,setScreenBusy]=useState(false),[screenSource,setScreenSource]=useState(''),[page,setPage]=useState(1),[paging,setPaging]=useState({page:1,page_size:50,total:0,pages:1}),[loading,setLoading]=useState(false);
  useEffect(()=>{if(filters.procurement_type&&filters.procurement_type!==type)setType(filters.procurement_type)},[filters.procurement_type]);
  const chooseType=t=>{setType(t);setPage(1);setScreening([]);setScreenSource('');setFilters?.(f=>({...f,procurement_type:t}))};
  const liveType=['eligible','critical','pr','po'].includes(type);
  const queryKey=JSON.stringify({department_code:filters.department_code||'',area:filters.area||'',type,search});
  useEffect(()=>{setPage(1)},[queryKey]);
  useEffect(()=>{
    if(!liveType){setRows([]);setPaging({page:1,page_size:50,total:0,pages:1});return;}
    setLoading(true);
    const qs=new URLSearchParams({department_code:filters.department_code||'',area:filters.area||'',type,search,page:String(page),page_size:'50'});
    request('/procurement?'+qs).then(x=>{setRows(x.rows||[]);setPaging(x.pagination||{page,page_size:50,total:(x.rows||[]).length,pages:1})}).catch(e=>setNotice(e.message)).finally(()=>setLoading(false));
  },[filters.department_code,filters.area,type,search,page]);
  const rankMap=useMemo(()=>new Map(screening.map(x=>[x.material_code,x])),[screening]);
  const aiScreen=async()=>{setScreenBusy(true);try{const x=await request('/procurement/pr-eligible/screen',{method:'POST',body:JSON.stringify({department_code:filters.department_code||'',area:filters.area||'',search})});setScreening(x.screening||[]);setScreenSource(x.source||'');setNotice(x.message)}catch(e){setNotice(e.message)}finally{setScreenBusy(false)}};
  const criticalView=type==='eligible'||type==='critical';
  return <>
    <div className="pageTitle"><div><h1>Procurement</h1><p>Only the quantities and identifiers needed for procurement action.</p></div></div>
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
      {type==='eligible'&&<div className="fileHelp"><strong>Rule first, AI second</strong><span>Eligible only when Store + Open PR + Open PO is below Required/Safety Qty. AI ranks urgency but cannot change quantities.{screenSource?` Current screen: ${screenSource}.`:''}</span></div>}
      <div className="tableWrap"><table><thead><tr>{criticalView?<><th>Material Code</th><th>Spare Name</th><th>Required / Safety</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Ideal PR Qty</th><th>Priority</th><th>Vendor</th></>:<><th>Material Code</th><th>Spare Name</th><th>{type==='pr'?'Open PR Qty':'Open PO Qty'}</th><th>Vendor</th></>}</tr></thead><tbody>{rows.map(r=>{const screened=rankMap.get(r.material_code);return criticalView?<tr key={r.id}><td className="code">{r.material_code||'—'}</td><td>{r.spare_name||'—'}</td><td>{r.required_qty??'—'}</td><td>{r.store_qty??'—'}</td><td>{r.pr_qty??'—'}</td><td>{r.po_qty??'—'}</td><td><strong>{r.ideal_pr_qty??0}</strong></td><td title={screened?.reason||r.rule_reason||''}>{screened?.priority||r.rule_priority||'—'}</td><td>{r.vendor||'—'}</td></tr>:<tr key={r.id}><td className="code">{r.material_code||'—'}</td><td>{r.spare_name||'—'}</td><td>{type==='pr'?(r.pr_qty??'—'):(r.po_qty??'—')}</td><td>{r.vendor||'—'}</td></tr>})}</tbody></table></div>
      <div className="pagination"><span>{loading?'Loading…':`Showing ${rows.length} of ${paging.total}`}</span><div><button className="secondary" disabled={loading||paging.page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))}>Previous</button><span> Page {paging.page} / {paging.pages} </span><button className="secondary" disabled={loading||paging.page>=paging.pages} onClick={()=>setPage(x=>Math.min(paging.pages,x+1))}>Next</button></div></div>
    </>:<div className="emptyState"><h3>{type.toUpperCase()}</h3><p>{type.toUpperCase()} is ready in the navigation and import analyzer. Transaction-level history becomes available when the procurement-events migration is applied.</p></div>}
  </>;
}
