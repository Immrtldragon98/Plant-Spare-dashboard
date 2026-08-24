import React,{useEffect,useState} from 'react';
import ImportBox from '../components/ImportBox.jsx';
import { request } from '../api/client.js';

export default function Imports({history,filters,options,reload,setNotice}){
  const [departmentCode,setDepartmentCode]=useState(filters.department_code||'');
  const [area,setArea]=useState(filters.area||'');
  const [areas,setAreas]=useState(options.areas||[]);

  useEffect(()=>{if(!departmentCode&&options.departments?.length)setDepartmentCode(options.departments[0].department_code)},[departmentCode,options.departments]);
  useEffect(()=>{
    if(!departmentCode)return;
    request('/options?'+new URLSearchParams({department_code:departmentCode}))
      .then(x=>{setAreas(x.areas||[]);if(area&&!(x.areas||[]).includes(area))setArea('')})
      .catch(e=>setNotice(e.message));
  },[departmentCode]);

  const selectedDepartment=options.departments?.find(d=>d.department_code===departmentCode);
  return <>
    <div className="pageTitle"><div><h1>Excel & SAP Updates</h1><p>Choose the destination first, then upload. Always Preview before Confirm.</p></div></div>

    <div className="importScope">
      <label>Department / SAP Code
        <select value={departmentCode} onChange={e=>{setDepartmentCode(e.target.value);setArea('')}}>
          {(options.departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}
        </select>
      </label>
      <label>Area / Sub-area
        <select value={area} onChange={e=>setArea(e.target.value)}>
          <option value="">Select area</option>
          {areas.map(a=><option value={a} key={a}>{a}</option>)}
        </select>
      </label>
      <div className="scopeSummary"><strong>{selectedDepartment?.department_code||departmentCode}</strong><span>→</span><strong>{area||'Select area'}</strong></div>
    </div>

    <div className="importGrid">
      <ImportBox title="Full Spare Master" text="Imports Material Code, Spare Name, Description, Equipment, Sub-equipment, Discipline, Required Qty, Vendor and other master fields into the selected Department + Area." preview="/import/master/preview" confirm="/import/master/confirm" departmentCode={departmentCode} area={area} requireArea showDiscipline reload={reload} setNotice={setNotice}/>
      <ImportBox title="SAP Status Update" text="Matches by Material Code. Updates Store, PR, PO and Vendor only when those cells are supplied. Area selection is optional because stock is material-level." preview="/import/sap/preview" confirm="/import/sap/confirm" departmentCode={departmentCode} area={area} reload={reload} setNotice={setNotice}/>
    </div>

    <div className="fileHelp"><strong>Password-protected Excel?</strong><span>Open it in Excel and Save As an unprotected .xlsx before uploading. The app will show a clear error if an encrypted workbook is detected.</span></div>

    <section><h2>Import history</h2><div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Total</th><th>Added</th><th>Updated</th><th>Skipped</th><th>By</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{h.import_type}</td><td>{h.file_name}</td><td>{h.total_rows}</td><td>{h.added_rows}</td><td>{h.updated_rows}</td><td>{h.skipped_rows}</td><td>{h.imported_by_name||'—'}</td></tr>)}</tbody></table></div></section>
  </>;
}
