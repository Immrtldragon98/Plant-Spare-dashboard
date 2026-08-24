import React,{useState} from 'react';
import { request } from '../api/client.js';

export default function MaterialModal({ material, departments, onClose, onSaved, setNotice }) {
  const firstDept = departments?.[0]?.department_code || '';
  const [m,setM]=useState({department_code:firstDept,...material});
  const field=(k,l,type='text',placeholder='')=><label>{l}<input type={type} value={m[k]??''} placeholder={placeholder} onChange={e=>setM({...m,[k]:type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value})}/></label>;
  const del=async()=>{try{await request(`/materials/${m.usage_id}`,{method:'DELETE'});onSaved()}catch(e){setNotice(e.message)}};
  return <div className="modal"><form onSubmit={async e=>{e.preventDefault();try{await request(m.usage_id?`/materials/${m.usage_id}`:'/materials',{method:m.usage_id?'PUT':'POST',body:JSON.stringify(m)});onSaved()}catch(e){setNotice(e.message)}}}>
    <div className="modalHead"><div><h2>{m.usage_id?'Edit Spare':'Add Spare'}</h2><p className="muted">Department and SAP hierarchy are data, not hardcoded screens.</p></div><button type="button" className="ghost" onClick={onClose}>✕</button></div>
    <div className="formGrid">
      {field('material_code','Material Code')}{field('description','Description')}{field('part_number','Part Number')}
      <label>Department<select value={m.department_code||firstDept} onChange={e=>setM({...m,department_code:e.target.value,area:''})}>{(departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_name}</option>)}</select></label>
      {field('area','Area')}{field('equipment','Equipment')}{field('sub_equipment','Sub-equipment')}{field('sap_location_code','SAP Functional Location')}
      {field('required_qty','Required Qty','number')}{field('store_qty','Available in Store','number')}{field('pr_qty','In PR','number')}{field('po_qty','In PO','number')}
      {field('uom','UOM')}{field('manufacturer','Manufacturer')}{field('vendor','Vendor')}{field('notes','Notes')}
    </div>
    <div className="actions spread">{m.usage_id?<button type="button" className="danger" onClick={del}>Remove from this equipment</button>:<span/>}<div><button type="button" className="secondary" onClick={onClose}>Cancel</button> <button>Save</button></div></div>
  </form></div>;
}
