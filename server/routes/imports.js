import {Router} from 'express';
import multer from 'multer';
import {q} from '../db.js';
import {auth,allow} from '../auth.js';
import {parseMasterExcel,parseSapStatusExcel} from '../excel.js';
import {findOrCreateLocation,getDepartment} from '../services/locationService.js';
import {audit} from '../services/auditService.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const validDisciplines=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];

async function scope(req){
  const department_code=(req.body.department_code||'').trim();
  if(!department_code)throw new Error('Select a department before importing');
  const dept=await getDepartment(department_code);
  if(!dept)throw new Error('Unknown department');
  const discipline=(req.body.discipline||'').trim();
  if(discipline&&!validDisciplines.includes(discipline))throw new Error('Invalid discipline');
  return {department_code,dept,area:req.body.area||'',discipline};
}

r.post('/import/master/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const {department_code,area,discipline}=await scope(req);
  if(!area)return res.status(400).json({error:'Select an Area before importing a spare master'});
  const out=parseMasterExcel(req.file.buffer,area,department_code,discipline),seen=new Set(),dups=[];
  out.materials.forEach(m=>{const k=`${m.material_code||m.spare_name}|${department_code}|${m.area}|${m.equipment||''}|${m.sub_equipment||''}`;if(seen.has(k))dups.push(k);seen.add(k)});
  const unmapped=[...new Set(out.materials.filter(x=>!x.sap_location_code).map(x=>`${x.area} → ${x.equipment||'(Area level)'}${x.sub_equipment?' → '+x.sub_equipment:''}`))];
  const disciplineCounts=out.materials.reduce((a,x)=>{const d=x.discipline||'(Blank)';a[d]=(a[d]||0)+1;return a},{});
  res.json({fileName:req.file.originalname,totalRows:out.materials.length,materials:out.materials.slice(0,100),issues:out.issues,duplicateUsages:dups.slice(0,50),unmappedLocations:unmapped,disciplineCounts,message:'Preview only. Unmapped equipment can be imported and linked to SAP later.'});
});

r.post('/import/master/confirm',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const {department_code,area,discipline}=await scope(req);
  if(!area)return res.status(400).json({error:'Select an Area before importing a spare master'});
  const out=parseMasterExcel(req.file.buffer,area,department_code,discipline);
  let added=0,updated=0,skipped=0;
  for(const row of out.materials){
    const x={...row,department_code};
    let m=x.material_code?(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1)',[x.material_code])).rows[0]:null;
    if(!m){
      m=(await q(`INSERT INTO materials(material_code,spare_name,description,part_number,uom,manufacturer,vendor,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,[x.material_code,x.spare_name,x.description,x.part_number,x.uom,x.manufacturer,x.vendor,req.user.id])).rows[0];
      added++;
    }else{
      const merged={...m};
      for(const k of ['spare_name','description','part_number','uom','manufacturer','vendor'])if(x[k]!==null&&x[k]!=='')merged[k]=x[k];
      m=(await q(`UPDATE materials SET spare_name=$1,description=$2,part_number=$3,uom=$4,manufacturer=$5,vendor=$6,active=true,updated_by=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,[merged.spare_name,merged.description,merged.part_number,merged.uom,merged.manufacturer,merged.vendor,req.user.id,m.id])).rows[0];
      updated++;
    }
    const loc=await findOrCreateLocation(x);
    await q(`INSERT INTO material_usages(material_id,location_id,required_qty,discipline,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(material_id,location_id) DO UPDATE SET required_qty=COALESCE(EXCLUDED.required_qty,material_usages.required_qty),discipline=COALESCE(EXCLUDED.discipline,material_usages.discipline),notes=COALESCE(NULLIF(EXCLUDED.notes,''),material_usages.notes),active=true,updated_by=$6,updated_at=NOW()`,[m.id,loc.id,x.required_qty,x.discipline,x.notes,req.user.id]);
  }
  await q(`INSERT INTO import_history(import_type,file_name,total_rows,added_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('master',$1,$2,$3,$4,$5,$6,$7,$8)`,[req.file.originalname,out.materials.length,added,updated,skipped,out.issues.length,JSON.stringify({department_code,area,discipline,issues:out.issues}),req.user.id]);
  res.json({ok:true,total:out.materials.length,added,updated,skipped,issues:out.issues});
});

r.post('/import/sap/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'SAP Excel export required'});
  const {department_code}=await scope(req),out=parseSapStatusExcel(req.file.buffer);
  const outside=out.rows.filter(x=>x.sap_location_code&&!x.sap_location_code.startsWith(department_code)).map(x=>x.material_code);
  res.json({fileName:req.file.originalname,totalRows:out.rows.length,rows:out.rows.slice(0,100),issues:out.issues,outsideDepartment:outside.slice(0,50),message:`Material Code updates Store, PR, PO and Vendor when supplied. Blank cells leave existing values unchanged. SAP locations are validated against ${department_code}.`});
});

r.post('/import/sap/confirm',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'SAP Excel export required'});
  const {department_code}=await scope(req),out=parseSapStatusExcel(req.file.buffer);
  let updated=0,skipped=0;const missing=[],outside=[];
  for(const s of out.rows){
    if(s.sap_location_code&&!s.sap_location_code.startsWith(department_code)){outside.push(s.material_code);skipped++;continue}
    const ex=(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1)',[s.material_code])).rows[0];
    if(!ex){missing.push(s.material_code);skipped++;continue}
    const store=s.store_qty===null?ex.store_qty:s.store_qty;
    const pr=s.pr_qty===null?ex.pr_qty:s.pr_qty;
    const po=s.po_qty===null?ex.po_qty:s.po_qty;
    const vendor=s.vendor===null?ex.vendor:s.vendor;
    const y=await q('UPDATE materials SET store_qty=$1,pr_qty=$2,po_qty=$3,vendor=$4,updated_by=$5,updated_at=NOW() WHERE id=$6 RETURNING *',[store,pr,po,vendor,req.user.id,ex.id]);
    await audit(req.user,'sap_status_update','material',ex.id,s.material_code,ex,y.rows[0]);
    updated++;
  }
  await q(`INSERT INTO import_history(import_type,file_name,total_rows,updated_rows,skipped_rows,issue_rows,details,imported_by) VALUES('sap_status',$1,$2,$3,$4,$5,$6,$7)`,[req.file.originalname,out.rows.length,updated,skipped,out.issues.length,JSON.stringify({department_code,missing_material_codes:missing,outside_department:outside,issues:out.issues}),req.user.id]);
  res.json({ok:true,total:out.rows.length,updated,skipped,missingMaterialCodes:missing,outsideDepartment:outside});
});

r.get('/import-history',auth,allow('planner','admin'),async(req,res)=>res.json((await q(`SELECT h.*,u.name imported_by_name FROM import_history h LEFT JOIN users u ON u.id=h.imported_by ORDER BY imported_at DESC LIMIT 100`)).rows));
export default r;
