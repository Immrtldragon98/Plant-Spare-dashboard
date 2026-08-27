import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../auth.js';
import {canonicalArea,areaVariants} from '../domain/area.js';

const r=Router();
r.get('/departments',auth,async(req,res)=>{
  const x=await q(`SELECT d.*,array_remove(array_agg(a.area_name ORDER BY a.area_name),NULL) areas FROM departments d LEFT JOIN areas a ON a.department_id=d.id AND a.active=true WHERE d.active=true GROUP BY d.id ORDER BY d.department_name`);
  res.json(x.rows.map(d=>({...d,areas:[...new Set((d.areas||[]).map(canonicalArea))].sort()})));
});

r.get('/options',auth,async(req,res)=>{
  const {department_code='',area='',equipment=''}=req.query;
  const p=[],w=['l.active=true'];
  if(department_code){p.push(department_code);w.push(`l.department_code=$${p.length}`)}
  if(area){const vars=areaVariants(area);p.push(vars);w.push(`l.area_name=ANY($${p.length})`)}
  if(equipment){p.push(equipment);w.push(`l.equipment_name=$${p.length}`)}
  const rows=(await q(`SELECT DISTINCT l.area_name,l.equipment_name,l.sub_equipment_name FROM locations l WHERE ${w.join(' AND ')}`,p)).rows;
  const departments=(await q(`SELECT department_code,department_name,plant_code FROM departments WHERE active=true ORDER BY department_name`)).rows;
  let areas=[];
  if(department_code){areas=(await q(`SELECT a.area_name FROM areas a JOIN departments d ON d.id=a.department_id WHERE a.active=true AND d.department_code=$1 ORDER BY a.area_name`,[department_code])).rows.map(x=>canonicalArea(x.area_name))}else areas=rows.map(x=>canonicalArea(x.area_name));
  areas=[...new Set(areas.filter(Boolean))].sort();
  const vendors=(await q(`SELECT DISTINCT vendor FROM materials WHERE active=true AND vendor IS NOT NULL ORDER BY vendor`)).rows.map(x=>x.vendor);
  const disciplines=(await q(`SELECT DISTINCT discipline FROM material_usages WHERE active=true AND discipline IS NOT NULL ORDER BY discipline`)).rows.map(x=>x.discipline);
  const uniq=k=>[...new Set(rows.map(x=>x[k]).filter(Boolean))].sort();
  res.json({departments,areas,equipment:uniq('equipment_name'),sub_equipment:uniq('sub_equipment_name'),vendors,disciplines});
});
export default r;
