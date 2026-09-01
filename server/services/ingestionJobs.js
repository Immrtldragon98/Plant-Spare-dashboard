import {q} from '../db.js';
let enabledState=null;

export async function ingestionJobsEnabled(){
  if(enabledState!==null)return enabledState;
  try{const r=await q(`SELECT to_regclass('public.ingestion_jobs') table_name`);enabledState=Boolean(r.rows[0]?.table_name)}catch{enabledState=false}
  return enabledState;
}

export async function beginIngestionJob({jobType,sourceName,requestId,payload={},createdBy}){
  if(!await ingestionJobsEnabled())return {enabled:false,id:null};
  const row=(await q(`INSERT INTO ingestion_jobs(job_type,status,source_name,request_id,payload,created_by,started_at) VALUES($1,'running',$2,$3,$4,$5,NOW()) RETURNING id`,[jobType,sourceName||null,requestId||null,JSON.stringify(payload||{}),createdBy||null])).rows[0];
  return {enabled:true,id:row.id};
}

export async function completeIngestionJob(job,result={}){
  if(!job?.enabled||!job.id)return;
  await q(`UPDATE ingestion_jobs SET status='succeeded',result=$1,finished_at=NOW(),updated_at=NOW() WHERE id=$2`,[JSON.stringify(result||{}),job.id]);
}

export async function failIngestionJob(job,error){
  if(!job?.enabled||!job.id)return;
  await q(`UPDATE ingestion_jobs SET status='failed',error_message=$1,finished_at=NOW(),updated_at=NOW() WHERE id=$2`,[String(error?.message||error||'Unknown ingestion error').slice(0,2000),job.id]);
}

export async function listIngestionJobs(limit=50){
  if(!await ingestionJobsEnabled())return {enabled:false,jobs:[]};
  const jobs=(await q(`SELECT id,job_type,status,source_name,request_id,payload,result,error_message,created_by,created_at,started_at,finished_at FROM ingestion_jobs ORDER BY created_at DESC LIMIT $1`,[Math.min(Math.max(Number(limit)||50,1),200)])).rows;
  return {enabled:true,jobs};
}
