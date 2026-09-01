import {q} from '../db.js';
import {batchChangesToMaterialEvents} from '../domain/materialEvents.js';

let availabilityCache=null;

export async function materialEventsAvailable(){
  if(availabilityCache!==null)return availabilityCache;
  try{
    const x=await q("SELECT to_regclass('public.material_events') AS table_name");
    availabilityCache=Boolean(x.rows?.[0]?.table_name);
  }catch{availabilityCache=false}
  return availabilityCache;
}

export function resetMaterialEventsAvailabilityCache(){availabilityCache=null}

export async function recordImportMaterialEvents(changes,context={}){
  if(!(await materialEventsAvailable()))return {enabled:false,recorded:0};
  const events=batchChangesToMaterialEvents(changes,context);
  let recorded=0;
  for(const e of events){
    await q(`INSERT INTO material_events(material_id,material_code,event_type,event_at,quantity,old_value,new_value,source_type,source_ref,import_history_id,metadata,created_by)
      VALUES($1,$2,$3,COALESCE($4,NOW()),$5,$6,$7,$8,$9,$10,$11,$12)`,[
      e.material_id,e.material_code,e.event_type,e.event_at,e.quantity,e.old_value,e.new_value,e.source_type,e.source_ref,e.import_history_id,JSON.stringify(e.metadata||{}),context.createdBy||null
    ]);
    recorded++;
  }
  return {enabled:true,recorded};
}

export async function getMaterialEvents(materialCode,limit=50){
  if(!(await materialEventsAvailable()))return {enabled:false,events:[],note:'Material event store migration is not active yet.'};
  const code=String(materialCode||'').trim().toUpperCase();
  const n=Math.min(Math.max(Number(limit)||50,1),200);
  const rows=(await q(`SELECT id,material_code,event_type,event_at,quantity,old_value,new_value,source_type,source_ref,import_history_id,metadata,created_at
    FROM material_events WHERE upper(material_code)=upper($1) ORDER BY event_at DESC,id DESC LIMIT ${n}`,[code])).rows;
  return {enabled:true,events:rows};
}
