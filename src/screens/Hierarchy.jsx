import React,{useState} from 'react';
import Blank from '../components/Blank.jsx';
import { request } from '../api/client.js';

export default function Hierarchy({rows,departments,reload,setNotice}){
  const[edit,setEdit]=useState(null);
  return <>
    <div className="pageTitle"><div><h1>SAP Hierarchy</h1><p>Plant → Department → Area → Equipment → Equipment Code → Sub-equipment → Sub-equipment Code. Discipline remains a separate filter.</p></div><button onClick={()=>setEdit({department_code:departments?.[0]?.department_code||''})}>+ Add Location</button></div>
    <div className="tableWrap"><table><thead><tr><th>Plant</th><th>Department</th><th>Area</th><th>Equipment</th><th>Equipment Code</th><th>Sub-equipment</th><th>Sub-equipment Code</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="code"><Blank value={r.plant_code||'3102'}/></td><td><div>{r.department_name}</div><small className="muted">{r.department_code}</small></td><td>{r.area_name}</td><td><Blank value={r.equipment_name}/></td><td className="code"><Blank value={r.equipment_code}/></td><td><Blank value={r.sub_equipment_name}/></td><td className="code"><Blank value={r.sub_equipment_code}/></td><td><span className={(r.area_code||r.equipment_code||r.sub_equipment_code)?'mapped':'unmapped'}>{(r.area_code||r.equipment_code||r.sub_equipment_code)?'Mapped':'Needs mapping'}</span></td><td><button className="link" onClick={()=>setEdit(r)}>Edit</button></td></tr>)}</tbody></table></div>
    {edit&&<HierarchyModal item={edit} departments={departments} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);reload()}} setNotice={setNotice}/>} 
  </>;
}

function HierarchyModal({item,departments,onClose,onSaved,setNotice}){
  const[x,setX]=useState({...item});
  const selectedDepartment=(departments||[]).find(d=>d.department_code===x.department_code)||departments?.[0]||{};
  const field=(k,l,p='')=><label>{l}<input value={x[k]||''} placeholder={p} onChange={e=>setX({...x,[k]:e.target.value})}/></label>;
  return <div className="modal"><form onSubmit={async e=>{e.preventDefault();try{const payload={...x,sap_location_code:null};await request(item.id?`/hierarchy/${item.id}`:'/hierarchy',{method:item.id?'PUT':'POST',body:JSON.stringify(payload)});onSaved()}catch(e){setNotice(e.message)}}}>
    <div className="modalHead"><h2>{item.id?'Edit':'Add'} Location</h2><button type="button" className="ghost" onClick={onClose}>✕</button></div>
    <div className="formGrid">
      <label>Plant<input value={selectedDepartment.plant_code||'3102'} readOnly/></label>
      <label>Department<select value={x.department_code||''} onChange={e=>setX({...x,department_code:e.target.value})}>{(departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}</select></label>
      {field('area_name','Area','WRM / ICM / PFA / Utility')}
      {field('area_code','SAP Area Code','3102_CH2')}
      {field('equipment_name','Equipment','WRM / ICM / PFA / Utility')}
      {field('equipment_code','Equipment Code','3102_CH2_WRM')}
      {field('sub_equipment_name','Sub-equipment','Finishing Mill')}
      {field('sub_equipment_code','SAP Sub-equipment Code','3102_CH2_WRM_FM')}
    </div>
    <div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button>Save</button></div>
  </form></div>;
}
