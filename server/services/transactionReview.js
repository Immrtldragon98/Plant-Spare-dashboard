import {providerConfig,callChatModel} from '../ai/provider.js';

const codeRx=/^[A-Z]{3}\d{12}$/;
const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
const quantityField=type=>type==='stock'?'store_qty':type==='open_pr'?'pr_qty':type==='open_po'?'po_qty':type==='master'?'required_qty':null;

export function deterministicTransactionReview(parsed){
  const type=parsed?.fileType||'unknown',rows=Array.isArray(parsed?.rows)?parsed.rows:[],findings=[];
  const qField=quantityField(type),seen=new Map(),seenLine=new Set(),lineItemMode=type==='open_pr'||type==='open_po';let blocking=0,warnings=0;
  if(!rows.length){findings.push({severity:'error',code:'NO_ROWS',message:'No canonical rows were produced from the workbook'});blocking++}
  if(type==='unknown'){findings.push({severity:'error',code:'UNKNOWN_TYPE',message:'Workbook transaction type could not be determined'});blocking++}
  rows.forEach((row,index)=>{
    const code=String(row.material_code||'').trim().toUpperCase();
    if(!code){
      const severity=type==='master'?'warning':'error';findings.push({severity,code:'MISSING_MATERIAL_CODE',row:index+1,message:type==='master'?'Master row has no Material Code and needs explicit review':'Transaction row is missing exact Material Code'});severity==='error'?blocking++:warnings++;return;
    }
    if(!codeRx.test(code)){findings.push({severity:'error',code:'INVALID_MATERIAL_CODE',row:index+1,material_code:code,message:'Material Code must be exactly 3 uppercase letters + 12 digits'});blocking++}
    if(qField){const qty=n(row[qField]);if(qty===null){findings.push({severity:'warning',code:'MISSING_QUANTITY',row:index+1,material_code:code,field:qField,message:`No numeric ${qField} value was mapped`});warnings++}else if(qty<0){findings.push({severity:'error',code:'NEGATIVE_QUANTITY',row:index+1,material_code:code,field:qField,value:qty,message:'Negative quantity is not allowed for a current snapshot'});blocking++}}
    if(!code)return;
    if(lineItemMode){
      const doc=type==='open_po'?String(row.po_number||'').trim():String(row.pr_number||'').trim();
      const item=type==='open_po'?String(row.po_item||'').trim():String(row.pr_item||'').trim();
      const qty=n(row[qField]);
      const lineKey=doc&&item?`${code}|${doc}|${item}`:null;
      if(lineKey){
        const fp=`${lineKey}|${qty}`;
        if(seenLine.has(fp)){findings.push({severity:'warning',code:'DUPLICATE_TRANSACTION_LINE',row:index+1,material_code:code,message:'Exact procurement line appears more than once and will be de-duplicated before aggregation'});warnings++}
        seenLine.add(fp);
      }
      return;
    }
    const fingerprint=qField?String(n(row[qField])):JSON.stringify([row.spare_name,row.part_number,row.required_qty]);
    if(seen.has(code)&&seen.get(code)!==fingerprint){findings.push({severity:'error',code:'CONFLICTING_DUPLICATE',row:index+1,material_code:code,message:`Same Material Code appears with conflicting ${qField||'master'} values`});blocking++}
    else if(seen.has(code)){findings.push({severity:'warning',code:'DUPLICATE_ROW',row:index+1,material_code:code,message:'Duplicate Material Code row carries the same mapped value'});warnings++}
    else seen.set(code,fingerprint);
  });
  const decision=blocking?'reject':warnings?'warn':'accept';
  return {review_type:'deterministic',decision,blocking,warnings,findings,writeAllowed:blocking===0,summary:`${rows.length} canonical rows · ${blocking} blocking issues · ${warnings} warnings`};
}

function parseJson(raw){try{return JSON.parse(String(raw||'{}').replace(/^```json\s*/i,'').replace(/```$/,'').trim())}catch{return null}}

