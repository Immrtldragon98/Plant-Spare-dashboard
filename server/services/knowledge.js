import crypto from 'crypto';
import {q,pool} from '../db.js';
import {archiveObject,objectStorageConfig} from '../storage/objectStorage.js';

const clean=v=>String(v??'').replace(/\u0000/g,'').trim();
const norm=v=>clean(v).toLowerCase();
const stop=new Set(['the','and','for','with','from','this','that','are','was','were','into','your','you','our','but','not','can','will','has','have','had','about','what','when','where','which','how']);
const tokens=v=>[...new Set(norm(v).split(/[^a-z0-9]+/).filter(x=>x.length>2&&!stop.has(x)))];
let tableState=null;

export async function knowledgeStoreEnabled(){
  if(tableState!==null)return tableState;
  try{const r=await q(`SELECT to_regclass('public.knowledge_documents') docs,to_regclass('public.knowledge_chunks') chunks`);tableState=Boolean(r.rows[0]?.docs&&r.rows[0]?.chunks)}catch{tableState=false}
  return tableState;
}

export async function knowledgeStatus(){
  const storage=objectStorageConfig();
  return {structuredStore:await knowledgeStoreEnabled(),objectStorage:{configured:storage.configured,provider:storage.configured?'s3-compatible':'none',bucket:storage.configured?storage.bucket:null},legacyFallback:true};
}

export async function extractDocumentText(file){
  const name=String(file?.originalname||'').toLowerCase(),type=String(file?.mimetype||'').toLowerCase();
  if(name.endsWith('.pdf')||type==='application/pdf'){
    const mod=await import('pdf-parse'),parse=mod.default||mod,out=await parse(file.buffer);return clean(out.text);
  }
  if(name.endsWith('.txt')||type.startsWith('text/'))return clean(file.buffer.toString('utf8'));
  throw new Error('Knowledge Inbox currently supports PDF and text files. Excel remains in AI Import.');
}

export function chunkText(text,{size=1400,overlap=220,maxChars=300000,maxChunks=240}={}){
  const source=clean(text).slice(0,maxChars);if(!source)return [];
  const chunks=[];let start=0;
  while(start<source.length&&chunks.length<maxChunks){let end=Math.min(start+size,source.length);if(end<source.length){const breakAt=Math.max(source.lastIndexOf('\n',end),source.lastIndexOf('. ',end));if(breakAt>start+Math.floor(size*.55))end=breakAt+1}const textChunk=clean(source.slice(start,end));if(textChunk)chunks.push({index:chunks.length,text:textChunk});if(end>=source.length)break;start=Math.max(end-overlap,start+1)}
  return chunks;
}

function metadataFor(file,metadata={}){
  return {title:clean(metadata.title)||file.originalname,document_type:clean(metadata.document_type)||'Manual',manufacturer:clean(metadata.manufacturer)||null,department_code:clean(metadata.department_code)||null,equipment:clean(metadata.equipment)||null,sub_equipment:clean(metadata.sub_equipment)||null,discipline:clean(metadata.discipline)||null,material_code:clean(metadata.material_code).toUpperCase()||null,notes:clean(metadata.notes)||null,mime_type:file.mimetype,file_size:file.size};
}

