import React,{useState} from 'react';
import {request} from '../api/client.js';

const pretty=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export default function UniversalImportInbox({departmentCode,equipment,discipline,reload,setNotice}){
  const[file,setFile]=useState(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[confirming,setConfirming]=useState(false);
  const analyze=async()=>{if(!file)return;setBusy(true);setPreview(null);try{const f=new FormData();f.append('file',file);f.append('department_code',departmentCode||'');f.append('area',equipment||'');const x=await request('/import/universal/preview',{method:'POST',body:f});setPreview(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const confirm=async()=>{if(!file||!preview?.writable)return;setConfirming(true);try{const f=new FormData();f.append('file',file);f.append('department_code',departmentCode||'');f.append('area',equipment||'');f.append('discipline',discipline||'');const x=await request('/import/universal/confirm',{method:'POST',body:f});setNotice(`AI Import complete: ${x.added||0} added, ${x.updated||0} updated, ${x.unchanged||0} unchanged, ${x.skipped||0} skipped.`);setPreview(null);setFile(null);await reload()}catch(e){setNotice(e.message)}finally{setConfirming(false)}};
  return <section className="universalInbox">
    <div className="universalInboxHead"><div><span className="aiBadge">AI-NATIVE IMPORT</span><h2>Drop any SAP / spare Excel</h2><p>LLM interprets each sheet → canonical spare fields → strict validators → preview → safe update. You do not need to choose Master / PR / PO first.</p></div><div className="universalInboxControls"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null)}}/><button disabled={!file||busy} onClick={analyze}>{busy?'Understanding workbook…':'Understand File'}</button></div></div>
    {file&&<div className="universalFile"><strong>{file.name}</strong><span>{departmentCode||'No sub-department'}{equipment?` → ${equipment}`:''}</span></div>}
    {preview&&<div className="universalPreview">
      <div className="universalStats"><div><small>Detected</small><strong>{pretty(preview.fileType)}</strong></div><div><small>Rows</small><strong>{preview.totalRows}</strong></div><div><small>Valid Material Codes</small><strong>{preview.validMaterialRows}</strong></div><div><small>Invalid / No Code</small><strong>{preview.invalidMaterialRows}</strong></div><div><small>Mapper</small><strong>{preview.aiEnabled?'LLM + validator':'Local + validator'}</strong></div></div>
      <div className="universalFields"><strong>Canonical fields found</strong><div>{(preview.fields||[]).filter(x=>!['source_sheet','source_row','file_type','raw_material_code'].includes(x)).slice(0,28).map(x=><span key={x}>{pretty(x)}</span>)}</div></div>
      {(preview.issues||[]).length>0&&<div className="universalWarnings"><strong>{preview.issues.length} validation issue(s)</strong><span>{preview.issues.slice(0,3).map(x=>x.reason).join(' · ')}</span></div>}
      <div className="tableWrap universalTable"><table><thead><tr><th>Sheet</th><th>Row</th><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Required</th><th>Store</th><th>Open PR</th><th>Open PO</th></tr></thead><tbody>{(preview.rows||[]).slice(0,25).map((x,i)=><tr key={`${x.source_sheet}-${x.source_row}-${i}`}><td>{x.source_sheet}</td><td>{x.source_row}</td><td className="code">{x.material_code||'—'}</td><td>{x.spare_name||'—'}</td><td>{x.description||'—'}</td><td>{x.required_qty??'—'}</td><td>{x.store_qty??'—'}</td><td>{x.pr_qty??'—'}</td><td>{x.po_qty??'—'}</td></tr>)}</tbody></table></div>
      <div className="universalActions"><div><strong>{preview.writable?'Validated update path available':'Preview-only data type'}</strong><span>{preview.message}</span></div><button disabled={!preview.writable||confirming} onClick={confirm}>{confirming?'Updating…':'Confirm Validated Import'}</button></div>
    </div>}
  </section>;
}
