import React,{useEffect,useState} from 'react';
import Filters from '../components/Filters.jsx';
import Blank from '../components/Blank.jsx';
import {request} from '../api/client.js';

export default function Spares(p){
  const[rows,setRows]=useState([]),[page,setPage]=useState(1),[paging,setPaging]=useState({page:1,page_size:50,total:0,pages:1}),[loading,setLoading]=useState(false),[selected,setSelected]=useState(null);
  const filterKey=JSON.stringify({...p.filters,search:p.search});
  const load=async(target=page)=>{setLoading(true);try{const qs=new URLSearchParams({...p.filters,search:p.search,page:String(target),page_size:'50'});const out=await request('/materials/page?'+qs);setRows(out.rows||[]);setPaging(out.pagination||{page:target,page_size:50,total:(out.rows||[]).length,pages:1});if(selected){const fresh=(out.rows||[]).find(x=>x.material_code===selected.material_code);if(fresh)setSelected(fresh)}}catch(e){p.setNotice(e.message)}finally{setLoading(false)}};
  useEffect(()=>{setPage(1);load(1)},[filterKey,p.refreshToken]);
  useEffect(()=>{if(page!==paging.page)load(page)},[page]);
  const download=async()=>{const qs=new URLSearchParams({department_code:p.filters.department_code,area:p.filters.area||'',discipline:p.filters.discipline||''});const r=await request('/export/materials?'+qs);const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Spare-Materials.xlsx';a.click()};
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  return <>
    <div className="pageTitle"><div><h1>Spare Materials</h1><p>Click any spare to see current Store, Open PR and Open PO quantities mapped to its Material Code.</p></div><div>{p.canEdit&&<button onClick={()=>p.setEditing(true)}>+ Add Spare</button>} <button className="secondary" onClick={download}>Export Excel</button></div></div>
    <Filters {...p}/>
    {selected&&<section className="spareDetail">
      <div className="pageTitle"><div><h2>{selected.spare_name||selected.description||'Unnamed Spare'}</h2><p className="code">{selected.material_code||'No Material Code'}</p></div><button className="secondary" onClick={()=>setSelected(null)}>Close</button></div>
      <div className="universalStats">
        <div><small>Store Qty</small><strong>{selected.store_qty??'—'}</strong></div>
        <div><small>Open PR Qty</small><strong>{selected.pr_qty??'—'}</strong></div>
        <div><small>Open PO Qty</small><strong>{selected.po_qty??'—'}</strong></div>
        <div><small>Store + PR + PO</small><strong>{n(selected.store_qty)+n(selected.pr_qty)+n(selected.po_qty)}</strong></div>
        <div><small>Required Qty</small><strong>{selected.required_qty??'—'}</strong></div>
      </div>
      <div className="fileHelp"><strong>Material details</strong><span>{selected.description||'Description blank'}{selected.part_number?` · Part No: ${selected.part_number}`:''}{selected.vendor?` · Vendor: ${selected.vendor}`:''}{selected.equipment?` · ${selected.equipment}${selected.sub_equipment?` → ${selected.sub_equipment}`:''}`:''}{selected.discipline?` · ${selected.discipline}`:''}</span></div>
    </section>}
    <div className="tableWrap"><table><thead><tr><th>S.No</th><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Department</th><th>Area</th><th>Equipment</th><th>Sub-equipment</th><th>Discipline</th><th>Req.</th><th>Store</th><th>PR</th><th>PO</th><th>Vendor</th><th>SAP Location</th>{p.canEdit&&<th></th>}</tr></thead><tbody>{rows.map((m,i)=>{const derived=!m.spare_name&&m.description;return <tr key={m.usage_id} onClick={()=>setSelected(m)} style={{cursor:'pointer'}}><td>{(paging.page-1)*paging.page_size+i+1}</td><td className="code"><Blank value={m.material_code}/></td><td><Blank value={m.spare_name||m.description}/>{derived&&<small className="muted block">Derived from description · re-import master to repair</small>}</td><td><Blank value={m.spare_name?m.description:null}/></td><td className="code"><Blank value={m.department_code}/></td><td>{m.area}</td><td><Blank value={m.equipment}/></td><td><Blank value={m.sub_equipment}/></td><td><Blank value={m.discipline}/></td><td><Blank value={m.required_qty}/></td><td><Blank value={m.store_qty}/></td><td><Blank value={m.pr_qty}/></td><td><Blank value={m.po_qty}/></td><td><Blank value={m.vendor}/></td><td className="code smallcode"><Blank value={m.sap_location_code}/></td>{p.canEdit&&<td><button className="link" onClick={e=>{e.stopPropagation();p.setEditing(m)}}>Edit</button></td>}</tr>})}</tbody></table></div>
    <div className="pagination"><span>{loading?'Loading…':`Showing ${rows.length} of ${paging.total} usages`}</span><div><button className="secondary" disabled={loading||paging.page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))}>Previous</button><span> Page {paging.page} / {paging.pages} </span><button className="secondary" disabled={loading||paging.page>=paging.pages} onClick={()=>setPage(x=>Math.min(paging.pages,x+1))}>Next</button></div></div>
  </>;
}
