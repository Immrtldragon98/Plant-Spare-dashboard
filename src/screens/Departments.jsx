import React, { useState } from 'react';
import { request } from '../api/client.js';

const emptyForm={plant_code:'',department_code:'',department_name:''};

export default function Departments({ departments, reload, setNotice }) {
  const [form,setForm]=useState(emptyForm);
  async function submit(event){
    event.preventDefault();
    try{
      await request('/departments',{method:'POST',body:JSON.stringify(form)});
      setForm(emptyForm);
      await reload();
      setNotice('Department added. Continue in Hierarchy to add its sub-departments and equipment.');
    }catch(error){setNotice(error.message)}
  }
  return <>
    <div className="pageTitle"><div><h1>Plant setup</h1><p>Start with a plant and department. Then use Hierarchy to add Sub-department → Equipment → Sub-equipment.</p></div></div>
    <form className="userForm" onSubmit={submit}>
      <input value={form.plant_code} onChange={e=>setForm({...form,plant_code:e.target.value})} placeholder="Plant code" required/>
      <input value={form.department_code} onChange={e=>setForm({...form,department_code:e.target.value})} placeholder="Department code" required/>
      <input value={form.department_name} onChange={e=>setForm({...form,department_name:e.target.value})} placeholder="Department name" required/>
      <button type="submit">Add Department</button>
    </form>
    <div className="tableWrap"><table><thead><tr><th>Plant</th><th>Department Code</th><th>Department</th><th>Sub-departments</th></tr></thead><tbody>
      {(departments||[]).length===0?<tr><td colSpan="4" className="muted">No plant hierarchy yet. Add the first plant and department above.</td></tr>:(departments||[]).map(d=><tr key={d.department_code}><td>{d.plant_code}</td><td className="code">{d.department_code}</td><td>{d.department_name}</td><td>{(d.areas||[]).join(', ')||'—'}</td></tr>)}
    </tbody></table></div>
  </>;
}
