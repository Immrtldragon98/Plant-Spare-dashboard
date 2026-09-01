import {Router} from 'express';
import multer from 'multer';
import {auth,allow} from '../auth.js';
import {q} from '../db.js';
import {parseUniversalImport} from '../services/universalImport.js';
import {findOrCreateLocation,getDepartment} from '../services/locationService.js';
import {recordImportMaterialEvents} from '../services/materialEvents.js';
import {appendProcurementEvent,procurementEventsAvailable} from '../services/procurementEvents.js';
import {resolveOrRepairMaterial} from '../services/materialIdentityRepair.js';
import {audit} from '../services/auditService.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const writable=new Set(['master','stock','open_pr','open_po']);
const validDisciplines=new Set(['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other']);
const clean=v=>String(v??'').trim();
const same=(a,b)=>String(a??'')===String(b??'');

async function scope(req){
  const department_code=clean(req.body.department_code);if(!department_code)throw new Error('Select a Sub-department Code before importing');
  const dept=await getDepartment(department_code);if(!dept)throw new Error('Unknown Sub-department Code');
  const discipline=clean(req.body.discipline);if(discipline&&!validDisciplines.has(discipline))throw new Error('Invalid default Discipline');
  return {department_code,dept,equipment:clean(req.body.area||req.body.equipment),discipline};
}

r.post('/import/universal/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const discipline=clean(req.body.discipline);if(discipline&&!validDisciplines.has(discipline))return res.status(400).json({error:'Invalid default Discipline'});
  const out=await parseUniversalImport(req.file.buffer,discipline),valid=out.rows.filter(x=>x.material_code),invalid=out.rows.length-valid.length;
  const fields=[...new Set(out.rows.flatMap(x=>Object.entries(x).filter(([,v])=>v!==null&&v!==''&&v!==undefined).map(([k])=>k)))];
  const disciplineCounts=out.rows.reduce((a,x)=>{const d=x.discipline||'(Blank)';a[d]=(a[d]||0)+1;return a},{});
  res.json({fileName:req.file.originalname,fileType:out.fileType,confidence:out.confidence,aiEnabled:out.aiEnabled,source:out.source,totalRows:out.rows.length,validMaterialRows:valid.length,invalidMaterialRows:invalid,writable:writable.has(out.fileType),fields,rows:out.rows.slice(0,80),issues:out.issues.slice(0,120),sheetMappings:out.sheetMappings,analysis:out.analysis,defaultDiscipline:discipline||null,disciplineCounts,message:writable.has(out.fileType)?'Ready for validated Confirm.':'AI understood the file, but this type is preview-only until transaction/history storage is enabled.'});
});

