import crypto from 'crypto';
import XLSX from 'xlsx';
import {q,pool} from '../db.js';
import {archiveObject} from '../storage/objectStorage.js';

let enabledState=null,stagingState=null;
const clean=v=>String(v??'').trim();
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const chunks=(items,size=250)=>{const out=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out};

export async function rawWorkbookStoreEnabled(){
  if(enabledState!==null)return enabledState;
  try{const r=await q(`SELECT to_regclass('public.raw_upload_batches') batches,to_regclass('public.raw_upload_rows') rows,to_regclass('public.ingestion_reviews') reviews`);enabledState=Boolean(r.rows[0]?.batches&&r.rows[0]?.rows&&r.rows[0]?.reviews)}catch{enabledState=false}
  return enabledState;
}

export async function canonicalStagingEnabled(){
  if(stagingState!==null)return stagingState;
  try{const r=await q(`SELECT to_regclass('public.ingestion_canonical_rows') rows,to_regclass('public.ingestion_human_reviews') human_reviews`);stagingState=Boolean(r.rows[0]?.rows&&r.rows[0]?.human_reviews)}catch{stagingState=false}
  return stagingState;
}

export function inspectWorkbook(buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true,raw:true});
  const sheets=[];
  for(const sheetName of wb.SheetNames){
    const ws=wb.Sheets[sheetName];
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    const headerIndex=matrix.findIndex(row=>Array.isArray(row)&&row.some(v=>clean(v)));
    const headers=headerIndex>=0?(matrix[headerIndex]||[]).map((v,i)=>clean(v)||`Column_${i+1}`):[];
    const rows=[];
    for(let i=0;i<matrix.length;i++){
      const cells=Array.isArray(matrix[i])?matrix[i]:[];
      if(!cells.some(v=>v!==null&&v!==undefined&&clean(v)!==''))continue;
      const rowObject={};
      if(headers.length&&i>headerIndex)headers.forEach((h,idx)=>{if(cells[idx]!==undefined)rowObject[h]=cells[idx]});
      rows.push({row_number:i+1,cells,row_object:Object.keys(rowObject).length?rowObject:null,row_hash:hash(cells)});
    }
    sheets.push({name:sheetName,header_row:headerIndex>=0?headerIndex+1:null,headers,rows});
  }
  return {sheet_names:wb.SheetNames,sheets,total_rows:sheets.reduce((n,s)=>n+s.rows.length,0)};
}

