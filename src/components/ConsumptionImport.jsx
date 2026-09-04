import React,{useState} from 'react';
import {request} from '../api/client.js';

export default function ConsumptionImport({setNotice,reload}){
  const[file,setFile]=useState(null),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
  const upload=async()=>{if(!file||busy)return;setBusy(true);setResult(null);try{const fd=new FormData();fd.append('file',file);const x=await request('/material-consumption/import',{method:'POST',body:fd});setResult(x);setNotice(`Consumption history: ${x.recorded} movements added, ${x.duplicates_skipped} duplicates skipped.`);await reload?.()}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  return <section className="consumptionImport">
    <div className="simpleImportHead"><div><span className="eyebrow">CONSUMPTION HISTORY</span><h2>Upload SAP material movements</h2><p>Upload MB51-style Excel/CSV data. Confirmed consumption uses 201, 261 and 551; reversals 202 and 262 are deducted. Stock snapshots never count as consumption.</p></div></div>
    <div className="simpleUploadRow"><label className="simpleFile"><span>{file?file.name:'Choose SAP movement file'}</span><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null)}}/></label><button disabled={!file||busy} onClick={upload}>{busy?'Importing movements…':'Import Consumption'}</button></div>
    <p className="muted">Required columns: Material, Movement Type, Quantity and Posting Date. Material Document, Item and UOM are optional.</p>
    {result&&<div className="simpleImportStats"><div><span>Rows</span><strong>{result.total_rows}</strong></div><div><span>Recorded</span><strong>{result.recorded}</strong></div><div><span>Duplicates skipped</span><strong>{result.duplicates_skipped}</strong></div><div><span>Unmatched materials</span><strong>{result.unmatched_materials}</strong></div></div>}
  </section>;
}
