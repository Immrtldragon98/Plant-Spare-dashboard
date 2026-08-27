import {Router} from 'express';
import {q} from '../db.js';
import {auth} from '../auth.js';
import {areaVariants} from '../domain/area.js';

const r=Router();

r.get('/procurement',auth,async(req,res)=>{
  const {department_code='',area='',type='po',search=''}=req.query;
  const p=[],w=['m.active=true','u.active=true',`(m.material_code IS NULL OR m.material_code ~ '^[A-Z]{3}[0-9]{12}$')`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(type==='pr')w.push('COALESCE(m.pr_qty,0)>0');
  else if(type==='po')w.push('COALESCE(m.po_qty,0)>0');
  else w.push('(COALESCE(m.pr_qty,0)>0 OR COALESCE(m.po_qty,0)>0)');
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const x=await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.pr_qty,m.po_qty,m.vendor,string_agg(DISTINCT CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END,', ' ORDER BY CASE WHEN l.area_name='CH2_WRM' THEN 'WRM' WHEN l.area_name='CH2_ICM' THEN 'ICM' ELSE l.area_name END) areas,string_agg(DISTINCT l.equipment_name,', ' ORDER BY l.equipment_name) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.id ORDER BY CASE WHEN $${p.length+1}='pr' THEN COALESCE(m.pr_qty,0) ELSE COALESCE(m.po_qty,0) END DESC,m.material_code`,[...p,type]);
  res.json(x.rows);
});

export default r;
