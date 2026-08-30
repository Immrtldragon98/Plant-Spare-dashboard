import React,{useState} from 'react';
import Blank from '../components/Blank.jsx';
import { request } from '../api/client.js';

function parentDepartmentName(department){
  const name=String(department?.department_name||'').trim();
  if(/^cast house\s*\d+$/i.test(name))return 'Cast House';
  return name||'—';
}

export default function Hierarchy({rows,departments,reload,setNotice}){
  const[edit,setEdit]=useState(null);
  return <>
    <div className="pageTitle"><div><h1>SAP Hierarchy</h1><p>Plant → Department → Sub-department → Sub-department Code → Equipment → Equipment Code → Sub-equipment → Sub-equipment Code.</p></div><button onClick={()=>setEdit({department_code:departments?.[0]?.department_code||''})}>+ Add Location</button></div>
    <div className="hierarchyBanner"><strong>Clean hierarchy view</strong><span> Duplicate naming variants are collapsed. SAP hierarchy remains the source of truth.</span></div>
    <div className="tableWrap"><table><thead><tr><th>Plant</th><th>Department</th><th>Sub-department</th><th>Sub-department Code</th><th>Equipment</th><th>Equipment Code</th><th>Sub-equipment</th><th>Sub-equipment Code</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="code"><Blank value={r.plant_code||'3102'}/></td><td>{parentDepartmentName(r)}</td><td className="code"><Blank value={r.department_code}/></td><td><Blank value={r.department_name}/></td><td><Blank value={r.equipment_name||r.area_name}/></td><td className="code"><Blank value={r.equipment_code}/></td><td><Blank value={r.sub_equipment_name}/>{Number(r.duplicate_count)>1&&<small className="muted block">{r.duplicate_count} old rows collapsed</small>}</td><td className="code"><Blank value={r.sub_equipment_code}/></td><td><span className={r.mapping_status==='Mapped'?'mapped':'unmapped'}>{r.mapping_status||'Needs mapping'}</span>{Number(r.active_usages)>0&&<small className="muted block">{r.active_usages} active spare usage(s)</small>}</td><td><button className="link" onClick={()=>setEdit(r)}>Edit</button></td></tr>)}</tbody></table></div>
    {edit&&<HierarchyModal item={edit} departments={departments} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);reload()}} setNotice={setNotice}/>} 
  </>;
}

function HierarchyModal({item,departments,onClose,onSaved,setNotice}){
  const[x,setX]=useState({...item});
  const selectedDepartment=(departments||[]).find(d=>d.department_code===x.department_code)||departments?.[0]||{};
  const field=(k,l,p='')=><label>{l}<input value={x[k]||''} placeholder={p} onChange={e=>setX({...x,[k]:e.target.value})}/></label>;
  return <div className="modal"><form onSubmit={async e=>{e.preventDefault();try{const equipment=String(x.equipment_name||x.area_name||'').trim();const payload={...x,department_name:selectedDepartment.department_name||x.department_name,area_name:equipment,area_code:x.department_code||null,equipment_name:equipment,sap_location_code:null};await request(item.id?`/hierarchy/${item.id}`:'/hierarchy',{method:item.id?'PUT':'POST',body:JSON.stringify(payload)});onSaved()}catch(e){setNotice(e.message)}}}>
    <div className="modalHead"><h2>{item.id?'Edit':'Add'} Location</h2><button type="button" className="ghost" onClick={onClose}>✕</button></div>
    <div className="formGrid">
      <label>Plant<input value={selectedDepartment.plant_code||'3102'} readOnly/></label>
      <label>Department<input value={parentDepartmentName(selectedDepartment)} readOnly/></label>
      <label>Sub-department<select value={x.department_code||''} onChange={e=>{const code=e.target.value;const d=(departments||[]).find(v=>v.department_code===code);setX({...x,department_code:code,department_name:d?.department_name||x.department_name})}}>{(departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code}</option>)}</select></label>
      <label>Sub-department Code<input value={selectedDepartment.department_name||x.department_name||''} readOnly/></label>
      {field('equipment_name','Equipment','WRM / ICM / PFA / Utility')}
      {field('equipment_code','Equipment Code','3102_CH2_WRM')}
      {field('sub_equipment_name','Sub-equipment','Finishing Mill')}
      {field('sub_equipment_code','Sub-equipment Code','3102_CH2_WRM_FM')}
    </div>
    <div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button>Save</button></div>
  </form></div>;
}