async function saveStructured({file,meta,chunks,text,userId,hash}){
  const existing=(await q(`SELECT id,title,uploaded_at,original_archived,storage_provider FROM knowledge_documents WHERE content_hash=$1 AND active=true LIMIT 1`,[hash])).rows[0];
  if(existing)return {id:existing.id,imported_at:existing.uploaded_at,title:existing.title,chunks:0,characters:text.length,metadata:meta,originalArchived:existing.original_archived,storageProvider:existing.storage_provider,deduplicated:true};
  const archived=await archiveObject(file,meta);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const doc=(await client.query(`INSERT INTO knowledge_documents(title,file_name,document_type,manufacturer,department_code,equipment,sub_equipment,discipline,material_code,notes,mime_type,file_size,content_hash,storage_provider,storage_bucket,storage_key,storage_url,original_archived,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,uploaded_at`,[meta.title,file.originalname,meta.document_type,meta.manufacturer,meta.department_code,meta.equipment,meta.sub_equipment,meta.discipline,meta.material_code,meta.notes,meta.mime_type,meta.file_size,hash,archived.archived?archived.provider:'text-only',archived.bucket||null,archived.key||null,archived.url||null,Boolean(archived.archived),userId])).rows[0];
    for(const chunk of chunks)await client.query(`INSERT INTO knowledge_chunks(document_id,chunk_index,content,token_hint,metadata) VALUES($1,$2,$3,$4,$5)`,[doc.id,chunk.index,chunk.text,Math.ceil(chunk.text.length/4),JSON.stringify({})]);
    await client.query('COMMIT');
    return {id:doc.id,imported_at:doc.uploaded_at,title:meta.title,chunks:chunks.length,characters:text.length,metadata:meta,originalArchived:Boolean(archived.archived),storageProvider:archived.archived?archived.provider:'text-only',storageKey:archived.key||null,deduplicated:false};
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

async function saveLegacy({file,meta,chunks,text,userId,hash}){
  const archived=await archiveObject(file,meta);
  const details={knowledge:true,storage:archived.archived?archived.provider:'neon_text_v0',originalArchived:Boolean(archived.archived),storage_key:archived.key||null,storage_bucket:archived.bucket||null,content_hash:hash,metadata:meta,chunks};
  const row=(await q(`INSERT INTO import_history(import_type,file_name,total_rows,added_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('knowledge_document',$1,$2,0,0,0,0,$3,$4) RETURNING id,imported_at`,[file.originalname,chunks.length,JSON.stringify(details),userId])).rows[0];
  return {id:row.id,imported_at:row.imported_at,title:meta.title,chunks:chunks.length,characters:text.length,metadata:meta,originalArchived:Boolean(archived.archived),storageProvider:archived.archived?archived.provider:'text-only',storageKey:archived.key||null,deduplicated:false,legacy:true};
}

export async function saveKnowledgeDocument({file,metadata,userId}){
  const text=await extractDocumentText(file),chunks=chunkText(text);if(!chunks.length)throw new Error('No readable text found in this document');
  const meta=metadataFor(file,metadata),hash=crypto.createHash('sha256').update(file.buffer).digest('hex');
  return await knowledgeStoreEnabled()?saveStructured({file,meta,chunks,text,userId,hash}):saveLegacy({file,meta,chunks,text,userId,hash});
}

export async function listKnowledgeDocuments(limit=100){
  const max=Math.min(Math.max(Number(limit)||100,1),250);
  if(await knowledgeStoreEnabled()){
    const rows=(await q(`SELECT d.*,COUNT(c.id)::int chunks FROM knowledge_documents d LEFT JOIN knowledge_chunks c ON c.document_id=d.id WHERE d.active=true GROUP BY d.id ORDER BY d.uploaded_at DESC LIMIT $1`,[max])).rows;
    return rows.map(r=>({id:r.id,file_name:r.file_name,imported_at:r.uploaded_at,chunks:r.chunks,storage:r.storage_provider,originalArchived:r.original_archived,title:r.title,document_type:r.document_type,manufacturer:r.manufacturer,department_code:r.department_code,equipment:r.equipment,sub_equipment:r.sub_equipment,discipline:r.discipline,material_code:r.material_code,notes:r.notes,file_size:r.file_size}));
  }
  const rows=(await q(`SELECT id,file_name,imported_at,details FROM import_history WHERE import_type='knowledge_document' ORDER BY imported_at DESC LIMIT $1`,[max])).rows;
  return rows.map(r=>({id:r.id,file_name:r.file_name,imported_at:r.imported_at,chunks:Array.isArray(r.details?.chunks)?r.details.chunks.length:0,storage:r.details?.storage||'unknown',originalArchived:Boolean(r.details?.originalArchived),...(r.details?.metadata||{})}));
}

function scoreChunk(queryTokens,meta,body,context={}){
  const text=norm(body);let score=0;
  for(const t of queryTokens){if(text.includes(t))score+=2;if(norm(meta.title).includes(t))score+=5;if(norm(meta.manufacturer).includes(t))score+=3;if(norm(meta.material_code).includes(t))score+=8;if(norm(meta.equipment).includes(t)||norm(meta.sub_equipment).includes(t))score+=4}
  if(context.material_code&&norm(meta.material_code)===norm(context.material_code))score+=12;if(context.equipment&&norm(meta.equipment)===norm(context.equipment))score+=6;if(context.sub_equipment&&norm(meta.sub_equipment)===norm(context.sub_equipment))score+=6;if(context.discipline&&norm(meta.discipline)===norm(context.discipline))score+=4;return score;
}

async function searchStructured(query,context,limit){
  const qt=tokens(query);if(!qt.length)return [];
  const rows=(await q(`SELECT d.id document_id,d.file_name,d.uploaded_at,d.title,d.document_type,d.manufacturer,d.department_code,d.equipment,d.sub_equipment,d.discipline,d.material_code,d.notes,c.chunk_index,c.content FROM knowledge_chunks c JOIN knowledge_documents d ON d.id=c.document_id WHERE d.active=true AND (to_tsvector('simple',c.content) @@ plainto_tsquery('simple',$1) OR d.title ILIKE $2 OR COALESCE(d.material_code,'') ILIKE $2 OR COALESCE(d.manufacturer,'') ILIKE $2) ORDER BY d.uploaded_at DESC LIMIT 120`,[query,`%${query}%`])).rows;
  return rows.map(r=>{const metadata={title:r.title,document_type:r.document_type,manufacturer:r.manufacturer,department_code:r.department_code,equipment:r.equipment,sub_equipment:r.sub_equipment,discipline:r.discipline,material_code:r.material_code,notes:r.notes};return {score:scoreChunk(qt,metadata,r.content,context),document_id:r.document_id,file_name:r.file_name,imported_at:r.uploaded_at,metadata,chunk_index:r.chunk_index,text:r.content}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}

async function searchLegacy(query,context,limit){
  const qt=tokens(query);if(!qt.length)return [];
  const docs=(await q(`SELECT id,file_name,imported_at,details FROM import_history WHERE import_type='knowledge_document' ORDER BY imported_at DESC LIMIT 250`)).rows,hits=[];
  for(const doc of docs)for(const chunk of Array.isArray(doc.details?.chunks)?doc.details.chunks:[]){const meta=doc.details?.metadata||{},score=scoreChunk(qt,meta,chunk.text,context);if(score>0)hits.push({score,document_id:doc.id,file_name:doc.file_name,imported_at:doc.imported_at,metadata:meta,chunk_index:chunk.index,text:chunk.text})}
  return hits.sort((a,b)=>b.score-a.score).slice(0,limit);
}

export async function searchKnowledge(query,context={},limit=6){
  const max=Math.min(Math.max(Number(limit)||6,1),12);
  return await knowledgeStoreEnabled()?searchStructured(query,context,max):searchLegacy(query,context,max);
}
