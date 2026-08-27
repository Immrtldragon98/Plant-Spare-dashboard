import { Router } from 'express';
import { q } from '../db.js';
import { auth,allow } from '../auth.js';
import { listSql } from '../models/materialModel.js';
import { findOrCreateLocation } from '../services/locationService.js';
import { audit } from '../services/auditService.js';
import { canonicalMaterialCode } from '../excel.js';

const r=Router();
const strictCode=v=>{if(v===null||v===undefined||String(v).trim()==='')return null;const raw=String(v).trim().toUpperCase(),code=canonicalMaterialCode(raw);if(!code)throw new Error('Material Code must be exactly 3 uppercase letters followed by 12 digits, e.g. MMT311715050461');return code};

r.get('/materials',auth,async(req,res)=>{
  const {search='',department_code='',area='',equipment='',sub_equipment='',discipline='',vendor='',active='true'}=req.query;
  const p=[],w=[];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(active!=='all') add('u.active=?',active==='true');
  add('m.active=?',true);
  if(department_code) add('l.department_code=?',department_code);
  if(area) add('l.area_name=?',area);
  if(equipment) add('l.equipment_name=?',equipment);
  if(sub_equipment) add('l.sub_equipment_name=?',sub_equipment);
  if(discipline) add('u.discipline=?',discipline);
  if(vendor) add('m.vendor=?',vendor);
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.part_number ILIKE $${p.length} OR l.department_name ILIKE $${p.length} OR l.equipment_name ILIKE $${p.length} OR l.sub_equipment_name ILIKE $${p.length} OR u.discipline ILIKE $${p.length} OR m.vendor ILIKE $${p.length} OR l.sap_location_code ILIKE $${p.length})`)}
  const x=await q(`${listSql} ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY l.area_name,l.equipment_name,l.sub_equipment_name,m.spare_name,m.material_code LIMIT 10000`,p);res.json(x.rows);
});

r.get('/dashboard',auth,async(req,res)=>{const {department_code='',area='',discipline=''}=req.query;const p=[],w=['m.active=true','u.active=true'];if(department_code){p.push(department_code);w.push(`l.department_code=$${p.length}`)}if(area){p.push(area);w.push(`l.area_name=$${p.length}`)}if(discipline){p.push(discipline);w.push(`u.discipline=$${p.length}`)}const x=await q(`SELECT count(DISTINCT m.id) total,count(DISTINCT m.id) FILTER(WHERE m.store_qty>0) available,count(DISTINCT m.id) FILTER(WHERE m.pr_qty>0) in_pr,count(DISTINCT m.id) FILTER(WHERE m.po_qty>0) in_po,count(*) FILTER(WHERE u.required_qty IS NOT NULL AND COALESCE(m.store_qty,0)+COALESCE(m.pr_qty,0)+COALESCE(m.po_qty,0)<u.required_qty) shortage FROM material_usages u JOIN materials m ON m.id=u.material_id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')}`,p);res.json(x.rows[0])});

r.get('/vendors',auth,async(req,res)=>{const {department_code='',area=''}=req.query;const p=[],w=['m.active=true','u.active=true'];if(department_code){p.push(department_code);w.push(`l.department_code=$${p.length}`)}if(area){p.push(area);w.push(`l.area_name=$${p.length}`)}const x=await q(`SELECT COALESCE(m.vendor,'(Blank)') vendor,count(DISTINCT m.id) material_count,string_agg(DISTINCT l.area_name,', ' ORDER BY l.area_name) areas FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.vendor ORDER BY material_count DESC,vendor`,p);res.json(x.rows)});

r.post('/materials',auth,allow('planner','admin'),async(req,res)=>{
  const x=req.body;if(!x.department_code||!x.area)return res.status(400).json({error:'Department and Area are required'});const code=strictCode(x.material_code);
  let m=code?(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1)',[code])).rows[0]:null;
  if(!m)m=(await q(`INSERT INTO materials(material_code,spare_name,description,part_number,uom,store_qty,pr_qty,po_qty,manufacturer,vendor,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,[code,x.spare_name||null,x.description||null,x.part_number||null,x.uom||null,x.store_qty??null,x.pr_qty??null,x.po_qty??null,x.manufacturer||null,x.vendor||null,req.user.id])).rows[0];
  else m=(await q(`UPDATE materials SET spare_name=COALESCE($1,spare_name),description=COALESCE($2,description),part_number=COALESCE($3,part_number),uom=COALESCE($4,uom),store_qty=COALESCE($5,store_qty),pr_qty=COALESCE($6,pr_qty),po_qty=COALESCE($7,po_qty),manufacturer=COALESCE($8,manufacturer),vendor=COALESCE($9,vendor),active=true,updated_by=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[x.spare_name||null,x.description||null,x.part_number||null,x.uom||null,x.store_qty??null,x.pr_qty??null,x.po_qty??null,x.manufacturer||null,x.vendor||null,req.user.id,m.id])).rows[0];
  const loc=await findOrCreateLocation(x);const usage=(await q(`INSERT INTO material_usages(material_id,location_id,required_qty,discipline,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(material_id,location_id) DO UPDATE SET required_qty=EXCLUDED.required_qty,discipline=COALESCE(EXCLUDED.discipline,material_usages.discipline),notes=EXCLUDED.notes,active=true,updated_by=$6,updated_at=NOW() RETURNING *`,[m.id,loc.id,x.required_qty??null,x.discipline||null,x.notes||null,req.user.id])).rows[0];await audit(req.user,'create_or_link','material_usage',usage.id,m.material_code,null,{material:m,usage,location:loc});res.json({...m,...usage,location:loc})
});

r.put('/materials/:usageId',auth,allow('planner','admin'),async(req,res)=>{const old=(await q(`${listSql} WHERE u.id=$1`,[req.params.usageId])).rows[0];if(!old)return res.status(404).json({error:'Spare usage not found'});const x={...old,...req.body},code=strictCode(x.material_code);const m=(await q(`UPDATE materials SET material_code=$1,spare_name=$2,description=$3,part_number=$4,uom=$5,store_qty=$6,pr_qty=$7,po_qty=$8,manufacturer=$9,vendor=$10,updated_by=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[code,x.spare_name||null,x.description||null,x.part_number||null,x.uom||null,x.store_qty??null,x.pr_qty??null,x.po_qty??null,x.manufacturer||null,x.vendor||null,req.user.id,old.material_id])).rows[0];const loc=await findOrCreateLocation(x);const u=(await q(`UPDATE material_usages SET location_id=$1,required_qty=$2,discipline=$3,notes=$4,updated_by=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[loc.id,x.required_qty??null,x.discipline||null,x.notes||null,req.user.id,req.params.usageId])).rows[0];await audit(req.user,'update','material_usage',u.id,m.material_code,old,{...m,...u,location:loc});res.json({...m,...u,location:loc})});

r.delete('/materials/:usageId',auth,allow('planner','admin'),async(req,res)=>{const old=(await q(`${listSql} WHERE u.id=$1`,[req.params.usageId])).rows[0];if(!old)return res.status(404).json({error:'Spare usage not found'});await q('UPDATE material_usages SET active=false,updated_by=$1,updated_at=NOW() WHERE id=$2',[req.user.id,req.params.usageId]);await audit(req.user,'deactivate_usage','material_usage',req.params.usageId,old.material_code,old,null);res.json({ok:true})});

export default r;
