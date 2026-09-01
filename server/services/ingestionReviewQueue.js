import {q} from '../db.js';
import {canonicalStagingEnabled,getStagedCanonicalRows,markRawBatch} from './rawWorkbookStore.js';
import {deterministicTransactionReview} from './transactionReview.js';
import {ingestPlantSnapshots} from './plantDataApi.js';
import {snapshotRowsFromCanonical} from './plantExcelGateway.js';

const clean=v=>String(v??'').trim();

export async function reviewQueueStatus(){return {enabled:await canonicalStagingEnabled()}}

export async function listReviewQueue({status='reviewed',page=1,page_size=25}={}){
  if(!await canonicalStagingEnabled())return {enabled:false,rows:[],pagination:null};
  const p=Math.max(Number(page)||1,1),ps=Math.min(Math.max(Number(page_size)||25,10),100),offset=(p-1)*ps;
  const allowed=new Set(['received','reviewed','committed','rejected','failed','all']),s=allowed.has(clean(status))?clean(status):'reviewed';
  const where=s==='all'?'TRUE':'b.status=$1',params=s==='all'?[]:[s];
  const total=Number((await q(`SELECT COUNT(*)::int total FROM raw_upload_batches b WHERE ${where}`,params)).rows[0]?.total||0);
  const rows=(await q(`SELECT b.id,b.source_name,b.source_type,b.status,b.workbook_meta,b.original_archived,b.storage_provider,b.import_history_id,b.uploaded_at,b.updated_at,u.name uploaded_by_name,
    (SELECT json_build_object('decision',r.decision,'confidence',r.confidence,'model',r.model,'summary',r.summary,'findings',r.findings,'created_at',r.created_at) FROM ingestion_reviews r WHERE r.batch_id=b.id AND r.review_type='deterministic' ORDER BY r.created_at DESC LIMIT 1) deterministic_review,
    (SELECT json_build_object('decision',r.decision,'confidence',r.confidence,'model',r.model,'summary',r.summary,'findings',r.findings,'created_at',r.created_at) FROM ingestion_reviews r WHERE r.batch_id=b.id AND r.review_type='llm' ORDER BY r.created_at DESC LIMIT 1) llm_review,
    (SELECT json_build_object('decision',h.decision,'note',h.note,'reviewed_at',h.reviewed_at,'reviewed_by',hu.name) FROM ingestion_human_reviews h LEFT JOIN users hu ON hu.id=h.reviewed_by WHERE h.batch_id=b.id LIMIT 1) human_review
    FROM raw_upload_batches b LEFT JOIN users u ON u.id=b.uploaded_by WHERE ${where} ORDER BY b.uploaded_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,ps,offset])).rows;
  return {enabled:true,rows,pagination:{page:p,page_size:ps,total,pages:Math.max(Math.ceil(total/ps),1)}};
}

async function batchAndStaging(batchId){
  const batch=(await q(`SELECT * FROM raw_upload_batches WHERE id=$1`,[batchId])).rows[0];if(!batch)throw new Error('Ingestion batch not found');
  const staged=await getStagedCanonicalRows(batch.id);if(!staged.rows.length)throw new Error('No staged canonical rows are available for this batch');
  if(!['stock','open_pr','open_po'].includes(staged.fileType))throw new Error(`${staged.fileType||'Unknown'} batches are not yet supported for canonical commit`);
  const deterministic=deterministicTransactionReview({fileType:staged.fileType,rows:staged.rows});
  if(!deterministic.writeAllowed)throw new Error(`Commit blocked by deterministic validation: ${deterministic.summary}`);
  return {batch,staged,deterministic};
}

async function commitStaged({batch,staged,deterministic,principal,userId,sourcePrefix}){
  const result=await ingestPlantSnapshots({type:staged.fileType,rows:snapshotRowsFromCanonical(staged.fileType,staged.rows),source:`${sourcePrefix}:${batch.source_name}`,principal,userId});
  await markRawBatch(batch.id,'committed',result.batch_id);
  return {ok:true,committed:true,batch_id:batch.id,status:'committed',deterministic,canonical_write:result};
}

export async function commitReviewedBatch({batchId,principal='service',userId=null}){
  if(!await canonicalStagingEnabled())throw new Error('Canonical staging/review migration is not active');
  const {batch,staged,deterministic}=await batchAndStaging(batchId);
  if(batch.status==='committed')throw new Error('This batch is already committed');
  if(batch.status==='rejected')throw new Error('Rejected batch cannot be automatically committed');
  const llm=(await q(`SELECT decision,confidence,model,summary FROM ingestion_reviews WHERE batch_id=$1 AND review_type='llm' ORDER BY created_at DESC LIMIT 1`,[batch.id])).rows[0];
  if(!llm||llm.decision!=='accept')return {ok:true,committed:false,needs_human_review:true,batch_id:batch.id,llm,message:`Automatic commit requires LLM semantic acceptance. Current decision: ${llm?.decision||'missing'}.`};
  return commitStaged({batch,staged,deterministic,principal,userId,sourcePrefix:'reviewed'});
}

async function saveHumanDecision(batchId,decision,note,userId){
  return (await q(`INSERT INTO ingestion_human_reviews(batch_id,decision,note,reviewed_by) VALUES($1,$2,$3,$4) ON CONFLICT(batch_id) DO UPDATE SET decision=EXCLUDED.decision,note=EXCLUDED.note,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW() RETURNING *`,[batchId,decision,note||null,userId])).rows[0];
}

export async function decideIngestionBatch({batchId,decision,note='',user}){
  if(!await canonicalStagingEnabled())throw new Error('Human review migration is not active');
  const d=clean(decision).toLowerCase();if(!['approve','reject'].includes(d))throw new Error('Decision must be approve or reject');
  const batch=(await q(`SELECT * FROM raw_upload_batches WHERE id=$1`,[batchId])).rows[0];if(!batch)throw new Error('Ingestion batch not found');
  if(batch.status==='committed')throw new Error('This batch is already committed');
  if(batch.status==='rejected'&&d==='approve')throw new Error('Rejected batch cannot be approved without a new review/upload');
  if(d==='reject'){
    const human=await saveHumanDecision(batch.id,'reject',note,user.id);await markRawBatch(batch.id,'rejected');
    return {ok:true,committed:false,batch_id:batch.id,status:'rejected',human_review:human};
  }
  const checked=await batchAndStaging(batch.id),human=await saveHumanDecision(batch.id,'approve',note,user.id);
  try{
    const out=await commitStaged({batch:checked.batch,staged:checked.staged,deterministic:checked.deterministic,principal:user.name||user.email||'planner',userId:user.id,sourcePrefix:'human-approved'});
    return {...out,human_review:human};
  }catch(error){
    await q(`UPDATE ingestion_human_reviews SET note=COALESCE(note,'') || $1 WHERE batch_id=$2`,[`\nCommit failed: ${String(error.message||error).slice(0,500)}`,batch.id]);throw error;
  }
}
