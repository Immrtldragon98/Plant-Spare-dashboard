import React,{useState} from 'react';
import {request} from '../api/client.js';

const pretty=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const supported=new Set(['stock','open_pr','open_po']);

export default function UniversalImportInbox({departmentCode,equipment,discipline,reload,setNotice}){
  const[file,setFile]=useState(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[committing,setCommitting]=useState(false);
  const form=()=>{const f=new FormData();f.append('file',file);f.append('department_code',departmentCode||'');f.append('equipment',equipment||'');f.append('discipline',discipline||'');f.append('mode','review');return f};
  const analyze=async()=>{if(!file)return;setBusy(true);setPreview(null);try{const x=await request('/v1/plant/excel',{method:'POST',body:form()});setPreview(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const commit=async()=>{if(!preview?.raw_store?.batch_id)return;setCommitting(true);try{const x=await request(`/v1/plant/reviews/${preview.raw_store.batch_id}/commit`,{method:'POST',body:JSON.stringify({})});setNotice(`Import complete: ${x.canonical_write?.updated||0} updated, ${x.canonical_write?.unchanged||0} unchanged, ${(x.canonical_write?.missing_material_codes||[]).length} unmatched skipped.`);setFile(null);setPreview(null);await reload()}catch(e){setNotice(e.message)}finally{setCommitting(false)}};
  const det=preview?.review?.deterministic||{},mapping=preview?.review?.mapping||{},matches=preview?.canonical?.material_matches||{},type=preview?.canonical?.file_type||'unknown';
  const canCommit=Boolean(preview&&supported.has(type)&&det.writeAllowed&&preview.canonical?.staged?.enabled);
  return <section className="simpleImport">
    <div className="simpleImportHead"><div><span className="eyebrow">AI IMPORT</span><h2>Upload plant Excel</h2><p>AI maps the sheet once. The backend updates only valid existing Material Codes.</p></div></div>
    <div className="simpleUploadRow"><label className="simpleFile"><span>{file?file.name:'Choose Excel file'}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/></label><button disabled={!file||busy} onClick={analyze}>{busy?'Reading & mapping…':'Analyse File'}</button></div>
    {file&&<div className="simpleContext">{departmentCode||'No department'}{equipment?` → ${equipment}`:''}{discipline?` · ${discipline}`:''}</div>}
    {preview&&<>
      <div className="simpleImportStats"><div><span>Detected</span><strong>{pretty(type)}</strong></div><div><span>Existing matches</span><strong>{matches.matched??0}</strong></div><div><span>Unmatched</span><strong>{matches.missing??0}</strong></div><div><span>Rows mapped</span><strong>{preview.canonical?.rows??0}</strong></div></div>
      <div className="mappingSummary"><div><strong>Mapping</strong><span>{mapping.memory_used?'Learned template':mapping.ai_used?'LLM mapping':'Fallback mapping'}{preview.canonical?.confidence?` · ${preview.canonical.confidence} confidence`:''}</span></div><div><strong>Validation</strong><span>{det.summary||'Validation complete'}</span></div></div>
      {matches.missing>0&&<div className="plannerAdvisory"><strong>{matches.missing} Material Codes are not in the current master</strong><span>They will be skipped. Existing materials will still update normally.</span></div>}
      {det.findings?.length>0&&<div className="plannerAdvisory"><strong>Needs attention</strong><span>{det.findings.slice(0,4).map(x=>x.message).join(' · ')}</span></div>}
      <details className="simplePreviewRows"><summary>Preview mapped rows</summary><div className="tableWrap"><table><thead><tr><th>Material Code</th><th>Spare Name</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Vendor</th></tr></thead><tbody>{(preview.canonical?.sample||[]).map((x,i)=><tr key={`${x.material_code}-${i}`}><td className="code">{x.material_code||'—'}</td><td>{x.spare_name||'—'}</td><td>{x.store_qty??'—'}</td><td>{x.pr_qty??'—'}</td><td>{x.po_qty??'—'}</td><td>{x.vendor||'—'}</td></tr>)}</tbody></table></div></details>
      <div className="simpleCommit"><div><strong>{canCommit?'Ready to update existing materials':'Not ready to commit'}</strong><span>{canCommit?'Only matched Material Codes and the detected quantity field will be updated.':'Fix the blocking validation issue or confirm the file is Stock / Open PR / Open PO.'}</span></div><button disabled={!canCommit||committing} onClick={commit}>{committing?'Updating…':'Commit Update'}</button></div>
    </>}
  </section>;
}
