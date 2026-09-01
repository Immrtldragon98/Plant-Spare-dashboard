import {q} from '../db.js';
import {areaVariants} from '../domain/area.js';

const clean=v=>String(v??'').trim();

export async function getEquipmentSummary(input={}){
  const p=[],w=['m.active=true','u.active=true'];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(clean(input.department_code))add('l.department_code=?',clean(input.department_code));
  if(clean(input.area)){p.push(areaVariants(clean(input.area)));w.push(`l.area_name=ANY($${p.length})`)}
  if(clean(input.equipment))add('l.equipment_name=?',clean(input.equipment));
  if(clean(input.discipline))add('u.discipline=?',clean(input.discipline));
  const rows=(await q(`SELECT l.equipment_name equipment,l.sub_equipment_name sub_equipment,COUNT(*)::int usage_count,string_agg(DISTINCT u.discipline,' · ' ORDER BY u.discipline) disciplines,MAX(l.sap_location_code) sap_location_code FROM material_usages u JOIN materials m ON m.id=u.material_id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY l.equipment_name,l.sub_equipment_name ORDER BY usage_count DESC,COALESCE(l.sub_equipment_name,l.equipment_name)`,p)).rows;
  return rows;
}
