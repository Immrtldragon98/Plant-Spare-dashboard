import React,{useEffect,useState} from 'react';
import ImportBox from '../components/ImportBox.jsx';
import AIImportAnalyzer from '../components/AIImportAnalyzer.jsx';
import { request } from '../api/client.js';

const types={stock:{label:'Stock',text:'Updates only Available in Store by Material Code.'},open_pr:{label:'Open PR',text:'Updates only PR quantity by Material Code. PR document numbers are never treated as quantities.'},open_po:{label:'Open PO',text:'Updates PO quantity using open / still-to-be-delivered quantity. Vendor is updated when supplied.'}};

export default function Imports({history,filters,options,reload,setNotice}){
  const[departmentCode,setDepartmentCode]=useState(filters.department_code||''),[area,setArea]=useState(filters.area||''),[areas,setAreas]=useState(options.areas||[]),[uploadType,setUploadType]=useState('open_po'),[undoing,setUndoing]=useState(null);
  useEffect(()=>{if(!departmentCode&&options.departments?.length)setDepartmentCode(options.departments[0].department_code)},[departmentCode,options.departments]);
  useEffect(()=>{if(!departmentCode)return;request('/options?'+new URLSearchParams({department_code:departmentCode})).then(x=>{setAreas(x.areas||[]);if(area&&!(x.areas||[]).includes(area))setArea('')}).catch(e=>setNotice(e.message))},[departmentCode]);
  const selectedDepartment=options.departments?.find(d=>d.department_code===departmentCode);
  const undo=async h=>{if(!confirm(`Undo import ${h.file_name}? Only unchanged values from this batch will be restored.`))return;setUndoing(h.id);try{const x=await request(`/import-history/${h.id}/rollback`,{method:'POST'});setNotice(`Undo complete: ${x.restored} materials restored${x.conflicts?.length?`, ${x.conflicts.length} conflicts skipped`:''}`);await reload()}catch(e){setNotice(e.message)}finally{setUndoing(null)}};
  return <>
    <div className="pageTitle"><div><h1>Excel & SAP Updates</h1><p>AI can propose mappings; strict rules still validate Material Code and quantities before Confirm.</p></div></div>
    <AIImportAnalyzer setNotice={setNotice}/>
    <div className="importScope"><label>Department / SAP Code<select value={departmentCode} onChange={e=>{setDepartmentCode(e.target.value);setArea('')}}>{(options.departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}</select></label><label>Area / Sub-area<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Select area</option>{areas.map(a=><option value={a} key={a}>{a}</option>)}</select></label><div className="scopeSummary"><strong>{selectedDepartment?.department_code||departmentCode}</strong><span>→</span><strong>{area||'Select area'}</strong></div></div>
    <div className="importGrid">
      <ImportBox title="Full Spare Master" text="Creates/updates the spare register for the selected Area. Material Code must match 3 letters + 12 digits; blanks are allowed only for no-code spares." preview="/import/master/preview" confirm="/import/master/confirm" departmentCode={departmentCode} area={area} requireArea showDiscipline reload={reload} setNotice={setNotice}/>
      <div><div className="typePicker"><strong>SAP / Procurement Excel Type</strong><div>{Object.entries(types).map(([k,v])=><button type="button" key={k} className={uploadType===k?'active secondary':'secondary'} onClick={()=>setUploadType(k)}>{v.label}</button>)}</div></div><ImportBox key={uploadType} title={`${types[uploadType].label} Update`} text={types[uploadType].text} preview="/import/sap/preview" confirm="/import/sap/confirm" uploadType={uploadType} departmentCode={departmentCode} reload={reload} setNotice={setNotice}/></div>
    </div>
    <div className="fileHelp"><strong>Material Code rule</strong><span>Exactly 3 uppercase letters + 12 digits, e.g. MMT311715050461. AI can map columns, but it cannot override this rule.</span></div>
    <section><h2>Import history</h2><div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Total</th><th>Added</th><th>Updated</th><th>Skipped</th><th>By</th><th>Action</th></tr></thead><tbody>{history.map(h=>{const reversible=h.details?.changes?.length&&!h.details?.rolled_back_at;return <tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{(h.display_type||h.import_type).replaceAll('_',' ')}</td><td>{h.file_name}</td><td>{h.total_rows}</td><td>{h.added_rows}</td><td>{h.updated_rows}</td><td>{h.skipped_rows}</td><td>{h.imported_by_name||'—'}</td><td>{h.details?.rolled_back_at?<span className="muted">Undone</span>:reversible?<button className="link" disabled={undoing===h.id} onClick={()=>undo(h)}>Undo</button>:<span className="muted">—</span>}</td></tr>})}</tbody></table></div></section>
  </>;
}
