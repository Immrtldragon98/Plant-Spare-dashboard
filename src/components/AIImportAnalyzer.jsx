import React,{useState} from 'react';
import {request} from '../api/client.js';

export default function AIImportAnalyzer({setNotice}){
  const[file,setFile]=useState(null),[busy,setBusy]=useState(false),[data,setData]=useState(null);
  const analyze=async()=>{if(!file)return;setBusy(true);setData(null);try{const f=new FormData();f.append('file',file);const x=await request('/import/ai/analyze',{method:'POST',body:f});setData(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const a=data?.analysis||{};
  return <div className="aiAnalyzer">
    <div><strong>AI-assisted Import Analyzer</strong><p>Upload any Excel first. AI/local intelligence proposes the file type and column meaning; strict validators still control what can enter the database.</p></div>
    <div className="aiAnalyzerControls"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null)}}/><button disabled={!file||busy} onClick={analyze}>{busy?'Analyzing...':'Analyze Excel'}</button></div>
    {data&&<div className="aiResult"><span className={data.aiEnabled?'mapped':'unmapped'}>{data.aiEnabled?'AI enabled':'Local smart mapping'}</span><strong>Suggested type: {(a.fileType||'unknown').replaceAll('_',' ')}</strong>{a.confidence!==undefined&&<span>Confidence: {String(a.confidence)}</span>}{a.mappings&&<small>Mappings: {Object.entries(a.mappings).map(([k,v])=>`${k} → ${v}`).join(' · ')}</small>}{a.warnings?.length>0&&<small>Warnings: {a.warnings.join(' · ')}</small>}{data.warning&&<small>{data.warning}</small>}</div>}
  </div>;
}
