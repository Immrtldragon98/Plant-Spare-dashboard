import crypto from 'crypto';
import {q} from '../db.js';

let enabledState=null;
const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');

export async function importMappingMemoryEnabled(){
  if(enabledState!==null)return enabledState;
  try{const r=await q(`SELECT to_regclass('public.import_mapping_memory') memory`);enabledState=Boolean(r.rows[0]?.memory)}catch{enabledState=false}
  return enabledState;
}

export function templateSignature(fileType,sheetName,headers=[]){
  const payload=[clean(fileType).toLowerCase(),clean(sheetName).toLowerCase(),...(headers||[]).map(norm)].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function getApprovedMapping({fileType,sheetName,headers=[]}){
  if(!await importMappingMemoryEnabled())return null;
  const signature=templateSignature(fileType,sheetName,headers);
  const row=(await q(`SELECT id,mapping,source,use_count FROM import_mapping_memory WHERE template_signature=$1 AND file_type=$2 AND sheet_name=$3`,[signature,clean(fileType).toLowerCase(),clean(sheetName)])).rows[0];
  if(!row)return null;
  await q(`UPDATE import_mapping_memory SET use_count=use_count+1,last_used_at=NOW(),updated_at=NOW() WHERE id=$1`,[row.id]);
  return {mapping:row.mapping||{},source:row.source||'approved-import',memory_id:row.id};
}

export async function rememberApprovedMapping({fileType,sheetName,headers=[],mapping={},batchId=null,userId=null,source='approved-import'}){
  if(!await importMappingMemoryEnabled())return {enabled:false,saved:false};
  const entries=Object.entries(mapping||{}).filter(([,v])=>clean(v));
  if(!entries.length)return {enabled:true,saved:false};
  const safeMapping=Object.fromEntries(entries),signature=templateSignature(fileType,sheetName,headers);
  const row=(await q(`INSERT INTO import_mapping_memory(template_signature,file_type,sheet_name,headers,mapping,source,source_batch_id,approved_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(template_signature,file_type,sheet_name) DO UPDATE SET headers=EXCLUDED.headers,mapping=EXCLUDED.mapping,source=EXCLUDED.source,source_batch_id=EXCLUDED.source_batch_id,approved_by=EXCLUDED.approved_by,updated_at=NOW()
    RETURNING id`,[signature,clean(fileType).toLowerCase(),clean(sheetName),JSON.stringify(headers||[]),JSON.stringify(safeMapping),source,batchId,userId])).rows[0];
  return {enabled:true,saved:true,id:row.id};
}

export async function rememberBatchMappings({batchId,fileType,sheetHeaders={},sheetMappings={},userId=null,source='approved-import'}){
  const results=[];
  for(const [sheetName,mapping] of Object.entries(sheetMappings||{}))results.push(await rememberApprovedMapping({fileType,sheetName,headers:sheetHeaders?.[sheetName]||[],mapping,batchId,userId,source}));
  return {enabled:results.some(x=>x.enabled),saved:results.filter(x=>x.saved).length};
}
