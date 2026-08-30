import {Router} from 'express';
import multer from 'multer';
import {q} from '../db.js';
import {auth,allow} from '../auth.js';
import {parseMasterExcel,parseTypedSapExcel,canonicalMaterialCode,extractLegacyMaterialCode} from '../excel.js';
import {findOrCreateLocation,getDepartment} from '../services/locationService.js';
import {audit} from '../services/auditService.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const validDisciplines=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
const validUploadTypes=['stock','open_pr','open_po'];

async function scope(req){
  const department_code=(req.body.department_code||'').trim();
  if(!department_code)throw new Error('Select a department before importing');
  const dept=await getDepartment(department_code);
  if(!dept)throw new Error('Unknown department');
  const discipline=(req.body.discipline||'').trim();
  if(discipline&&!validDisciplines.includes(discipline))throw new Error('Invalid discipline');
  return {department_code,dept,area:req.body.area||'',discipline};
}

function uploadType(req){const t=(req.body.upload_type||'stock').trim();if(!validUploadTypes.includes(t))throw new Error('Choose Stock, Open PR, or Open PO');return t}
function typeLabel(t){return t==='stock'?'Stock':t==='open_pr'?'Open PR':'Open PO'}
function findSafeCandidate(code,materials){
  const exactDescription=materials.filter(m=>String(m.description||'').trim().toUpperCase()===code);
  if(exactDescription.length===1&&!canonicalMaterialCode(exactDescription[0].material_code))return {row:exactDescription[0],reason:'Material Code was stored in Description'};
  const embedded=materials.filter(m=>m.material_code&&String(m.material_code).trim().toUpperCase()!==code&&extractLegacyMaterialCode(m.material_code)===code);
  if(embedded.length===1)return {row:embedded[0],reason:'Material Code was embedded inside old Material Code text'};
  return null;
}
function same(a,b){if(a===null||a===undefined||a==='')return b===null||b===undefined||b==='';if(typeof a==='number'||typeof b==='number')return Number(a)===Number(b);return String(a)===String(b)}
function masterSame(current,row){return ['spare_name','description','part_number','uom','manufacturer','vendor'].every(k=>row[k]===null||row[k]===''||same(current?.[k],row[k]))}
function usageSame(current,row){if(!current)return false;return (row.required_qty===null||same(current.required_qty,row.required_qty))&&(row.discipline===null||row.discipline===''||same(current.discipline,row.discipline))&&(row.notes===null||row.notes===''||same(current.notes,row.notes))}
function locationMatches(cur,row){if(!cur)return false;const area=String(cur.area_name||'');const eq=String(cur.equipment_name||'');const sub=String(cur.sub_equipment_name||'');return area===row.area&&((eq===row.equipment&&sub===String(row.sub_equipment||''))||(eq===String(row.sub_equipment||'')&&!sub));}

