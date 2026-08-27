import React,{useEffect,useState} from 'react';
import {request} from '../api/client.js';

export default function Procurement({filters,setNotice}){
  const[type,setType]=useState('po'),[rows,setRows]=useState([]),[search,setSearch]=useState('');
  const liveType=type==='pr'||type==='po';
  useEffect(()=>{
    if(!liveType){setRows([]);return;}
    const qs=new URLSearchParams({department_code:filters.department_code||'',area:filters.area||'',type,search});
    request('/procurement?'+qs).then(setRows).catch(e=>setNotice(e.message));
  },[filters.department_code,filters.area,type,search]);
  return <>
    <div className="pageTitle"><div><h1>Procurement</h1><p>PR, PO, RGP and NRGP tracking under one tab.</p></div></div>
    <div className="subTabs">
      <button className={type==='pr'?'subTab active':'subTab'} onClick={()=>setType('pr')}>PR</button>
      <button className={type==='po'?'subTab active':'subTab'} onClick={()=>setType('po')}>PO</button>
      <button className={type==='rgp'?'subTab active':'subTab'} onClick={()=>setType('rgp')}>RGP</button>
      <button className={type==='nrgp'?'subTab active':'subTab'} onClick={()=>setType('nrgp')}>NRGP</button>
    </div>
    {liveType?<>
      <div className="procFilters"><input placeholder="Search material code, spare, vendor..." value={search} onChange={e=>setSearch(e.target.value)}/><span>{filters.department_code}{filters.area?` → ${filters.area}`:''}</span></div>
      <div className="tableWrap"><table><thead><tr><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Area</th><th>Equipment</th><th>{type==='pr'?'Open PR Qty':'Open PO Qty'}</th><th>Vendor</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="code">{r.material_code||'—'}</td><td>{r.spare_name||'—'}</td><td>{r.description||'—'}</td><td>{r.areas||'—'}</td><td>{r.equipment||'—'}</td><td>{type==='pr'?(r.pr_qty??'—'):(r.po_qty??'—')}</td><td>{r.vendor||'—'}</td></tr>)}</tbody></table></div>
      <p className="muted">Showing {rows.length} materials with active {type==='pr'?'PR':'PO'} quantity.</p>
    </>:<div className="emptyState"><h3>{type.toUpperCase()}</h3><p>Ready for mapping. Share the {type.toUpperCase()} Excel headers/file and this subtab will be wired without changing the main navigation.</p></div>}
  </>;
}
