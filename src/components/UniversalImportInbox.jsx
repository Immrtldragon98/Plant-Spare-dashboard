import React,{useState} from 'react';
import {request} from '../api/client.js';

const pretty=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const supported=new Set(['stock','open_pr','open_po']);

export default function UniversalImportInbox({departmentCode,equipment,discipline,reload,setNotice}){
  const[file,setFile]=useState(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[committing,setCommitting]=useState(false);
  const form=()=>{const f=new FormData();f.append('file',file);f.append('department_code',departmentCode||'');f.append('equipment',equipment||'');f.append('discipline',discipline||'');f.append('mode','review');return f};
  const analyze=async()=>{if(!file)return;setBusy(true);setPreview(null);try{const x=await request('/v1/plant/excel',{method:'POST',body:form()});setPreview(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const commit=async()=>{if(!preview?.raw_store?.batch_id)return;setCommitting(true);try{const x=await request(`/v1/plant/reviews/${preview.raw_store.batch_id}/commit`,{method:'POST',body:JSON.stringify({})});setNotice(`Import complete: ${x.canonical_write?.updated||0} updated, ${x.canonical_write?.unchanged||0} unchanged, ${(x.canonical_write?.missing_material_codes||[]).length} unmatched skipped.`);setFile(null);setPreview(null);await reload()}catch(e){setNotice(e.message)}finally{setCommitting(false)}};
  const det=preview?.review?.deterministic||{},mapping=preview?.review?.mapping||{},matches=preview?.canonical?.material_matches||{},type=preview?.canonical?.file_type||'unknown',invalidSkipped=preview?.canonical?.skipped_invalid_codes||0;
  const canCommit=Boolean(preview&&supported.has(type)&&det.writeAllowed&&preview.canonical?.staged?.enabled&&matches.matched>0);
  const blockers=(det.findings||[]).filter(x=>x.severity==='error');
  return <section className="simpleImport">
    <div className="simpleImportHead"><div><span className="eyebrow">AI IMPORT</span><h2>Upload plant Excel</h2><p>AI finds the Material Code and transaction columns. Only existing Material Codes are updated; everything else is skipped safely.</p></div></div>
    <div className="simpleUploadRow"><label className="simpleFile"><span>{file?file.name:'Choose Excel file'}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/></label><button disabled={!file||busy} onClick={analyze}>{busy?'Reading & mapping…':'Analyse File'}</button></div>
    {file&&<div className="simpleContext">{departmentCode||'No department'}{equipment?` → ${equipment}`:''}{discipline?` · ${discipline}`:''}</div>}
    {preview&&<>
      <div className="simpleImportStats"><div><span>Detected</span><strong>{pretty(type)}</strong></div><div><span>Ready to update</span><strong>{matches.matched??0}</strong></div><div><span>Not in master</span><strong>{matches.missing??0}</strong></div><div><span>Invalid / blank skipped</span><strong>{invalidSkipped}</strong></div></div>
      <div className="mappingSummary"><div><strong>Mapping</strong><span>{mapping.memory_used?'Learned template':mapping.ai_used?'LLM mapping':'Fallback mapping'}{preview.canonical?.confidence?` · ${preview.canonical.confidence} confidence`:''}</span></div><div><strong>Validation</strong><span>{det.blocking?`${det.blocking} blocking issue${det.blocking===1?'':'s'}`:'Safe to update matched materials'}</span></div></div>
      {(matches.missing>0||invalidSkipped>0)&&<div className="plannerAdvisory"><strong>Skipped safely</strong><span>{matches.missing>0?`${matches.missing} valid Material Codes are not in the current master. `:''}{invalidSkipped>0?`${invalidSkipped} rows have blank/invalid Material Codes. `:''}They will not block updates to existing materials.</span></div>}
      {blockers.length>0&&<div className="plannerAdvisory"><strong>Needs attention</strong><span>{blockers.slice(0,4).map(x=>x.message).join(' · ')}</span></div>}
      <details className="simplePreviewRows"><summary>Preview valid mapped rows</summary><div className="tableWrap"><table><thead><tr><th>Material Code</th><th>Spare Name</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Vendor</th></tr></thead><tbody>{(preview.canonical?.sample||[]).map((x,i)=><tr key={`${x.material_code}-${i}`}><td className="code">{x.material_code||'—'}</td><td>{x.spare_name||'—'}</td><td>{x.store_qty??'—'}</td><td>{x.pr_qty??'—'}</td><td>{x.po_qty??'—'}</td><td>{x.vendor||'—'}</td></tr>)}</tbody></table></div></details>
      <div className="simpleCommit"><div><strong>{canCommit?`${matches.matched} existing materials ready to update`:'Not ready to commit'}</strong><span>{canCommit?'Only matched Material Codes will be changed. Unmatched and invalid rows are skipped automatically.':blockers.length?'Fix the blocking issue above.':'No existing Material Codes were matched.'}</span></div><button disabled={!canCommit||committing} onClick={commit}>{committing?'Updating…':'Commit Update'}</button></div>
    </>}
  </section>;
}