r.post('/import/universal/confirm',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const {department_code,equipment,discipline}=await scope(req),out=await parseUniversalImport(req.file.buffer,discipline);
  if(!writable.has(out.fileType))return res.status(400).json({error:`${out.fileType.replaceAll('_',' ')} is currently preview-only. Rich transaction/history storage must be enabled before Confirm.`});
  let added=0,updated=0,unchanged=0,skipped=0,repairedMaterialCodes=0;const missing=[],changes=[],procurementRows=[],repairs=[];
  if(out.fileType==='master'){
    if(!equipment)return res.status(400).json({error:'Select Equipment for a master import'});
    for(const row of out.rows){
      if(!row.material_code){skipped++;continue}
      const loc=await findOrCreateLocation({department_code,area:equipment,equipment,sub_equipment:row.assembly_name||row.source_sheet,sap_location_code:null});
      let m=(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1)',[row.material_code])).rows[0];
      if(!m){m=(await q(`INSERT INTO materials(material_code,spare_name,description,part_number,uom,manufacturer,vendor,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,[row.material_code,row.spare_name,row.description,row.part_number,row.uom,row.manufacturer,row.vendor,req.user.id])).rows[0];added++}
      else{
        const next={spare_name:row.spare_name||m.spare_name,description:row.description||m.description,part_number:row.part_number||m.part_number,uom:row.uom||m.uom,manufacturer:row.manufacturer||m.manufacturer,vendor:row.vendor||m.vendor};
        const changed=!Object.keys(next).every(k=>same(next[k],m[k]));
        if(changed){m=(await q(`UPDATE materials SET spare_name=$1,description=$2,part_number=$3,uom=$4,manufacturer=$5,vendor=$6,active=true,updated_by=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,[next.spare_name,next.description,next.part_number,next.uom,next.manufacturer,next.vendor,req.user.id,m.id])).rows[0];updated++}else unchanged++;
      }
      const old=(await q('SELECT * FROM material_usages WHERE material_id=$1 AND location_id=$2',[m.id,loc.id])).rows[0],rowDiscipline=row.discipline||discipline||null;
      if(!old)await q(`INSERT INTO material_usages(material_id,location_id,required_qty,discipline,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)`,[m.id,loc.id,row.required_qty,rowDiscipline,row.notes||null,req.user.id]);
      else if((row.required_qty!==null&&!same(old.required_qty,row.required_qty))||(rowDiscipline&&!same(old.discipline,rowDiscipline))||(row.notes&&!same(old.notes,row.notes))){await q(`UPDATE material_usages SET required_qty=COALESCE($1,required_qty),discipline=COALESCE(NULLIF($2,''),discipline),notes=COALESCE(NULLIF($3,''),notes),active=true,updated_by=$4,updated_at=NOW() WHERE id=$5`,[row.required_qty,rowDiscipline,row.notes,req.user.id,old.id]);updated++}
    }
  }else{
    for(const row of out.rows){
      if(!row.material_code){skipped++;continue}
      const resolved=await resolveOrRepairMaterial(row.material_code,{userId:req.user.id}),m=resolved.material;
      if(!m){missing.push(row.material_code);skipped++;continue}
      if(resolved.repaired){repairedMaterialCodes++;repairs.push({material_code:row.material_code,reason:resolved.reason,old_material_code:resolved.old?.material_code||null,material_id:m.id});await audit(req.user,'material_code_safe_correction','material',m.id,row.material_code,resolved.old,m)}
      if(out.fileType==='open_pr')procurementRows.push({material_id:m.id,material_code:row.material_code,event_type:'PR_SNAPSHOT',document_number:row.pr_number,document_item:row.pr_item,open_quantity:row.pr_qty,vendor:row.vendor,event_date:row.pr_raised_date,expected_date:row.expected_date,metadata:{tracking_id:row.tracking_id,source_sheet:row.source_sheet,source_row:row.source_row}});
      if(out.fileType==='open_po')procurementRows.push({material_id:m.id,material_code:row.material_code,event_type:'PO_SNAPSHOT',document_number:row.po_number,document_item:row.pr_item,open_quantity:row.po_qty,vendor:row.vendor,event_date:row.po_raised_date,expected_date:row.expected_date,metadata:{pr_number:row.pr_number,source_sheet:row.source_sheet,source_row:row.source_row}});
      const next={store_qty:m.store_qty,pr_qty:m.pr_qty,po_qty:m.po_qty,vendor:m.vendor},old={},changed={};
      if(out.fileType==='stock'&&row.store_qty!==null){old.store_qty=m.store_qty;next.store_qty=row.store_qty;changed.store_qty=row.store_qty}
      if(out.fileType==='open_pr'&&row.pr_qty!==null){old.pr_qty=m.pr_qty;next.pr_qty=row.pr_qty;changed.pr_qty=row.pr_qty}
      if(out.fileType==='open_po'&&row.po_qty!==null){old.po_qty=m.po_qty;next.po_qty=row.po_qty;changed.po_qty=row.po_qty;if(row.vendor){old.vendor=m.vendor;next.vendor=row.vendor;changed.vendor=row.vendor}}
      if(!Object.keys(changed).length||Object.keys(changed).every(k=>same(old[k],changed[k]))){unchanged++;continue}
      await q('UPDATE materials SET store_qty=$1,pr_qty=$2,po_qty=$3,vendor=$4,updated_by=$5,updated_at=NOW() WHERE id=$6',[next.store_qty,next.pr_qty,next.po_qty,next.vendor,req.user.id,m.id]);
      changes.push({material_id:m.id,material_code:row.material_code,old,new:changed});updated++;
    }
  }
  const details={department_code,equipment,default_discipline:discipline||null,file_type:out.fileType,ai_source:out.source,issues:out.issues,missing_material_codes:missing,repaired_material_codes:repairs,changes};
  const hist=(await q(`INSERT INTO import_history(import_type,file_name,total_rows,added_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('universal_ai',$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[req.file.originalname,out.rows.length,added,updated,skipped,out.issues.length,JSON.stringify(details),req.user.id])).rows[0];
  const eventResult=await recordImportMaterialEvents(changes,{sourceType:`universal_${out.fileType}`,sourceRef:req.file.originalname,importHistoryId:hist.id,createdBy:req.user.id});
  let procurementStored=0;
  if(procurementRows.length&&await procurementEventsAvailable())for(const event of procurementRows){const saved=await appendProcurementEvent({...event,source_batch_id:hist.id,source_file:req.file.originalname,created_by:req.user.id});if(saved.stored)procurementStored++}
  res.json({ok:true,batchId:hist.id,fileType:out.fileType,total:out.rows.length,added,updated,unchanged,skipped,repairedMaterialCodes,missingMaterialCodes:missing,issues:out.issues,eventStore:eventResult,procurementEventStore:{enabled:await procurementEventsAvailable(),captured:procurementStored,candidates:procurementRows.length}});
});

export default r;
