import React,{useState} from 'react';
import { request } from '../api/client.js';

function Cell({value}){
  const text=String(value??'').trim();
  return text||<span className="muted">—</span>;
}

function parentDepartmentName(department){
  const name=String(department?.department_name||'').trim();
  if(/^cast house\s*\d+$/i.test(name))return 'Cast House';
  return name||'—';
}

function equipmentName(location){
  const area=String(location?.area_name||'').trim();
  const equipment=String(location?.equipment_name||'').trim();
  const code=String(location?.equipment_code||'').trim();
  if(area&&!/^CH\d+_/i.test(area))return area;
  if(equipment&&!/^CH\d+_/i.test(equipment))return equipment;
  const match=code.match(/(?:^|_)CH\d+_([^_]+)$/i);
  return match?.[1]||area.replace(/^CH\d+_/i,'')||equipment.replace(/^CH\d+_/i,'')||'';
}

export default function Hierarchy({rows=[],departments,reload,setNotice}){
  const[edit,setEdit]=useState(null);
  const openEditor=(row)=>setEdit({...row,equipment_name:equipmentName(row)});
  return <>
    <div className="pageTitle"><div><h1>SAP Hierarchy</h1><p>Plant → Department → Sub-department → Sub-department Code → Equipment → Equipment Code → Sub-equipment → Sub-equipment Code.</p></div><button onClick={()=>openEditor({plant_code:departments?.[0]?.plant_code||'3102',department_code:departments?.[0]?.department_code||'3102_CH2',department_name:departments?.[0]?.department_name||'Cast House 2'})}>+ Add Location</button></div>
    <div className="hierarchyBanner"><strong>Clean hierarchy view</strong><span> Editing a row to match another row merges the duplicate and keeps all spare usages linked.</span></div>
    <div className="tableWrap"><table><thead><tr><th>Plant</th><th>Department</th><th>Sub-department</th><th>Sub-department Code</th><th>Equipment</th><th>Equipment Code</th><th>Sub-equipment</th><th>Sub-equipment Code</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan="10" className="muted">No hierarchy locations found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td className="code"><Cell value={r.plant_code||'3102'}/></td>
        <td>{parentDepartmentName(r)}</td>
        <td><Cell value={r.department_name}/></td>
        <td className="code"><Cell value={r.department_code}/></td>
        <td><Cell value={equipmentName(r)}/></td>
        <td className="code"><Cell value={r.equipment_code}/></td>
        <td><Cell value={r.sub_equipment_name}/>{Number(r.duplicate_count)>1&&<small className="muted block">{r.duplicate_count} old rows collapsed</small>}</td>
        <td className="code"><Cell value={r.sub_equipment_code}/></td>
        <td><span className={r.mapping_status==='Mapped'?'mapped':'unmapped'}>{r.mapping_status||'Needs mapping'}</span>{Number(r.active_usages)>0&&<small className="muted block">{r.active_usages} active spare usage(s)</small>}</td>
        <td><button className="link" onClick={()=>openEditor(r)}>Edit</button></td>
      </tr>)}
    </tbody></table></div>
    {edit&&<HierarchyModal item={edit} departments={departments} onClose={()=>setEdit(null)} onSaved={(result)=>{setEdit(null);reload();setNotice(result?.merged?'Hierarchy rows merged successfully. Spare usages were moved to the surviving row.':'Hierarchy location saved successfully.')}} setNotice={setNotice}/>}
  </>;
}

function HierarchyModal({item,departments,onClose,onSaved,setNotice}){
  const[x,setX]=useState({...item});
  const selectedDepartment=(departments||[]).find(d=>d.department_code===x.department_code)||departments?.[0]||{};
  const field=(k,l,p='')=><label>{l}<input value={x[k]||''} placeholder={p} onChange={e=>setX({...x,[k]:e.target.value})}/></label>;
  return <div className="modal"><form onSubmit={async e=>{e.preventDefault();try{
    const equipment=String(x.equipment_name||'').trim();
    const departmentCode=String(x.department_code||'').trim();
    const payload={...x,plant_code:selectedDepartment.plant_code||x.plant_code||'3102',department_name:String(x.department_name||'').trim(),department_code:departmentCode,area_name:equipment,area_code:departmentCode||null,equipment_name:equipment,sap_location_code:x.sap_location_code||null};
    const result=await request(item.id?`/hierarchy/${item.id}`:'/hierarchy',{method:item.id?'PUT':'POST',body:JSON.stringify(payload)});
    onSaved(result);
  }catch(e){setNotice(e.message)}}}>
    <div className="modalHead"><h2>{item.id?'Edit':'Add'} Location</h2><button type="button" className="ghost" onClick={onClose}>✕</button></div>
    <div className="formGrid">
      <label>Plant<input value={selectedDepartment.plant_code||x.plant_code||'3102'} readOnly/></label>
      <label>Department<input value={parentDepartmentName(selectedDepartment||x)} readOnly/></label>
      {field('department_name','Sub-department','Cast House 2')}
      {field('department_code','Sub-department Code','3102_CH2')}
      {field('equipment_name','Equipment','WRM / ICM / PFA / Utility')}
      {field('equipment_code','Equipment Code','3102_CH2_WRM')}
      {field('sub_equipment_name','Sub-equipment','Enter sub-equipment')}
      {field('sub_equipment_code','Sub-equipment Code','Enter SAP sub-equipment code')}
    </div>
    <div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button>Save</button></div>
  </form></div>;
}