r.post('/import/master/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const {department_code,area,discipline}=await scope(req);
  if(!area)return res.status(400).json({error:'Select an Area before importing a spare master'});
  const out=parseMasterExcel(req.file.buffer,area,department_code,discipline),seen=new Set(),dups=[];
  out.materials.forEach(m=>{const k=`${m.material_code||m.spare_name}|${department_code}|${m.area}|${m.equipment||''}|${m.sub_equipment||''}`;if(seen.has(k))dups.push(k);seen.add(k)});
  const existing=(await q(`SELECT m.*,u.required_qty,u.discipline,u.notes,l.area_name,l.equipment_name,l.sub_equipment_name FROM materials m LEFT JOIN material_usages u ON u.material_id=m.id AND u.active=true LEFT JOIN locations l ON l.id=u.location_id AND l.department_code=$1 WHERE m.active=true`,[department_code])).rows;
  const byCode=new Map();for(const e of existing){const c=String(e.material_code||'').toUpperCase();if(c&&!byCode.has(c))byCode.set(c,e)}
  let newRows=0,changedRows=0,unchangedRows=0,noCodeRows=0;
  const classifications=[];
  for(const row of out.materials){
    if(!row.material_code){noCodeRows++;classifications.push({material_code:null,spare_name:row.spare_name,status:'NO CODE',sheet:row.source_sheet});continue}
    const master=byCode.get(row.material_code);
    if(!master){newRows++;classifications.push({material_code:row.material_code,spare_name:row.spare_name,status:'NEW',sheet:row.source_sheet});continue}
    const candidates=existing.filter(e=>e.id===master.id&&locationMatches(e,row));const usage=candidates[0];
    if(masterSame(master,row)&&usageSame(usage,row)){unchangedRows++;classifications.push({material_code:row.material_code,spare_name:row.spare_name,status:'UNCHANGED',sheet:row.source_sheet})}
    else{changedRows++;classifications.push({material_code:row.material_code,spare_name:row.spare_name,status:'CHANGED',sheet:row.source_sheet})}
  }
  const unmapped=[...new Set(out.materials.filter(x=>!x.sap_location_code).map(x=>`${x.area} → ${x.equipment||'(Area level)'}${x.sub_equipment?' → '+x.sub_equipment:''}`))];
  const disciplineCounts=out.materials.reduce((a,x)=>{const d=x.discipline||'(Blank)';a[d]=(a[d]||0)+1;return a},{});
  res.json({fileName:req.file.originalname,totalRows:out.materials.length,newRows,changedRows,unchangedRows,noCodeRows,materials:out.materials.slice(0,100),classifications:classifications.slice(0,150),issues:out.issues,duplicateUsages:dups.slice(0,50),unmappedLocations:unmapped,disciplineCounts,message:`Preview only: ${newRows} new, ${changedRows} changed, ${unchangedRows} unchanged, ${noCodeRows} without SAP Material Code.`});
});

r.post('/import/master/confirm',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const {department_code,area,discipline}=await scope(req);
  if(!area)return res.status(400).json({error:'Select an Area before importing a spare master'});
  const out=parseMasterExcel(req.file.buffer,area,department_code,discipline);
  let added=0,updated=0,unchanged=0,skipped=0;
  for(const row of out.materials){
    const x={...row,department_code};
    const loc=await findOrCreateLocation(x);
    let m=x.material_code?(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1)',[x.material_code])).rows[0]:null;
    if(!m&&!x.material_code&&(x.spare_name||x.description)){
      m=(await q(`SELECT m.* FROM materials m JOIN material_usages u ON u.material_id=m.id WHERE u.location_id=$1 AND u.active=true AND m.active=true AND lower(COALESCE(m.spare_name,''))=lower($2) AND lower(COALESCE(m.description,''))=lower($3) ORDER BY m.id LIMIT 1`,[loc.id,x.spare_name||'',x.description||''])).rows[0]||null;
    }
    let materialChanged=false;
    if(!m){m=(await q(`INSERT INTO materials(material_code,spare_name,description,part_number,uom,manufacturer,vendor,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,[x.material_code,x.spare_name,x.description,x.part_number,x.uom,x.manufacturer,x.vendor,req.user.id])).rows[0];added++;materialChanged=true}
    else{
      const merged={...m};for(const k of ['spare_name','description','part_number','uom','manufacturer','vendor'])if(x[k]!==null&&x[k]!=='')merged[k]=x[k];
      materialChanged=!['spare_name','description','part_number','uom','manufacturer','vendor'].every(k=>same(m[k],merged[k]));
      if(materialChanged)m=(await q(`UPDATE materials SET spare_name=$1,description=$2,part_number=$3,uom=$4,manufacturer=$5,vendor=$6,active=true,updated_by=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,[merged.spare_name,merged.description,merged.part_number,merged.uom,merged.manufacturer,merged.vendor,req.user.id,m.id])).rows[0];
    }
    const oldUsage=(await q('SELECT * FROM material_usages WHERE material_id=$1 AND location_id=$2',[m.id,loc.id])).rows[0];
    const usageChanged=!usageSame(oldUsage,x)||!oldUsage?.active;
    if(usageChanged)await q(`INSERT INTO material_usages(material_id,location_id,required_qty,discipline,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(material_id,location_id) DO UPDATE SET required_qty=COALESCE(EXCLUDED.required_qty,material_usages.required_qty),discipline=COALESCE(EXCLUDED.discipline,material_usages.discipline),notes=COALESCE(NULLIF(EXCLUDED.notes,''),material_usages.notes),active=true,updated_by=$6,updated_at=NOW()`,[m.id,loc.id,x.required_qty,x.discipline,x.notes,req.user.id]);
    if(!materialChanged&&!usageChanged&&oldUsage)unchanged++;else if(!materialChanged&&usageChanged&&m)updated++;else if(materialChanged&&m&&added===0)updated++;
  }
  await q(`INSERT INTO import_history(import_type,file_name,total_rows,added_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('master',$1,$2,$3,$4,$5,$6,$7,$8)`,[req.file.originalname,out.materials.length,added,updated,skipped,out.issues.length,JSON.stringify({department_code,area,discipline,unchanged,issues:out.issues}),req.user.id]);
  res.json({ok:true,total:out.materials.length,added,updated,unchanged,skipped,issues:out.issues});
});

