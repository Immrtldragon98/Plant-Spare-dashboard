import React from 'react';
import Filters from '../components/Filters.jsx';
import Blank from '../components/Blank.jsx';
import { request } from '../api/client.js';

export default function Spares(p){
  const download=async()=>{
    const qs=new URLSearchParams({department_code:p.filters.department_code,area:p.filters.area||'',discipline:p.filters.discipline||''});
    const r=await request('/export/materials?'+qs);
    const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Spare-Materials.xlsx';a.click();
  };
  return <>
    <div className="pageTitle">
      <div><h1>Spare Materials</h1><p>Manual update: click Edit. Bulk Store / PR / PO / Vendor update: use Imports. Re-uploading the corrected master repairs names by Material Code.</p></div>
      <div>{p.canEdit&&<button onClick={()=>p.setEditing(true)}>+ Add Spare</button>} <button className="secondary" onClick={download}>Export Excel</button></div>
    </div>
    <Filters {...p}/>
    <div className="tableWrap"><table><thead><tr>
      <th>S.No</th><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Department</th><th>Area</th><th>Equipment</th><th>Sub-equipment</th><th>Discipline</th><th>Req.</th><th>Store</th><th>PR</th><th>PO</th><th>Vendor</th><th>SAP Location</th>{p.canEdit&&<th></th>}
    </tr></thead><tbody>{p.materials.map((m,i)=>{const derived=!m.spare_name&&m.description;return <tr key={m.usage_id}>
      <td>{i+1}</td><td className="code"><Blank value={m.material_code}/></td><td><Blank value={m.spare_name||m.description}/>{derived&&<small className="muted block">Derived from description · re-import master to repair</small>}</td><td><Blank value={m.spare_name?m.description:null}/></td><td className="code"><Blank value={m.department_code}/></td><td>{m.area}</td><td><Blank value={m.equipment}/></td><td><Blank value={m.sub_equipment}/></td><td><Blank value={m.discipline}/></td><td><Blank value={m.required_qty}/></td><td><Blank value={m.store_qty}/></td><td><Blank value={m.pr_qty}/></td><td><Blank value={m.po_qty}/></td><td><Blank value={m.vendor}/></td><td className="code smallcode"><Blank value={m.sap_location_code}/></td>{p.canEdit&&<td><button className="link" onClick={()=>p.setEditing(m)}>Edit</button></td>}
    </tr>})}</tbody></table></div>
    <p className="muted">Showing {p.materials.length} equipment usages.</p>
  </>;
}