export async function llmTransactionReview(parsed,deterministic){
  const cfg=providerConfig();
  if(!cfg.configured)return {review_type:'llm',decision:'unavailable',confidence:null,model:null,findings:[],summary:'LLM review unavailable; deterministic validation remains authoritative.'};
  const rows=(parsed.rows||[]).slice(0,60).map(r=>({material_code:r.material_code,spare_name:r.spare_name,description:r.description,uom:r.uom,store_qty:r.store_qty,pr_qty:r.pr_qty,po_qty:r.po_qty,required_qty:r.required_qty,vendor:r.vendor,po_number:r.po_number,po_item:r.po_item,pr_number:r.pr_number,pr_item:r.pr_item,source_sheet:r.source_sheet,source_row:r.source_row}));
  const prompt=`Review an industrial plant Excel ingestion mapping. You are a semantic reviewer only. Deterministic validation is authoritative for identifiers and quantities.

Decision policy is strict:
- accept: mapping and transaction meaning look correct, with no notable advisory findings.
- warn: mapping is still safe to commit, but there are planner advisories such as unusually high/low quantities, fractional quantities, multiple vendors, unusual UOM, or other plausible business outliers. WARN MUST NOT mean the mapping is unsafe.
- reject: use ONLY when there is a semantic integrity/mapping risk that could write the wrong field or transaction, such as wrong file type, Store/PR/PO cross-mapping, Material Code column confusion, quantity column mapped to Spare Name/Description, or another schema interpretation that could corrupt canonical data.

For Open PO and Open PR, repeated Material Codes on different document/item lines are normal and should be aggregated, not treated as conflicts. Multiple vendors for the same Material Code can also be legitimate. Fractional quantities can be valid when UOM is KG/M/L or other non-EA units; check UOM when present. A quantity merely being large (for example 1000) is advisory, not a mapping rejection. Numeric PO/PR item numbers must not be treated as Spare Name or Description. If a descriptive field is uncertain, blank is preferable to an invented mapping. Never invent missing data.

Return only JSON {"decision":"accept|warn|reject","confidence":0.0,"summary":"...","findings":[{"severity":"advisory|error","code":"...","message":"...","material_code":"optional"}]}.
Mapping/source=${parsed.source}; confidence=${parsed.confidence}; deterministic=${JSON.stringify({decision:deterministic.decision,blocking:deterministic.blocking,warnings:deterministic.warnings,findings:deterministic.findings.slice(0,20)})}; sampleRows=${JSON.stringify(rows)}`;
  try{
    const body=await callChatModel(cfg,[{role:'system',content:'You review plant spare-material ingestion for semantic mapping integrity. Business outliers are advisory; only mapping/integrity risks justify rejection.'},{role:'user',content:prompt}],{withTools:false,temperature:0});
    const parsedJson=parseJson(body?.choices?.[0]?.message?.content);if(!parsedJson)throw new Error('LLM returned non-JSON review');
    const decision=['accept','warn','reject'].includes(parsedJson.decision)?parsedJson.decision:'warn';
    const findings=Array.isArray(parsedJson.findings)?parsedJson.findings.slice(0,40).map(f=>({...f,severity:f?.severity==='error'?'error':'advisory'})):[];
    return {review_type:'llm',decision,confidence:Number.isFinite(Number(parsedJson.confidence))?Math.max(0,Math.min(1,Number(parsedJson.confidence))):null,model:cfg.model,provider:cfg.provider,findings,summary:String(parsedJson.summary||'LLM semantic review completed').slice(0,800)};
  }catch(error){return {review_type:'llm',decision:'unavailable',confidence:null,model:cfg.model,provider:cfg.provider,findings:[],summary:`LLM review unavailable: ${error.message}`}}
}

export async function reviewTransaction(parsed){
  const deterministic=deterministicTransactionReview(parsed),llm=await llmTransactionReview(parsed,deterministic);
  return {deterministic,llm,final:{writeAllowed:deterministic.writeAllowed,decision:deterministic.writeAllowed?(llm.decision==='reject'?'needs-human-review':llm.decision==='warn'?'commit-with-advisory':deterministic.decision):'reject',note:'LLM advisories do not block a deterministic-clean transaction. Only semantic rejection requires human review.'}};
}
