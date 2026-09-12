import React,{useState} from 'react';
import { request } from '../api/client.js';

function Cell({value}){const text=String(value??'').trim();return text||<span className="muted">—</span>}

export default function Hierarchy({rows=[],departments,reload,setNotice}){
  const[edit,setEdit]=useState(null);
  return <>
    <div className="pageTitle"><div><h1>Five-level hierarchy</h1><p>Plant → Department → Sub-department → Equipment → Sub-equipment. All levels are data-driven and reusable for any plant.</p></div><button onClick={()=>setEdit({plant_code:departments?.[0]?.plant_code||'',department_code:departments?.[0]?.department_code||'',department_name:departments?.[0]?.department_name||''})}>+ Add Location</button></div>
    <div className="hierarchyBanner"><strong>Universal hierarchy</strong><span> Matching rows are merged safely while their spare usages remain linked.</span></div>
    <div className="tableWrap"><table><thead><tr><th>Plant</th><th>Department</th><th>Sub-department</th><th>Equipment</th><th>Sub-equipment</th><th>Status</th><th></th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan="7" className="muted">No hierarchy locations found.</td></tr>:rows.map(r=><tr key={r.id}>
        <td className="code"><Cell value={r.plant_code}/></td>
        <td><Cell value={r.department_name}/></td>
        <td><Cell value={r.area_name}/></td>
        <td><Cell value={r.equipment_name}/></td>
        <td><Cell value={r.sub_equipment_name}/>{Number(r.duplicate_count)>1&&<small className="muted block">{r.duplicate_count} old rows collapsed</small>}</td>
        <td><span className={r.mapping_status==='Mapped'?'mapped':'unmapped'}>{r.mapping_status||'Needs mapping'}</span>{Number(r.active_usages)>0&&<small className="muted block">{r.active_usages} active spare usage(s)</small>}</td>
        <td><button className="link" onClick={()=>setEdit({...r})}>Edit</button></td>
      </tr>)}
    </tbody></table></div>
    {edit&&<HierarchyModal item={edit} departments={departments} onClose={()=>setEdit(null)} onSaved={(result)=>{setEdit(null);reload();setNotice(result?.merged?'Hierarchy rows merged successfully. Spare usages were preserved.':'Hierarchy location saved successfully.')}} setNotice={setNotice}/>}
  </>;
}

function HierarchyModal({item,departments,onClose,onSaved,setNotice}){
  const[x,setX]=useState({...item});
  const selected=(departments||[]).find(d=>d.department_code===x.department_code)||{};
  const field=(k,l)=><label>{l}<input value={x[k]||''} onChange={e=>setX({...x,[k]:e.target.value})}/></label>;
  return <div className="modal"><form onSubmit={async e=>{e.preventDefault();try{
    const payload={...x,plant_code:String(x.plant_code||selected.plant_code||'').trim(),department_code:String(x.department_code||'').trim(),department_name:String(x.department_name||'').trim(),area_code:String(x.area_code||'').trim()||null,area_name:String(x.area_name||'').trim(),equipment_code:String(x.equipment_code||'').trim()||null,equipment_name:String(x.equipment_name||'').trim()||null,sub_equipment_code:String(x.sub_equipment_code||'').trim()||null,sub_equipment_name:String(x.sub_equipment_name||'').trim()||null,sap_location_code:x.sap_location_code||null};
    const result=await request(item.id?`/hierarchy/${item.id}`:'/hierarchy',{method:item.id?'PUT':'POST',body:JSON.stringify(payload)});onSaved(result);
  }catch(e){setNotice(e.message)}}}>
    <div className="modalHead"><h2>{item.id?'Edit':'Add'} hierarchy path</h2><button type="button" className="ghost" onClick={onClose}>✕</button></div>
    <div className="formGrid">{field('plant_code','Plant')}{field('department_name','Department')}{field('department_code','Department Code')}{field('area_name','Sub-department')}{field('area_code','Sub-department Code')}{field('equipment_name','Equipment')}{field('equipment_code','Equipment Code')}{field('sub_equipment_name','Sub-equipment')}{field('sub_equipment_code','Sub-equipment Code')}</div>
    <div className="actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button>Save</button></div>
  </form></div>;
}
