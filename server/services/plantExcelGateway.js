import {parseUniversalImport} from './universalImport.js';
import {archiveRawWorkbook,saveCanonicalPreview,stageCanonicalRows,saveIngestionReview,markRawBatch,rawWorkbookStoreEnabled,canonicalStagingEnabled} from './rawWorkbookStore.js';
import {rememberBatchMappings} from './importMappingMemory.js';
import {deterministicTransactionReview} from './transactionReview.js';
import {ingestPlantSnapshots} from './plantDataApi.js';

const clean=v=>String(v??'').trim();

export function snapshotRowsFromCanonical(fileType,rows=[]){
  const byMaterial=new Map(),seenLines=new Set();
  for(const r of rows){
    const code=clean(r.material_code).toUpperCase();if(!code)continue;
    const qty=Number(fileType==='stock'?r.store_qty:fileType==='open_pr'?r.pr_qty:r.po_qty);if(!Number.isFinite(qty))continue;
    const doc=clean(fileType==='open_po'?r.po_number:fileType==='open_pr'?r.pr_number:'');
    const item=clean(fileType==='open_po'?r.po_item:fileType==='open_pr'?r.pr_item:'');
    const lineKey=doc&&item?`${code}|${doc}|${item}|${qty}`:null;if(lineKey&&seenLines.has(lineKey))continue;if(lineKey)seenLines.add(lineKey);
    const current=byMaterial.get(code)||{material_code:code,quantity:0,vendor:null,documents:new Set(),line_count:0,source_rows:[]};
    current.quantity+=qty;current.line_count++;if(r.vendor)current.vendor=r.vendor;if(doc)current.documents.add(doc);if(current.source_rows.length<50)current.source_rows.push({sheet:r.source_sheet,row:r.source_row,document:doc||null,item:item||null,quantity:qty});byMaterial.set(code,current);
  }
  return [...byMaterial.values()].map(x=>({material_code:x.material_code,store_qty:fileType==='stock'?x.quantity:null,pr_qty:fileType==='open_pr'?x.quantity:null,po_qty:fileType==='open_po'?x.quantity:null,vendor:fileType==='open_po'?x.vendor:null,metadata:{aggregated:true,line_count:x.line_count,documents:[...x.documents].slice(0,50),source_rows:x.source_rows}}));
}

async function learnCommittedMapping(parsed,batchId,userId,source){
  if(!batchId||!parsed?.sheetMappings)return {enabled:false,saved:0};
  return rememberBatchMappings({batchId,fileType:parsed.fileType,sheetHeaders:parsed.sheetHeaders||{},sheetMappings:parsed.sheetMappings||{},userId,source});
}

export async function processPlantExcel({file,mode='review',defaultDiscipline='',departmentCode='',equipment='',principal='service',userId=null}){
  if(!file)throw new Error('Excel file is required');
  const normalizedMode=clean(mode).toLowerCase()==='commit'?'commit':'review';
  const raw=await archiveRawWorkbook({file,sourceType:'plant-api-excel',uploadedBy:userId,metadata:{department_code:departmentCode,equipment,principal}});
  const parsed=await parseUniversalImport(file.buffer,defaultDiscipline||'');
  const deterministic=deterministicTransactionReview(parsed);
  let staging={enabled:false,stored:0};

  if(raw.batchId){
    await saveCanonicalPreview(raw.batchId,{file_type:parsed.fileType,row_count:parsed.rows.length,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,department_code:departmentCode,equipment,sheet_headers:parsed.sheetHeaders||{},sheet_mappings:parsed.sheetMappings||{},mapping_memory:parsed.mappingMemory||[]});
    staging=await stageCanonicalRows(raw.batchId,parsed.fileType,parsed.rows||[]);
    await saveIngestionReview({batchId:raw.batchId,reviewType:'deterministic',decision:deterministic.decision,findings:deterministic.findings,summary:deterministic.summary});
    await markRawBatch(raw.batchId,'reviewed');
  }

  const aggregated=['stock','open_pr','open_po'].includes(parsed.fileType)?snapshotRowsFromCanonical(parsed.fileType,parsed.rows||[]):[];
  const mapping={source:parsed.source,confidence:parsed.confidence,memory_used:(parsed.mappingMemory||[]).length>0,ai_used:Boolean(parsed.aiEnabled),sheets:parsed.sheetMappings||{}};
  const base={ok:true,mode:normalizedMode,raw_store:{enabled:raw.enabled,batch_id:raw.batchId,content_hash:raw.contentHash,total_raw_rows:raw.parsed.total_rows,sheets:raw.parsed.sheets.map(s=>({name:s.name,header_row:s.header_row,headers:s.headers,row_count:s.rows.length})),original_archived:raw.originalArchived,storage_provider:raw.storageProvider||'none'},canonical:{file_type:parsed.fileType,rows:parsed.rows.length,aggregated_materials:aggregated.length,source:parsed.source,confidence:parsed.confidence,ai_enabled:parsed.aiEnabled,mapping_memory:parsed.mappingMemory||[],staged:staging,sample:parsed.rows.slice(0,25)},review:{deterministic,mapping}};

  if(normalizedMode==='review')return base;
  if(!await rawWorkbookStoreEnabled())throw new Error('Commit refused: raw evidence storage is not active.');
  if(!await canonicalStagingEnabled())throw new Error('Commit refused: canonical staging is not active.');
  if(!deterministic.writeAllowed){if(raw.batchId)await markRawBatch(raw.batchId,'rejected');throw new Error(`Commit refused: ${deterministic.summary}`)}
  if(!['stock','open_pr','open_po'].includes(parsed.fileType))return {...base,committed:false,needs_human_review:true,message:`${parsed.fileType} was mapped and stored, but automatic update currently supports Stock/Open PR/Open PO only.`};

  const result=await ingestPlantSnapshots({type:parsed.fileType,rows:aggregated,source:`excel:${file.originalname}`,principal,userId});
  if(raw.batchId)await markRawBatch(raw.batchId,'committed',result.batch_id);
  const learned=await learnCommittedMapping(parsed,raw.batchId,userId,'validated-commit');
  return {...base,committed:true,canonical_write:result,learned_mapping:learned};
}