r.post('/import/sap/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel export required'});
  const {department_code}=await scope(req),t=uploadType(req),out=parseTypedSapExcel(req.file.buffer,t);
  if(!out.rows.length)return res.status(400).json({error:out.issues[0]?.reason||`No valid ${typeLabel(t)} rows found`,issues:out.issues,diagnostics:out.sheetDiagnostics});
  const materials=(await q('SELECT id,material_code,spare_name,description FROM materials WHERE active=true')).rows;
  const exactSet=new Set(materials.map(m=>String(m.material_code||'').trim().toUpperCase()).filter(Boolean));
  const exact=[],missing=[],safeCorrections=[];
  for(const row of out.rows){if(exactSet.has(row.material_code)){exact.push(row.material_code);continue}const candidate=findSafeCandidate(row.material_code,materials);if(candidate)safeCorrections.push({material_code:row.material_code,current_material_code:candidate.row.material_code,current_description:candidate.row.description,reason:candidate.reason});else missing.push(row.material_code)}
  res.json({fileName:req.file.originalname,uploadType:t,uploadTypeLabel:typeLabel(t),totalRows:out.rows.length,rows:out.rows.slice(0,100),issues:out.issues,exactMatches:exact.length,missingMaterialCodes:missing.slice(0,100),safeCorrections:safeCorrections.slice(0,100),sheetDiagnostics:out.sheetDiagnostics,message:`${typeLabel(t)}: ${exact.length} exact code matches, ${safeCorrections.length} safe corrections, ${missing.length} missing codes.`});
});

