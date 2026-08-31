import {q} from '../db.js';

const clean=v=>String(v??'').replace(/\u0000/g,'').trim();
const norm=v=>clean(v).toLowerCase();
const stop=new Set(['the','and','for','with','from','this','that','are','was','were','into','your','you','our','but','not','can','will','has','have','had','about','what','when','where','which','how']);
const tokens=v=>[...new Set(norm(v).split(/[^a-z0-9]+/).filter(x=>x.length>2&&!stop.has(x)))];

export async function extractDocumentText(file){
  const name=String(file?.originalname||'').toLowerCase();
  const type=String(file?.mimetype||'').toLowerCase();
  if(name.endsWith('.pdf')||type==='application/pdf'){
    const mod=await import('pdf-parse');
    const parse=mod.default||mod;
    const out=await parse(file.buffer);
    return clean(out.text);
  }
  if(name.endsWith('.txt')||type.startsWith('text/'))return clean(file.buffer.toString('utf8'));
  throw new Error('Knowledge Inbox currently supports PDF and text files. Excel remains in AI Import.');
}

export function chunkText(text,{size=1400,overlap=220,maxChars=300000,maxChunks=240}={}){
  const source=clean(text).slice(0,maxChars);
  if(!source)return [];
  const chunks=[];
  let start=0;
  while(start<source.length&&chunks.length<maxChunks){
    let end=Math.min(start+size,source.length);
    if(end<source.length){
      const breakAt=Math.max(source.lastIndexOf('\n',end),source.lastIndexOf('. ',end));
      if(breakAt>start+Math.floor(size*.55))end=breakAt+1;
    }
    const textChunk=clean(source.slice(start,end));
    if(textChunk)chunks.push({index:chunks.length,text:textChunk});
    if(end>=source.length)break;
    start=Math.max(end-overlap,start+1);
  }
  return chunks;
}

export async function saveKnowledgeDocument({file,metadata,userId}){
  const text=await extractDocumentText(file);
  const chunks=chunkText(text);
  if(!chunks.length)throw new Error('No readable text found in this document');
  const details={
    knowledge:true,
    storage:'neon_text_v0',
    originalArchived:false,
    metadata:{
      title:clean(metadata.title)||file.originalname,
      document_type:clean(metadata.document_type)||'Manual',
      manufacturer:clean(metadata.manufacturer)||null,
      department_code:clean(metadata.department_code)||null,
      equipment:clean(metadata.equipment)||null,
      sub_equipment:clean(metadata.sub_equipment)||null,
      discipline:clean(metadata.discipline)||null,
      material_code:clean(metadata.material_code).toUpperCase()||null,
      notes:clean(metadata.notes)||null,
      mime_type:file.mimetype,
      file_size:file.size
    },
    chunks
  };
  const row=(await q(`INSERT INTO import_history(import_type,file_name,total_rows,added_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('knowledge_document',$1,$2,0,0,0,0,$3,$4) RETURNING id,imported_at`,[file.originalname,chunks.length,JSON.stringify(details),userId])).rows[0];
  return {id:row.id,imported_at:row.imported_at,title:details.metadata.title,chunks:chunks.length,characters:text.length,metadata:details.metadata,originalArchived:false};
}

export async function listKnowledgeDocuments(limit=100){
  const rows=(await q(`SELECT id,file_name,imported_at,details FROM import_history WHERE import_type='knowledge_document' ORDER BY imported_at DESC LIMIT $1`,[Math.min(Math.max(Number(limit)||100,1),250)])).rows;
  return rows.map(r=>({id:r.id,file_name:r.file_name,imported_at:r.imported_at,chunks:Array.isArray(r.details?.chunks)?r.details.chunks.length:0,storage:r.details?.storage||'unknown',originalArchived:Boolean(r.details?.originalArchived),...(r.details?.metadata||{})}));
}

function scoreChunk(queryTokens,doc,chunk,context={}){
  const body=norm(chunk.text),meta=doc.details?.metadata||{};
  let score=0;
  for(const t of queryTokens){if(body.includes(t))score+=2;if(norm(meta.title).includes(t))score+=5;if(norm(meta.manufacturer).includes(t))score+=3;if(norm(meta.material_code).includes(t))score+=8;if(norm(meta.equipment).includes(t)||norm(meta.sub_equipment).includes(t))score+=4}
  if(context.material_code&&norm(meta.material_code)===norm(context.material_code))score+=12;
  if(context.equipment&&norm(meta.equipment)===norm(context.equipment))score+=6;
  if(context.sub_equipment&&norm(meta.sub_equipment)===norm(context.sub_equipment))score+=6;
  if(context.discipline&&norm(meta.discipline)===norm(context.discipline))score+=4;
  return score;
}

export async function searchKnowledge(query,context={},limit=6){
  const qt=tokens(query);
  if(!qt.length)return [];
  const docs=(await q(`SELECT id,file_name,imported_at,details FROM import_history WHERE import_type='knowledge_document' ORDER BY imported_at DESC LIMIT 250`)).rows;
  const hits=[];
  for(const doc of docs){
    const chunks=Array.isArray(doc.details?.chunks)?doc.details.chunks:[];
    for(const chunk of chunks){
      const score=scoreChunk(qt,doc,chunk,context);
      if(score>0)hits.push({score,document_id:doc.id,file_name:doc.file_name,imported_at:doc.imported_at,metadata:doc.details?.metadata||{},chunk_index:chunk.index,text:chunk.text});
    }
  }
  return hits.sort((a,b)=>b.score-a.score).slice(0,Math.min(Math.max(Number(limit)||6,1),12));
}
