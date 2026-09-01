import React,{useEffect,useState} from 'react';
import ImportBox from '../components/ImportBox.jsx';
import AIImportAnalyzer from '../components/AIImportAnalyzer.jsx';
import UniversalImportInbox from '../components/UniversalImportInbox.jsx';
import { request } from '../api/client.js';

const disciplines=['','Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
const types={
  stock:{label:'Stock',text:'Updates only Available in Store by Material Code.'},
  open_pr:{label:'Open PR',text:'PR Qty uses Order Quantity. PR document numbers are never treated as quantities.'},
  open_po:{label:'Open PO',text:'PO Qty uses Still to be delivered (qty). Vendor Name is updated when supplied.'},
  pr_planning:{label:'PR Planning',text:'Screens Safety Stock, Total Stock, Consumption, Last Issue, current PR/PO, Price, Lead Time and Justification to identify PR-eligible spares.',planning:true},
  rgp:{label:'RGP',text:'AI maps Material Code, Spare Name, Description, Qty, Vendor Name, Out Date, In Date and Expected Return Date.',transaction:true},
  nrgp:{label:'NRGP',text:'AI maps Material Code, Spare Name, Description, Qty, Vendor Name, Out Date, In Date and Expected Date.',transaction:true}
};

export default function Imports({filters,options,reload,setNotice,refreshToken=0}){
  const[departmentCode,setDepartmentCode]=useState(filters.department_code||''),[area,setArea]=useState(filters.equipment||filters.area||''),[discipline,setDiscipline]=useState(filters.discipline||''),[areas,setAreas]=useState(options.equipment||options.areas||[]),[uploadType,setUploadType]=useState('open_po'),[undoing,setUndoing]=useState(null),[analyzedFile,setAnalyzedFile]=useState(null),[history,setHistory]=useState([]),[historyPage,setHistoryPage]=useState(1),[historyPaging,setHistoryPaging]=useState({page:1,page_size:25,total:0,pages:1}),[historyLoading,setHistoryLoading]=useState(false);
  useEffect(()=>{if(!departmentCode&&options.departments?.length)setDepartmentCode(options.departments[0].department_code)},[departmentCode,options.departments]);
  useEffect(()=>{if(!departmentCode)return;request('/options?'+new URLSearchParams({department_code:departmentCode})).then(x=>{const eq=x.equipment||x.areas||[];setAreas(eq);if(area&&!eq.includes(area))setArea('')}).catch(e=>setNotice(e.message))},[departmentCode]);
  const loadHistory=async(page=historyPage)=>{setHistoryLoading(true);try{const x=await request('/import-history/page?'+new URLSearchParams({page:String(page),page_size:'25'}));setHistory(x.rows||[]);setHistoryPaging(x.pagination||{page,page_size:25,total:(x.rows||[]).length,pages:1})}catch(e){setNotice(e.message)}finally{setHistoryLoading(false)}};
  useEffect(()=>{loadHistory(historyPage)},[historyPage,refreshToken]);
  const selectedDepartment=options.departments?.find(d=>d.department_code===departmentCode);
  const useMapping=({file,type})=>{
    if(['stock','open_pr','open_po','rgp','nrgp','pr_planning'].includes(type)){setUploadType(type);setAnalyzedFile(file);setTimeout(()=>document.getElementById('typed-import')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
    else if(type==='master'){setAnalyzedFile(file);setTimeout(()=>document.getElementById('master-import')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
    else setNotice(`Unknown import type: ${type}`)
  };
  const undo=async h=>{if(!confirm(`Undo import ${h.file_name}? Only unchanged values from this batch will be restored.`))return;setUndoing(h.id);try{const x=await request(`/import-history/${h.id}/rollback`,{method:'POST'});setNotice(`Undo complete: ${x.restored} materials restored${x.conflicts?.length?`, ${x.conflicts.length} conflicts skipped`:''}`);await reload();await loadHistory(historyPage)}catch(e){setNotice(e.message)}finally{setUndoing(null)}};
  const refreshAll=async()=>{await reload();await loadHistory(historyPage)};
  return <>
    <div className="pageTitle"><div><h1>AI Import & SAP Updates</h1><p>Use the AI Inbox first. Advanced typed imports remain available as compatibility tools while the universal pipeline matures.</p></div></div>
    <div className="importScope">
      <label>Sub-department Code<select value={departmentCode} onChange={e=>{setDepartmentCode(e.target.value);setArea('')}}>{(options.departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}</select></label>
      <label>Equipment<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Select equipment</option>{areas.map(a=><option value={a} key={a}>{a}</option>)}</select></label>
      <label>Default Discipline<select value={discipline} onChange={e=>setDiscipline(e.target.value)}>{disciplines.map(d=><option key={d||'blank'} value={d}>{d||'No default / read from Excel'}</option>)}</select></label>
      <div className="scopeSummary"><strong>{selectedDepartment?.department_code||departmentCode}</strong><span>→</span><strong>{area||'Select equipment'}</strong><span>·</span><strong>{discipline||'Excel / blank discipline'}</strong></div>
    </div>
    <UniversalImportInbox departmentCode={departmentCode} equipment={area} discipline={discipline} reload={refreshAll} setNotice={setNotice}/>

    <details className="advancedImports"><summary>Advanced / legacy import tools</summary>
      <AIImportAnalyzer setNotice={setNotice} onUseMapping={useMapping}/>
      <div className="importGrid">
        <div id="master-import"><ImportBox title="Full Spare Master" text="Compatibility master parser with no-code handling. Universal Import is the primary path." preview="/import/master/preview" confirm="/import/master/confirm" departmentCode={departmentCode} area={area} requireArea showDiscipline initialFile={analyzedFile} reload={refreshAll} setNotice={setNotice}/></div>
        <div id="typed-import"><div className="typePicker"><strong>SAP / Procurement Excel Type</strong><div>{Object.entries(types).map(([k,v])=><button type="button" key={k} className={uploadType===k?'active secondary':'secondary'} onClick={()=>setUploadType(k)}>{v.label}</button>)}</div></div>{types[uploadType].planning?<ImportBox key="pr_planning" title="PR Planning / Criticality Screen" text={types[uploadType].text} preview="/pr-planning/preview" confirm={null} departmentCode={departmentCode} area={area} initialFile={analyzedFile} reload={refreshAll} setNotice={setNotice}/>:types[uploadType].transaction?<div className="importBox"><h2>{types[uploadType].label} Import</h2><p>{types[uploadType].text}</p><div className="importDestination"><span>Destination</span><strong>{departmentCode}{area?` → ${area}`:''}</strong></div><div className="fileHelp"><strong>AI mapping ready</strong><span>Use Analyze Excel above to map the file. Historical RGP/NRGP transaction storage remains guarded until dedicated storage is enabled.</span></div></div>:<ImportBox key={uploadType} title={`${types[uploadType].label} Update`} text={types[uploadType].text} preview="/import/sap/preview" confirm="/import/sap/confirm" uploadType={uploadType} departmentCode={departmentCode} initialFile={analyzedFile} reload={refreshAll} setNotice={setNotice}/>}</div>
      </div>
    </details>
    <div className="fileHelp"><strong>Discipline priority</strong><span>If Excel contains Discipline / Trade / Category, that row-level value wins. Otherwise the selected Default Discipline is applied. LLM understands the workbook; backend still validates Material Code, quantities and duplicate identity.</span></div>
    <section><h2>Import history</h2><div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Total</th><th>Added</th><th>Updated</th><th>Skipped</th><th>By</th><th>Action</th></tr></thead><tbody>{history.map(h=>{const reversible=h.details?.changes?.length&&!h.details?.rolled_back_at;return <tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{(h.display_type||h.import_type).replaceAll('_',' ')}</td><td>{h.file_name}</td><td>{h.total_rows}</td><td>{h.added_rows}</td><td>{h.updated_rows}</td><td>{h.skipped_rows}</td><td>{h.imported_by_name||'—'}</td><td>{h.details?.rolled_back_at?<span className="muted">Undone</span>:reversible?<button className="link" disabled={undoing===h.id} onClick={()=>undo(h)}>Undo</button>:<span className="muted">—</span>}</td></tr>})}</tbody></table></div><div className="pagination"><span>{historyLoading?'Loading…':`Showing ${history.length} of ${historyPaging.total} batches`}</span><div><button className="secondary" disabled={historyLoading||historyPaging.page<=1} onClick={()=>setHistoryPage(x=>Math.max(1,x-1))}>Previous</button><span> Page {historyPaging.page} / {historyPaging.pages} </span><button className="secondary" disabled={historyLoading||historyPaging.page>=historyPaging.pages} onClick={()=>setHistoryPage(x=>Math.min(historyPaging.pages,x+1))}>Next</button></div></div></section>
  </>;
}