r.post('/import/sap/confirm',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel export required'});
  const {department_code}=await scope(req),t=uploadType(req),out=parseTypedSapExcel(req.file.buffer,t);
  if(!out.rows.length)return res.status(400).json({error:out.issues[0]?.reason||`No valid ${typeLabel(t)} rows found`});
  let updated=0,skipped=0,correctedCodes=0;const missing=[],changes=[];
  let materials=(await q('SELECT * FROM materials WHERE active=true')).rows;
  for(const s of out.rows){
    let ex=materials.find(m=>String(m.material_code||'').trim().toUpperCase()===s.material_code);
    if(!ex){const candidate=findSafeCandidate(s.material_code,materials);if(candidate){const old={...candidate.row};ex=(await q(`UPDATE materials SET material_code=$1,spare_name=COALESCE(NULLIF(spare_name,''),$2),description=CASE WHEN upper(trim(COALESCE(description,'')))=upper($1) THEN NULL ELSE description END,updated_by=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,[s.material_code,old.material_code,req.user.id,old.id])).rows[0];materials=materials.map(m=>m.id===ex.id?ex:m);await audit(req.user,'material_code_safe_correction','material',ex.id,s.material_code,old,ex);correctedCodes++}}
    if(!ex){missing.push(s.material_code);skipped++;continue}
    const oldFields={};const newFields={};
    if(t==='stock'&&s.store_qty!==null){oldFields.store_qty=ex.store_qty;newFields.store_qty=s.store_qty}
    if(t==='open_pr'&&s.pr_qty!==null){oldFields.pr_qty=ex.pr_qty;newFields.pr_qty=s.pr_qty}
    if(t==='open_po'&&s.po_qty!==null){oldFields.po_qty=ex.po_qty;newFields.po_qty=s.po_qty;if(s.vendor){oldFields.vendor=ex.vendor;newFields.vendor=s.vendor}}
    if(!Object.keys(newFields).length){skipped++;continue}
    const next={...ex,...newFields};
    const y=(await q('UPDATE materials SET store_qty=$1,pr_qty=$2,po_qty=$3,vendor=$4,updated_by=$5,updated_at=NOW() WHERE id=$6 RETURNING *',[next.store_qty,next.pr_qty,next.po_qty,next.vendor,req.user.id,ex.id])).rows[0];
    changes.push({material_id:ex.id,material_code:s.material_code,old:oldFields,new:newFields});
    await audit(req.user,`${t}_import_update`,'material',ex.id,s.material_code,ex,y);updated++;
  }
  const details={department_code,upload_type:t,corrected_material_codes:correctedCodes,missing_material_codes:missing,issues:out.issues,changes};
  const hist=(await q(`INSERT INTO import_history(import_type,file_name,total_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('sap_status',$1,$2,$3,$4,$5,$6,$7) RETURNING id`,[req.file.originalname,out.rows.length,updated,skipped,out.issues.length,JSON.stringify(details),req.user.id])).rows[0];
  res.json({ok:true,batchId:hist.id,uploadType:t,total:out.rows.length,updated,skipped,correctedMaterialCodes:correctedCodes,missingMaterialCodes:missing});
});

r.post('/import-history/:id/rollback',auth,allow('admin'),async(req,res)=>{
  const h=(await q('SELECT * FROM import_history WHERE id=$1',[req.params.id])).rows[0];
  if(!h)return res.status(404).json({error:'Import batch not found'});
  const details=h.details||{};if(details.rolled_back_at)return res.status(400).json({error:'This import was already rolled back'});
  if(!Array.isArray(details.changes)||!details.changes.length)return res.status(400).json({error:'This import does not contain reversible status changes'});
  let restored=0;const conflicts=[];
  for(const c of details.changes){const cur=(await q('SELECT * FROM materials WHERE id=$1',[c.material_id])).rows[0];if(!cur){conflicts.push({material_code:c.material_code,reason:'Material no longer exists'});continue}const keys=Object.keys(c.new||{});if(!keys.every(k=>same(cur[k],c.new[k]))){conflicts.push({material_code:c.material_code,reason:'Material changed after this import'});continue}const next={...cur,...c.old};await q('UPDATE materials SET store_qty=$1,pr_qty=$2,po_qty=$3,vendor=$4,updated_by=$5,updated_at=NOW() WHERE id=$6',[next.store_qty,next.pr_qty,next.po_qty,next.vendor,req.user.id,cur.id]);restored++}
  details.rolled_back_at=new Date().toISOString();details.rolled_back_by=req.user.id;details.rollback_conflicts=conflicts;
  await q('UPDATE import_history SET details=$1 WHERE id=$2',[JSON.stringify(details),h.id]);
  res.json({ok:true,restored,conflicts});
});

r.get('/import-history',auth,allow('planner','admin'),async(req,res)=>res.json((await q(`SELECT h.*,u.name imported_by_name,COALESCE(h.details->>'upload_type',h.import_type) display_type FROM import_history h LEFT JOIN users u ON u.id=h.imported_by ORDER BY imported_at DESC LIMIT 100`)).rows));
export default r;
