import {parseUniversalImport} from './universalImport.js';
import {parseTypedSapExcel} from '../excel.js';
import {archiveRawWorkbook,saveCanonicalPreview,stageCanonicalRows,saveIngestionReview,markRawBatch,rawWorkbookStoreEnabled,canonicalStagingEnabled} from './rawWorkbookStore.js';
import {rememberBatchMappings} from './importMappingMemory.js';
import {reviewTransaction} from './transactionReview.js';
import {ingestPlantSnapshots} from './plantDataApi.js';

const clean=v=>String(v??'').trim();

export function snapshotRowsFromCanonical(fileType,rows=[]){
  if(fileType==='open_po'||fileType==='open_pr'){
    const byMaterial=new Map(),seenLines=new Set();
    for(const r of rows){const code=clean(r.material_code).toUpperCase();if(!code)continue;const qty=Number(fileType==='open_po'?r.po_qty:r.pr_qty);if(!Number.isFinite(qty))continue;const doc=clean(fileType==='open_po'?r.po_number:r.pr_number),item=clean(fileType==='open_po'?r.po_item:r.pr_item),lineKey=doc&&item?`${code}|${doc}|${item}|${qty}`:null;if(lineKey&&seenLines.has(lineKey))continue;if(lineKey)seenLines.add(lineKey);const current=byMaterial.get(code)||{material_code:code,quantity:0,vendor:null,documents:new Set(),line_count:0,source_rows:[]};current.quantity+=qty;current.line_count++;if(r.vendor)current.vendor=r.vendor;if(doc)current.documents.add(doc);if(current.source_rows.length<50)current.source_rows.push({sheet:r.source_sheet,row:r.source_row,document:doc||null,item:item||null,quantity:qty});byMaterial.set(code,current)}
    return [...byMaterial.values()].map(x=>({material_code:x.material_code,store_qty:null,pr_qty:fileType==='open_pr'?x.quantity:null,po_qty:fileType==='open_po'?x.quantity:null,vendor:fileType==='open_po'?x.vendor:null,document_number:null,document_item:null,event_date:null,expected_date:null,metadata:{aggregated:true,line_count:x.line_count,documents:[...x.documents].slice(0,50),source_rows:x.source_rows}}));
  }
  return rows.map(r=>({material_code:r.material_code,store_qty:r.store_qty,pr_qty:r.pr_qty,po_qty:r.po_qty,vendor:r.vendor,document_number:r.po_number||r.pr_number||r.document_number||null,document_item:r.po_item||r.pr_item||r.document_item||null,event_date:r.po_raised_date||r.pr_raised_date||r.event_date||null,expected_date:r.expected_date||null,metadata:{...(r.metadata||{}),source_sheet:r.source_sheet,source_row:r.source_row,tracking_id:r.tracking_id||null}}));
}

function useProvenTypedParser(buffer,parsed){if(!['stock','open_pr','open_po'].includes(parsed.fileType))return parsed;const typed=parseTypedSapExcel(buffer,parsed.fileType);if(!typed.rows.length)return parsed;const rows=typed.rows.map((r,index)=>({...r,source_sheet:'deterministic-sap',source_row:index+1,file_type:parsed.fileType}));return {...parsed,rows,issues:typed.issues||[],sheetDiagnostics:typed.sheetDiagnostics||[],source:'deterministic-sap-parser',analysis:{...(parsed.analysis||{}),canonicalParser:'typed-sap-v1'}}}

async function learnCommittedMapping(parsed,batchId,userId,source){
  if(!batchId||!parsed?.sheetMappings)return {enabled:false,saved:0};
  return rememberBatchMappings({batchId,fileType:parsed.fileType,sheetHeaders:parsed.sheetHeaders||{},sheetMappings:parsed.sheetMappings||{},userId,source});
}