export async function archiveRawWorkbook({file,sourceType='excel',uploadedBy=null,importHistoryId=null,metadata={}}){
  const parsed=inspectWorkbook(file.buffer),contentHash=hash(file.buffer);
  if(!await rawWorkbookStoreEnabled())return {enabled:false,batchId:null,contentHash,parsed,originalArchived:false};
  const archived=await archiveObject(file,{department_code:metadata.department_code||'',equipment:metadata.equipment||'',document_type:'raw-excel'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const batch=(await client.query(`INSERT INTO raw_upload_batches(import_history_id,source_name,source_type,content_hash,workbook_meta,storage_provider,storage_bucket,storage_key,original_archived,status,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'received',$10) RETURNING id,uploaded_at`,[importHistoryId,file.originalname,sourceType,contentHash,JSON.stringify({sheet_names:parsed.sheet_names,total_rows:parsed.total_rows,sheets:parsed.sheets.map(s=>({name:s.name,header_row:s.header_row,headers:s.headers,row_count:s.rows.length})),...metadata}),archived.archived?archived.provider:'db-only',archived.bucket||null,archived.key||null,Boolean(archived.archived),uploadedBy])).rows[0];
    const flat=[];
    for(const sheet of parsed.sheets)for(const row of sheet.rows)flat.push({sheet_name:sheet.name,row_number:row.row_number,cells:row.cells,row_object:row.row_object,row_hash:row.row_hash});
    for(const part of chunks(flat,250)){
      await client.query(`INSERT INTO raw_upload_rows(batch_id,sheet_name,row_number,cells,row_object,row_hash)
        SELECT $1,x.sheet_name,x.row_number,x.cells,x.row_object,x.row_hash
        FROM jsonb_to_recordset($2::jsonb) AS x(sheet_name text,row_number int,cells jsonb,row_object jsonb,row_hash text)`,[batch.id,JSON.stringify(part)]);
    }
    await client.query('COMMIT');
    return {enabled:true,batchId:batch.id,uploadedAt:batch.uploaded_at,contentHash,parsed,originalArchived:Boolean(archived.archived),storageProvider:archived.archived?archived.provider:'db-only'};
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function saveCanonicalPreview(batchId,preview){
  if(!batchId||!await rawWorkbookStoreEnabled())return false;
  await q(`UPDATE raw_upload_batches SET workbook_meta=COALESCE(workbook_meta,'{}'::jsonb) || jsonb_build_object('canonical_preview',$1::jsonb),updated_at=NOW() WHERE id=$2`,[JSON.stringify(preview||{}),batchId]);
  return true;
}

export async function stageCanonicalRows(batchId,fileType,rows=[]){
  if(!batchId||!await canonicalStagingEnabled())return {enabled:false,stored:0};
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM ingestion_canonical_rows WHERE batch_id=$1',[batchId]);
    const prepared=(rows||[]).map((row,i)=>({row_index:i+1,file_type:fileType||'unknown',material_code:clean(row?.material_code).toUpperCase()||null,payload:row||{}}));
    for(const part of chunks(prepared,250)){
      await client.query(`INSERT INTO ingestion_canonical_rows(batch_id,row_index,file_type,material_code,payload)
        SELECT $1,x.row_index,x.file_type,x.material_code,x.payload
        FROM jsonb_to_recordset($2::jsonb) AS x(row_index int,file_type text,material_code text,payload jsonb)`,[batchId,JSON.stringify(part)]);
    }
    await client.query('COMMIT');return {enabled:true,stored:prepared.length};
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function getStagedCanonicalRows(batchId){
  if(!await canonicalStagingEnabled())return {enabled:false,fileType:null,rows:[]};
  const rows=(await q(`SELECT row_index,file_type,payload FROM ingestion_canonical_rows WHERE batch_id=$1 ORDER BY row_index`,[batchId])).rows;
  return {enabled:true,fileType:rows[0]?.file_type||null,rows:rows.map(r=>r.payload)};
}

export async function saveIngestionReview({batchId,reviewType,decision,confidence=null,model=null,findings=[],summary=''}){
  if(!batchId||!await rawWorkbookStoreEnabled())return null;
  return (await q(`INSERT INTO ingestion_reviews(batch_id,review_type,decision,confidence,model,findings,summary) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at`,[batchId,reviewType,decision,confidence,model,JSON.stringify(findings||[]),summary||null])).rows[0];
}

export async function markRawBatch(batchId,status,importHistoryId=null){
  if(!batchId||!await rawWorkbookStoreEnabled())return;
  await q(`UPDATE raw_upload_batches SET status=$1,import_history_id=COALESCE($2,import_history_id),updated_at=NOW() WHERE id=$3`,[status,importHistoryId,batchId]);
}

export async function getRawBatch(batchId,{page=1,pageSize=100}={}){
  if(!await rawWorkbookStoreEnabled())return {enabled:false,batch:null,rows:[],pagination:null,reviews:[],human_review:null};
  const batch=(await q(`SELECT * FROM raw_upload_batches WHERE id=$1`,[batchId])).rows[0];if(!batch)return {enabled:true,batch:null,rows:[],pagination:null,reviews:[],human_review:null};
  const p=Math.max(Number(page)||1,1),ps=Math.min(Math.max(Number(pageSize)||100,10),500),offset=(p-1)*ps;
  const total=Number((await q(`SELECT COUNT(*)::int total FROM raw_upload_rows WHERE batch_id=$1`,[batchId])).rows[0]?.total||0);
  const rows=(await q(`SELECT id,sheet_name,row_number,cells,row_object,row_hash FROM raw_upload_rows WHERE batch_id=$1 ORDER BY sheet_name,row_number LIMIT $2 OFFSET $3`,[batchId,ps,offset])).rows;
  const reviews=(await q(`SELECT id,review_type,decision,confidence,model,findings,summary,created_at FROM ingestion_reviews WHERE batch_id=$1 ORDER BY created_at`,[batchId])).rows;
  let humanReview=null;if(await canonicalStagingEnabled())humanReview=(await q(`SELECT h.*,u.name reviewed_by_name FROM ingestion_human_reviews h LEFT JOIN users u ON u.id=h.reviewed_by WHERE h.batch_id=$1`,[batchId])).rows[0]||null;
  return {enabled:true,batch,rows,reviews,human_review:humanReview,pagination:{page:p,page_size:ps,total,pages:Math.max(Math.ceil(total/ps),1)}};
}
