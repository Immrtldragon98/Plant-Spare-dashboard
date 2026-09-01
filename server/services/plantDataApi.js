import {q} from '../db.js';
import {canonicalMaterialCode} from '../excel.js';
import {getMaterialPage} from './materialCatalog.js';
import {getEquipmentSummary} from './equipmentSummary.js';
import {procurementPage} from './procurementService.js';
import {recordImportMaterialEvents} from './materialEvents.js';
import {appendProcurementEvent,procurementEventsAvailable} from './procurementEvents.js';

const clean=v=>String(v??'').trim();
const same=(a,b)=>String(a??'')===String(b??'');
const validSnapshotTypes=new Set(['stock','open_pr','open_po']);

export async function plantApiStatus(){
  const counts=(await q(`SELECT (SELECT COUNT(*) FROM materials WHERE active=true)::int materials,(SELECT COUNT(*) FROM material_usages WHERE active=true)::int usages,(SELECT COUNT(*) FROM locations WHERE active=true)::int locations`)).rows[0];
  return {api:'Plant Data API',version:'v1',sourceOfTruth:'Neon structured data validated by domain services',capabilities:{materials:true,equipment:true,hierarchy:true,procurement:true,snapshotIngest:true,masterWrite:false},counts};
}

export async function plantMaterials(input={}){return getMaterialPage(input)}
export async function plantEquipment(input={}){return getEquipmentSummary(input)}
export async function plantProcurement(input={}){return procurementPage(input)}

export async function plantHierarchy(input={}){
  const p=[],w=['active=true'];
  const add=(col,val)=>{if(clean(val)){p.push(clean(val));w.push(`${col}=$${p.length}`)}};
  add('department_code',input.department_code);add('area_name',input.area);add('equipment_name',input.equipment);add('sub_equipment_name',input.sub_equipment);
  const rows=(await q(`SELECT id,plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name,sub_equipment_code,sub_equipment_name,sap_location_code FROM locations WHERE ${w.join(' AND ')} ORDER BY plant_code,department_code,area_name,equipment_name,sub_equipment_name LIMIT 2000`,p)).rows;
  return {rows,count:rows.length};
}

function canonicalSnapshotRow(raw,type){
  const code=canonicalMaterialCode(clean(raw?.material_code).toUpperCase());
  if(!code)return {error:'Material Code must be exactly 3 uppercase letters followed by 12 digits',raw_material_code:clean(raw?.material_code)};
  const quantity=type==='stock'?raw.store_qty:type==='open_pr'?raw.pr_qty:raw.po_qty;
  if(quantity===null||quantity===undefined||quantity===''||!Number.isFinite(Number(quantity)))return {error:`${type} quantity is required and must be numeric`,material_code:code};
  if(Number(quantity)<0)return {error:'Quantity cannot be negative',material_code:code};
  return {material_code:code,quantity:Number(quantity),vendor:type==='open_po'?clean(raw.vendor)||null:null,document_number:clean(raw.document_number||raw.po_number||raw.pr_number)||null,document_item:clean(raw.document_item||raw.pr_item)||null,event_date:clean(raw.event_date)||null,expected_date:clean(raw.expected_date)||null,metadata:raw.metadata&&typeof raw.metadata==='object'?raw.metadata:{}};
}

export async function ingestPlantSnapshots({type,rows,source='plant-api',principal='service',userId=null}){
  if(!validSnapshotTypes.has(type))throw new Error('Snapshot type must be stock, open_pr, or open_po');
  if(!Array.isArray(rows)||!rows.length)throw new Error('rows[] is required');
  if(rows.length>1000)throw new Error('Maximum 1000 rows per request');
  const parsed=rows.map(r=>canonicalSnapshotRow(r,type));
  const issues=parsed.map((x,i)=>x.error?{row:i+1,...x}:null).filter(Boolean);
  const valid=parsed.filter(x=>!x.error),changes=[],missing=[],procurement=[];
  let updated=0,unchanged=0;
  for(const row of valid){
    const m=(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1) AND active=true',[row.material_code])).rows[0];
    if(!m){missing.push(row.material_code);continue}
    const old={},next={store_qty:m.store_qty,pr_qty:m.pr_qty,po_qty:m.po_qty,vendor:m.vendor};
    if(type==='stock'){old.store_qty=m.store_qty;next.store_qty=row.quantity}
    if(type==='open_pr'){old.pr_qty=m.pr_qty;next.pr_qty=row.quantity}
    if(type==='open_po'){old.po_qty=m.po_qty;next.po_qty=row.quantity;if(row.vendor){old.vendor=m.vendor;next.vendor=row.vendor}}
    const changed=type==='stock'?!same(m.store_qty,row.quantity):type==='open_pr'?!same(m.pr_qty,row.quantity):(!same(m.po_qty,row.quantity)||(row.vendor&&!same(m.vendor,row.vendor)));
    if(!changed){unchanged++;continue}
    await q('UPDATE materials SET store_qty=$1,pr_qty=$2,po_qty=$3,vendor=$4,updated_by=$5,updated_at=NOW() WHERE id=$6',[next.store_qty,next.pr_qty,next.po_qty,next.vendor,userId,m.id]);
    const newFields=type==='stock'?{store_qty:row.quantity}:type==='open_pr'?{pr_qty:row.quantity}:{po_qty:row.quantity,...(row.vendor?{vendor:row.vendor}:{})};
    changes.push({material_id:m.id,material_code:m.material_code,old,new:newFields});updated++;
    if(type!=='stock')procurement.push({material_id:m.id,material_code:m.material_code,event_type:type==='open_pr'?'PR_SNAPSHOT':'PO_SNAPSHOT',document_number:row.document_number,document_item:row.document_item,open_quantity:row.quantity,vendor:row.vendor,event_date:row.event_date,expected_date:row.expected_date,metadata:{...row.metadata,principal}});
  }
  const details={api_version:'v1',source,principal,snapshot_type:type,issues,missing_material_codes:missing,changes};
  const hist=(await q(`INSERT INTO import_history(import_type,file_name,total_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('plant_api_snapshot',$1,$2,$3,$4,$5,$6,$7) RETURNING id`,[source,rows.length,updated,issues.length+missing.length,issues.length,JSON.stringify(details),userId])).rows[0];
  const materialEvents=await recordImportMaterialEvents(changes,{sourceType:`plant_api_${type}`,sourceRef:source,importHistoryId:hist.id,createdBy:userId});
  let procurementStored=0;
  if(procurement.length&&await procurementEventsAvailable())for(const event of procurement){const saved=await appendProcurementEvent({...event,source_batch_id:hist.id,source_file:source,created_by:userId});if(saved.stored)procurementStored++}
  return {ok:true,batch_id:hist.id,type,total:rows.length,valid:valid.length,updated,unchanged,missing_material_codes:missing,issues,material_event_store:materialEvents,procurement_events:{candidates:procurement.length,stored:procurementStored}};
}
