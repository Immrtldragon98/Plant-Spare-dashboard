import {q} from '../db.js';

let availability;
export async function procurementEventsAvailable(){
  if(availability!==undefined)return availability;
  try{const x=await q(`SELECT to_regclass('public.procurement_events') AS name`);availability=Boolean(x.rows?.[0]?.name)}catch{availability=false}
  return availability;
}

export async function appendProcurementEvent(event){
  if(!(await procurementEventsAvailable()))return {stored:false,reason:'procurement_events migration not applied'};
  const {material_id=null,material_code=null,event_type,document_number=null,document_item=null,quantity=null,open_quantity=null,vendor=null,event_date=null,expected_date=null,source_batch_id=null,source_file=null,metadata=null,created_by=null}=event;
  const row=(await q(`INSERT INTO procurement_events(material_id,material_code,event_type,document_number,document_item,quantity,open_quantity,vendor,event_date,expected_date,source_batch_id,source_file,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[material_id,material_code,event_type,document_number,document_item,quantity,open_quantity,vendor,event_date,expected_date,source_batch_id,source_file,metadata?JSON.stringify(metadata):null,created_by])).rows[0];
  return {stored:true,id:row.id};
}

export async function getProcurementHistory(materialCode,limit=50){
  if(!(await procurementEventsAvailable()))return {enabled:false,events:[],reason:'procurement_events migration not applied'};
  const n=Math.min(Math.max(Number(limit)||20,1),100);
  const x=await q(`SELECT id,material_code,event_type,document_number,document_item,quantity,open_quantity,vendor,event_date,expected_date,source_batch_id,source_file,metadata,created_at FROM procurement_events WHERE upper(material_code)=upper($1) ORDER BY COALESCE(event_date,created_at) DESC,id DESC LIMIT ${n}`,[materialCode]);
  return {enabled:true,events:x.rows};
}