export async function processPlantExcel({file,mode='review',defaultDiscipline='',departmentCode='',equipment='',principal='service',userId=null}){
  if(!file)throw new Error('Excel file is required');
  const normalizedMode=clean(mode).toLowerCase()==='commit'?'commit':'review',raw=await archiveRawWorkbook({file,sourceType:'plant-api-excel',uploadedBy:userId,metadata:{department_code:departmentCode,equipment,principal}});
  let parsed=await parseUniversalImport(file.buffer,defaultDiscipline||'');parsed=useProvenTypedParser(file.buffer,parsed);const review=await reviewTransaction(parsed);let staging={enabled:false,stored:0};
  if(raw.batchId){await saveCanonicalPreview(raw.batchId,{file_type:parsed.fileType,row_count:parsed.rows.length,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,department_code:departmentCode,equipment,sheet_headers:parsed.sheetHeaders||{},sheet_mappings:parsed.sheetMappings||{},mapping_memory:parsed.mappingMemory||[]});staging=await stageCanonicalRows(raw.batchId,parsed.fileType,parsed.rows||[]);await saveIngestionReview({batchId:raw.batchId,reviewType:'deterministic',decision:review.deterministic.decision,findings:review.deterministic.findings,summary:review.deterministic.summary});await saveIngestionReview({batchId:raw.batchId,reviewType:'llm',decision:review.llm.decision,confidence:review.llm.confidence,model:review.llm.model,findings:review.llm.findings,summary:review.llm.summary});await markRawBatch(raw.batchId,'reviewed')}
  const aggregated=['open_pr','open_po'].includes(parsed.fileType)?snapshotRowsFromCanonical(parsed.fileType,parsed.rows||[]):null,base={ok:true,mode:normalizedMode,raw_store:{enabled:raw.enabled,batch_id:raw.batchId,content_hash:raw.contentHash,total_raw_rows:raw.parsed.total_rows,sheets:raw.parsed.sheets.map(s=>({name:s.name,header_row:s.header_row,headers:s.headers,row_count:s.rows.length})),original_archived:raw.originalArchived,storage_provider:raw.storageProvider||'none'},canonical:{file_type:parsed.fileType,rows:parsed.rows.length,aggregated_materials:aggregated?.length||null,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,mapping_memory:parsed.mappingMemory||[],staged:staging,sample:parsed.rows.slice(0,25)},review};
  if(normalizedMode==='review')return base;
  if(!await rawWorkbookStoreEnabled())throw new Error('Commit refused: raw evidence store migration is not active. Review is available, but full Excel source retention is required before API commit.');
  if(!await canonicalStagingEnabled())return {...base,committed:false,needs_human_review:true,message:'Canonical staging/human-review migration is not active. The batch is preserved and reviewed, but automatic commit is disabled.'};
  if(!review.deterministic.writeAllowed){if(raw.batchId)await markRawBatch(raw.batchId,'rejected');throw new Error(`Commit refused by deterministic validation: ${review.deterministic.summary}`)}
  if(review.llm.decision==='reject'){if(raw.batchId)await markRawBatch(raw.batchId,'reviewed');return {...base,committed:false,needs_human_review:true,message:'Deterministic parsing passed, but LLM found a semantic risk. Human review is required before canonical write.'}}
  if(!['stock','open_pr','open_po'].includes(parsed.fileType))return {...base,committed:false,needs_human_review:true,message:`${parsed.fileType} is preserved and reviewed, but Plant API v1 canonical commit currently supports Stock/Open PR/Open PO only.`};
  const result=await ingestPlantSnapshots({type:parsed.fileType,rows:aggregated||snapshotRowsFromCanonical(parsed.fileType,parsed.rows||[]),source:`excel:${file.originalname}`,principal,userId});if(raw.batchId)await markRawBatch(raw.batchId,'committed',result.batch_id);const learned=await learnCommittedMapping(parsed,raw.batchId,userId,'clean-commit');
  return {...base,committed:true,canonical_write:result,learned_mapping:learned};
}
