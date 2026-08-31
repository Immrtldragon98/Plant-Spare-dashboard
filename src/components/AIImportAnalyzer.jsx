import React,{useState} from 'react';
import {request} from '../api/client.js';

const labels={plant:'Plant',material_code:'Material Code',alternate_material_code:'Old / Alternate Material Code',spare_name:'Material Short Text',description:'Description',tracking_id:'PR Tracking No',pr_number:'Purchase Req.',pr_item:'Requisition Item',uom:'Unit',qty:'Qty',planned_pr_qty:'PR Quantity',delivery_qty_lot1:'Delivery Qty Lot 1',delivery_qty_lot2:'Delivery Qty Lot 2',safety_stock:'Safety Stock',stock_p1:'Stock in P1',stock_p2:'Stock in P2',total_stock:'Total Stock',store_qty:'Unrestricted / Store Qty',pr_qty:'Open PR',po_qty:'Open PO',consumption_p2:'Consumption (P2)',consumption_fy24:'Cons 2024 / FY24',consumption_fy25:'Cons 2025 / FY25',consumption_fy26:'Cons 2026 / FY26',consumption_fy27:'Cons 2027 / FY27',consumption_text:'Consumption Text',last_issue_date:'Last Issue Date',ideal_pr_qty:'Ideal PR Qty',vendor_code:'Vendor Code',vendor_name:'Vendor Name',po_number:'PO Number',pr_raised_date:'PR Raised Date',po_raised_date:'PO Raised Date',rate:'Price / Unit Price',total_price:'Total',lead_time_years:'Lead Time',consumption_plan_months:'Consumption Plan (months)',justification:'Justification for Procurement',equipment_description:'Equipment Description',oem_recommended_life:'OEM Recommended Life',failure_root_cause:'Root Cause for Failure',installed_qty:'Installed Qty',cmp_remarks:'CMP Remarks',ved_new:'NEW VED',ved:'VED',indigenous_imported:'Indigenous / Imported',additional_details:'Additional Details',local_repair:'Local & Repair',allowed_qty:'Allowed Qty',expected_date:'Expected Date',out_date:'Out Date',in_date:'In Date'};

export default function AIImportAnalyzer({setNotice,onUseMapping}){
  const[file,setFile]=useState(null),[busy,setBusy]=useState(false),[data,setData]=useState(null);
  const analyze=async()=>{if(!file)return;setBusy(true);setData(null);try{const f=new FormData();f.append('file',file);const x=await request('/import/ai/analyze',{method:'POST',body:f});setData(x)}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const a=data?.analysis||{},mappings=a.mappings||{};
  const use=()=>{if(!file||!a.fileType)return;onUseMapping?.({file,type:a.fileType,mappings,analysis:a});setNotice(`Suggested ${String(a.fileType).replaceAll('_',' ')} mapping applied. Review the next step below.`)};
  return <div className="aiAnalyzer">
    <div><strong>AI-assisted Import Analyzer</strong><p>Upload any Excel first. AI/local intelligence proposes the file type and column meaning; strict validators still control what can enter the database.</p></div>
    <div className="aiAnalyzerControls"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null)}}/><button disabled={!file||busy} onClick={analyze}>{busy?'Analyzing...':'Analyze Excel'}</button></div>
    {data&&<div className="aiResult">
      <div className="aiSummary"><span className={data.aiEnabled?'mapped':'unmapped'}>{data.aiEnabled?'AI enabled':'Local smart mapping'}</span><strong>Suggested type: {(a.fileType||'unknown').replaceAll('_',' ')}</strong>{a.confidence!==undefined&&<span>Confidence: {String(a.confidence)}</span>}</div>
      {Object.keys(mappings).length>0&&<div className="mappingTable"><strong>Suggested column mapping</strong><table><tbody>{Object.entries(mappings).map(([k,v])=><tr key={k}><td>{labels[k]||k}</td><td>←</td><td>{v}</td></tr>)}</tbody></table></div>}
      {a.warnings?.length>0&&<small>Warnings: {a.warnings.join(' · ')}</small>}{data.warning&&<small>{data.warning}</small>}
      <div className="aiNext"><button type="button" onClick={use}>Use Suggested Mapping</button><span>AI maps fields; deterministic rules still decide what is saved or PR-eligible.</span></div>
    </div>}
  </div>;
}
