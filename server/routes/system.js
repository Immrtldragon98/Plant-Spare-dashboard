import {Router} from 'express';
import {auth,allow} from '../auth.js';
import {q} from '../db.js';
import {objectStorageConfig} from '../storage/objectStorage.js';

const r=Router();
const safeCount=async table=>{try{const x=await q(`SELECT to_regclass($1) reg`,[`public.${table}`]);if(!x.rows[0]?.reg)return null;return Number((await q(`SELECT COUNT(*)::bigint count FROM ${table}`)).rows[0]?.count||0)}catch{return null}};

r.get('/system/status',auth,allow('admin'),async(req,res)=>{
  const cfg=objectStorageConfig();
  const db=await q(`SELECT pg_database_size(current_database())::bigint bytes,current_database() database`);
  const names=['materials','material_usages','locations','import_history','raw_upload_batches','raw_upload_rows','ingestion_canonical_rows','ingestion_reviews','ingestion_human_reviews','import_mapping_memory','knowledge_documents','knowledge_chunks','material_events','procurement_events','equipment_components','component_material_links','component_knowledge_links'];
  const counts={};for(const name of names)counts[name]=await safeCount(name);
  const bytes=Number(db.rows[0]?.bytes||0);
  res.json({database:{name:db.rows[0]?.database||null,bytes,megabytes:Math.round(bytes/1024/1024*10)/10},counts,object_storage:{configured:cfg.configured,provider:cfg.configured?'s3-compatible':'none',bucket:cfg.configured?cfg.bucket:null,note:cfg.configured?'Original Excel/PDF binaries can be archived outside Postgres.':'Object storage is not configured; raw row evidence and indexed text remain in Postgres, so database growth should be watched.'},policy:{raw_excel:'Preserve raw evidence; do not auto-delete uploads.',documents:'Store searchable text in Postgres; archive original binaries in object storage when configured.',scale:'Use pagination/aggregates for UI reads; avoid full-table material loads.'}});
});

export default r;
