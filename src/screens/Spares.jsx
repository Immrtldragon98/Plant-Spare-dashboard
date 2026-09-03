import React,{useEffect,useRef,useState} from 'react';
import Filters from '../components/Filters.jsx';
import {request} from '../api/client.js';

const Cell=({value})=><>{value===null||value===undefined||value===''?'—':value}</>;
const equipmentName=value=>String(value||'').replace(/^CH2_/i,'')||'—';

export default function Spares(p){
  const[rows,setRows]=useState([]),[page,setPage]=useState(1),[paging,setPaging]=useState({page:1,page_size:50,total:0,pages:1}),[loading,setLoading]=useState(false);
  const requestNumber=useRef(0);
  const filterKey=JSON.stringify({...p.filters,search:p.search});
  const load=async(target=page)=>{
    const current=++requestNumber.current;
    setLoading(true);
    try{
      const qs=new URLSearchParams({...p.filters,equipment:'',search:p.search,page:String(target),page_size:'50'});
      const out=await request('/materials/page?'+qs);
      if(current!==requestNumber.current)return;
      const nextRows=Array.isArray(out?.rows)?out.rows:[];
      const nextPaging=out?.pagination||{};
      setRows(nextRows);
      setPaging({page:Number(nextPaging.page)||target,page_size:Number(nextPaging.page_size)||50,total:Number(nextPaging.total)||0,pages:Math.max(Number(nextPaging.pages)||1,1)});
    }catch(e){if(current===requestNumber.current){setRows([]);p.setNotice(e.message)}}
    finally{if(current===requestNumber.current)setLoading(false)}
  };
  useEffect(()=>{setPage(1);load(1)},[filterKey,p.refreshToken]);
  useEffect(()=>{if(page!==paging.page)load(page)},[page]);
  const download=async()=>{const qs=new URLSearchParams({department_code:p.filters.department_code,area:p.filters.area||'',discipline:p.filters.discipline||''});const r=await request('/export/materials?'+qs);const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Spare-Materials.xlsx';a.click();URL.revokeObjectURL(a.href)};
  return <>
    <div className="pageTitle"><div><h1>Spare Materials</h1><p>Current Store, Open PR and Open PO quantities against each Material Code.</p></div><div>{p.canEdit&&<button onClick={()=>p.setEditing(true)}>+ Add Spare</button>} <button className="secondary" onClick={download}>Export Excel</button></div></div>
    <Filters {...p}/>
    <div className="tableWrap"><table><thead><tr><th>S.No</th><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Sub-department</th><th>Equipment</th><th>Sub-equipment</th><th>Discipline</th><th>Req.</th><th>Store</th><th>PR</th><th>PO</th><th>Vendor</th><th>SAP Location</th>{p.canEdit&&<th></th>}</tr></thead><tbody>
      {loading&&rows.length===0?<tr><td colSpan={p.canEdit?15:14}>Loading spare materials…</td></tr>:rows.length===0?<tr><td colSpan={p.canEdit?15:14}>No spare materials match these filters.</td></tr>:rows.map((m,i)=>{const derived=!m.spare_name&&m.description;return <tr key={m.usage_id}><td>{(paging.page-1)*paging.page_size+i+1}</td><td className="code"><Cell value={m.material_code}/></td><td><Cell value={m.spare_name||m.description}/>{derived&&<small className="muted block">Derived from description · re-import master to repair</small>}</td><td><Cell value={m.spare_name?m.description:null}/></td><td><Cell value={m.department_name||m.department_code}/></td><td>{equipmentName(m.area)}</td><td><Cell value={m.sub_equipment}/></td><td><Cell value={m.discipline}/></td><td><Cell value={m.required_qty}/></td><td><Cell value={m.store_qty}/></td><td><Cell value={m.pr_qty}/></td><td><Cell value={m.po_qty}/></td><td><Cell value={m.vendor}/></td><td className="code smallcode"><Cell value={m.sap_location_code||m.sub_equipment_code||m.equipment_code}/></td>{p.canEdit&&<td><button className="link" onClick={()=>p.setEditing(m)}>Edit</button></td>}</tr>})}
    </tbody></table></div>
    <div className="pagination"><span>{loading?'Refreshing…':`Showing ${rows.length} of ${paging.total} usages`}</span><div><button className="secondary" disabled={loading||paging.page<=1} onClick={()=>setPage(x=>Math.max(1,x-1))}>Previous</button><span> Page {paging.page} / {paging.pages} </span><button className="secondary" disabled={loading||paging.page>=paging.pages} onClick={()=>setPage(x=>Math.min(paging.pages,x+1))}>Next</button></div></div>
  </>;
}
