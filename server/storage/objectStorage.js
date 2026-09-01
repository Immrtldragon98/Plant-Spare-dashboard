import crypto from 'crypto';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';

const clean=v=>String(v??'').trim();

export function objectStorageConfig(){
  const endpoint=clean(process.env.OBJECT_STORAGE_ENDPOINT||process.env.R2_ENDPOINT);
  const accessKeyId=clean(process.env.OBJECT_STORAGE_ACCESS_KEY_ID||process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey=clean(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY||process.env.R2_SECRET_ACCESS_KEY);
  const bucket=clean(process.env.OBJECT_STORAGE_BUCKET||process.env.R2_BUCKET);
  const region=clean(process.env.OBJECT_STORAGE_REGION)||'auto';
  const publicBaseUrl=clean(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL);
  return {endpoint,accessKeyId,secretAccessKey,bucket,region,publicBaseUrl,configured:Boolean(endpoint&&accessKeyId&&secretAccessKey&&bucket)};
}

function safeName(name='file'){
  return String(name).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,140)||'file';
}

export function buildObjectKey(file,{department_code='',equipment='',document_type='knowledge'}={}){
  const stamp=new Date().toISOString().slice(0,10);
  const hash=crypto.createHash('sha256').update(file.buffer).digest('hex').slice(0,16);
  const prefix=[clean(department_code)||'unscoped',clean(equipment)||'general',clean(document_type)||'knowledge'].map(safeName).join('/');
  return `${prefix}/${stamp}/${hash}-${safeName(file.originalname)}`;
}

export async function archiveObject(file,metadata={}){
  const cfg=objectStorageConfig();
  if(!cfg.configured)return {configured:false,archived:false,provider:'none',note:'Object storage is not configured'};
  const client=new S3Client({region:cfg.region,endpoint:cfg.endpoint,forcePathStyle:true,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey}});
  const key=buildObjectKey(file,metadata);
  await client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:key,Body:file.buffer,ContentType:file.mimetype||'application/octet-stream',Metadata:{originalname:safeName(file.originalname),department:safeName(metadata.department_code||'unscoped'),equipment:safeName(metadata.equipment||'general'),documenttype:safeName(metadata.document_type||'knowledge')}}));
  const url=cfg.publicBaseUrl?`${cfg.publicBaseUrl.replace(/\/$/,'')}/${key}`:null;
  return {configured:true,archived:true,provider:'s3-compatible',bucket:cfg.bucket,key,url};
}
