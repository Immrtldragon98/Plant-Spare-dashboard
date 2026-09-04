import React,{useEffect,useState} from 'react';
import UniversalImportInbox from '../components/UniversalImportInbox.jsx';
import DataReviewQueue from '../components/DataReviewQueue.jsx';
import ConsumptionImport from '../components/ConsumptionImport.jsx';
import {request} from '../api/client.js';

const disciplines=['','Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];

export default function Imports({filters,options,reload,setNotice,refreshToken=0}){
  const[departmentCode,setDepartmentCode]=useState(filters.department_code||''),[area,setArea]=useState(filters.equipment||filters.area||''),[discipline,setDiscipline]=useState(filters.discipline||''),[areas,setAreas]=useState(options.equipment||options.areas||[]),[history,setHistory]=useState([]),[historyPage,setHistoryPage]=useState(1),[historyPaging,setHistoryPaging]=useState({page:1,page_size:15,total:0,pages:1}),[localRefresh,setLocalRefresh]=useState(0);
  useEffect(()=>{if(!departmentCode&&options.departments?.length)setDepartmentCode(options.departments[0].department_code)},[departmentCode,options.departments]);
  useEffect(()=>{if(!departmentCode)return;request('/options?'+new URLSearchParams({department_code:departmentCode})).then(x=>{const eq=x.equipment||x.areas||[];setAreas(eq);if(area&&!eq.includes(area))setArea('')}).catch(e=>setNotice(e.message))},[departmentCode]);
  const loadHistory=async(page=historyPage)=>{try{const x=await request('/import-history/page?'+new URLSearchParams({page:String(page),page_size:'15'}));setHistory(x.rows||[]);setHistoryPaging(x.pagination||{page,page_size:15,total:0,pages:1})}catch(e){setNotice(e.message)}};
  useEffect(()=>{loadHistory(historyPage)},[historyPage,refreshToken,localRefresh]);
  const refreshAll=async()=>{await reload();setLocalRefresh(x=>x+1);await loadHistory(historyPage)};
  const selectedDepartment=options.departments?.find(d=>d.department_code===departmentCode);
  return <>
    <div className="pageTitle"><div><span className="eyebrow">DATA INGESTION</span><h1>Imports</h1><p>Upload Stock, Open PR or Open PO. AI understands the columns; only existing validated Material Codes are updated.</p></div></div>

    <section className="importContext simpleContextCard"><div><strong>Where does this file belong?</strong><span>Set context once before upload.</span></div><div className="importContextFields"><label>Sub-department<select value={departmentCode} onChange={e=>{setDepartmentCode(e.target.value);setArea('')}}>{(options.departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}</select></label><label>Equipment<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Not required / mixed</option>{areas.map(a=><option value={a} key={a}>{a}</option>)}</select></label><label>Discipline<select value={discipline} onChange={e=>setDiscipline(e.target.value)}>{disciplines.map(d=><option key={d||'blank'} value={d}>{d||'Read from Excel / blank'}</option>)}</select></label></div><div className="contextLine">{selectedDepartment?.department_code||departmentCode||'No department'}{area?` → ${area}`:''}{discipline?` · ${discipline}`:''}</div></section>

    <UniversalImportInbox departmentCode={departmentCode} equipment={area} discipline={discipline} reload={refreshAll} setNotice={setNotice}/>
    <ConsumptionImport reload={refreshAll} setNotice={setNotice}/>

    <details className="reviewPanel"><summary>Review held batches</summary><p className="muted">Only use this when an import has a blocking validation problem.</p><DataReviewQueue refreshToken={refreshToken+localRefresh} setNotice={setNotice}/></details>

    <details className="historyPanel"><summary>Recent imports · {historyPaging.total}</summary><div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Updated</th><th>Skipped</th><th>By</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{String(h.display_type||h.import_type).replaceAll('_',' ')}</td><td>{h.file_name}</td><td>{h.updated_rows}</td><td>{h.skipped_rows}</td><td>{h.imported_by_name||'—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>Showing {history.length} of {historyPaging.total}</span><div><button className="secondary" disabled={historyPaging.page<=1} onClick={()=>setHistoryPage(x=>Math.max(1,x-1))}>Previous</button><span>Page {historyPaging.page} / {historyPaging.pages}</span><button className="secondary" disabled={historyPaging.page>=historyPaging.pages} onClick={()=>setHistoryPage(x=>Math.min(historyPaging.pages,x+1))}>Next</button></div></div></details>
  </>;
}
