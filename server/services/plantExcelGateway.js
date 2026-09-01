import {parseUniversalImport} from './universalImport.js';
import {archiveRawWorkbook,saveCanonicalPreview,stageCanonicalRows,saveIngestionReview,markRawBatch,rawWorkbookStoreEnabled,canonicalStagingEnabled} from './rawWorkbookStore.js';
import {reviewTransaction} from './transactionReview.js';
import {ingestPlantSnapshots} from './plantDataApi.js';

const clean=v=>String(v??'').trim();

export function snapshotRowsFromCanonical(fileType,rows=[]){
  return rows.map(r=>({
    material_code:r.material_code,
    store_qty:r.store_qty,
    pr_qty:r.pr_qty,
    po_qty:r.po_qty,
    vendor:r.vendor,
    document_number:r.po_number||r.pr_number||r.document_number||null,
    document_item:r.pr_item||r.document_item||null,
    event_date:r.po_raised_date||r.pr_raised_date||r.event_date||null,
    expected_date:r.expected_date||null,
    metadata:{...(r.metadata||{}),source_sheet:r.source_sheet,source_row:r.source_row,tracking_id:r.tracking_id||null}
  }));
}

export async function processPlantExcel({file,mode='review',defaultDiscipline='',departmentCode='',equipment='',principal='service',userId=null}){
  if(!file)throw new Error('Excel file is required');
  const normalizedMode=clean(mode).toLowerCase()==='commit'?'commit':'review';
  const raw=await archiveRawWorkbook({file,sourceType:'plant-api-excel',uploadedBy:userId,metadata:{department_code:departmentCode,equipment,principal}});
  const parsed=await parseUniversalImport(file.buffer,defaultDiscipline||'');
  const review=await reviewTransaction(parsed);
  let staging={enabled:false,stored:0};
  if(raw.batchId){
    await saveCanonicalPreview(raw.batchId,{file_type:parsed.fileType,row_count:parsed.rows.length,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,department_code:departmentCode,equipment});
    staging=await stageCanonicalRows(raw.batchId,parsed.fileType,parsed.rows||[]);
    await saveIngestionReview({batchId:raw.batchId,reviewType:'deterministic',decision:review.deterministic.decision,findings:review.deterministic.findings,summary:review.deterministic.summary});
    await saveIngestionReview({batchId:raw.batchId,reviewType:'llm',decision:review.llm.decision,confidence:review.llm.confidence,model:review.llm.model,findings:review.llm.findings,summary:review.llm.summary});
    await markRawBatch(raw.batchId,'reviewed');
  }
  const base={ok:true,mode:normalizedMode,raw_store:{enabled:raw.enabled,batch_id:raw.batchId,content_hash:raw.contentHash,total_raw_rows:raw.parsed.total_rows,sheets:raw.parsed.sheets.map(s=>({name:s.name,header_row:s.header_row,headers:s.headers,row_count:s.rows.length})),original_archived:raw.originalArchived,storage_provider:raw.storageProvider||'none'},canonical:{file_type:parsed.fileType,rows:parsed.rows.length,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,staged:staging,sample:parsed.rows.slice(0,25)},review};
  if(normalizedMode==='review')return base;
  if(!await rawWorkbookStoreEnabled())throw new Error('Commit refused: raw evidence store migration is not active. Review is available, but full Excel source retention is required before API commit.');
  if(!await canonicalStagingEnabled())return {...base,committed:false,needs_human_review:true,message:'Canonical staging/human-review migration is not active. The batch is preserved and reviewed, but automatic commit is disabled.'};
  if(!review.deterministic.writeAllowed){if(raw.batchId)await markRawBatch(raw.batchId,'rejected');throw new Error(`Commit refused by deterministic validation: ${review.deterministic.summary}`)}
  if(review.llm.decision!=='accept'){if(raw.batchId)await markRawBatch(raw.batchId,'reviewed');return {...base,committed:false,needs_human_review:true,message:`Deterministic validation passed, but LLM review is ${review.llm.decision}. Human review is required before canonical write.`}}
  if(!['stock','open_pr','open_po'].includes(parsed.fileType))return {...base,committed:false,needs_human_review:true,message:`${parsed.fileType} is preserved and reviewed, but Plant API v1 canonical commit currently supports Stock/Open PR/Open PO only.`};
  const result=await ingestPlantSnapshots({type:parsed.fileType,rows:snapshotRowsFromCanonical(parsed.fileType,parsed.rows||[]),source:`excel:${file.originalname}`,principal,userId});
  if(raw.batchId)await markRawBatch(raw.batchId,'committed',result.batch_id);
  return {...base,committed:true,canonical_write:result};
}
