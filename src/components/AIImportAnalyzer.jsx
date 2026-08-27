import React,{useState} from 'react';
import {request} from '../api/client.js';

const labels={material_code:'Material Code',spare_name:'Spare Name',description:'Description',qty:'Qty',vendor_code:'Vendor Code',vendor_name:'Vendor Name',pr_number:'PR Number',po_number:'PO Number',pr_raised_date:'PR Raised Date',po_raised_date:'PO Raised Date',rate:'Rate',expected_date:'Expected Date',out_date:'Out Date',in_date:'In Date',store_qty:'Store Qty',pr_qty:'PR Qty',po_qty:'PO Qty'};

export default function AIImportAnalyzer({setNotice,onUseMapping}){
  const[file,setFile]=useState(null),[busy,setBusy]=useState(false),[data,setData]=useState(null);
  const analyze=async()=>{if(!file)return;setBusy(true);setData(null);try{const f=new FormData();f.append('file',file);const x=await request('/import/ai/analyze',{method:'POST',body:f});setData(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const a=data?.analysis||{},mappings=a.mappings||{};
  const use=()=>{if(!file||!a.fileType)return;onUseMapping?.({file,type:a.fileType,mappings,analysis:a});setNotice(`Suggested ${String(a.fileType).replaceAll('_',' ')} mapping applied. Review the preview below before confirming.`)};
  return <div className="aiAnalyzer">
    <div><strong>AI-assisted Import Analyzer</strong><p>Upload any Excel first. AI/local intelligence proposes the file type and column meaning; strict validators still control what can enter the database.</p></div>
    <div className="aiAnalyzerControls"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null)}}/><button disabled={!file||busy} onClick={analyze}>{busy?'Analyzing...':'Analyze Excel'}</button></div>
    {data&&<div className="aiResult">
      <div className="aiSummary"><span className={data.aiEnabled?'mapped':'unmapped'}>{data.aiEnabled?'AI enabled':'Local smart mapping'}</span><strong>Suggested type: {(a.fileType||'unknown').replaceAll('_',' ')}</strong>{a.confidence!==undefined&&<span>Confidence: {String(a.confidence)}</span>}</div>
      {Object.keys(mappings).length>0&&<div className="mappingTable"><strong>Suggested column mapping</strong><table><tbody>{Object.entries(mappings).map(([k,v])=><tr key={k}><td>{labels[k]||k}</td><td>←</td><td>{v}</td></tr>)}</tbody></table></div>}
      {a.warnings?.length>0&&<small>Warnings: {a.warnings.join(' · ')}</small>}{data.warning&&<small>{data.warning}</small>}
      <div className="aiNext"><button type="button" onClick={use}>Use Suggested Mapping</button><span>Next: Preview → Confirm Import</span></div>
    </div>}
  </div>;
}
