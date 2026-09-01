import {q} from '../db.js';
import {listSql} from '../models/materialModel.js';
import {areaVariants} from '../domain/area.js';

const cleanData=`(m.material_code IS NULL OR m.material_code ~ '^[A-Z]{3}[0-9]{12}$') AND NOT (m.material_code IS NULL AND upper(COALESCE(m.spare_name,m.description,'')) ~ '(BRING ITEM INSIDE|DON''T THROW USED SPARE|DURING FIRST TIME|TRACK SHOP FLOOR|CHECK THE QUALITY|EFFECTIVE PLANNING|SPARE POOR QUALITY|GIVE ANY FEEDBACK|NEW DRAWING DEVELOPMENT|FREQUENCY SPARE PLANNING|YEAR ONCE|YEARLY ONCE)')`;
const text=v=>String(v??'').trim();

function filtersWhere(input={}){
  const p=[],w=[cleanData,'m.active=true'];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  const active=text(input.active||'true');
  if(active!=='all')add('u.active=?',active==='true');
  if(text(input.department_code))add('l.department_code=?',text(input.department_code));
  if(text(input.area)){p.push(areaVariants(text(input.area)));w.push(`l.area_name=ANY($${p.length})`)}
  if(text(input.equipment))add('l.equipment_name=?',text(input.equipment));
  if(text(input.sub_equipment))add('l.sub_equipment_name=?',text(input.sub_equipment));
  if(text(input.discipline))add('u.discipline=?',text(input.discipline));
  if(text(input.vendor))add('m.vendor=?',text(input.vendor));
  if(text(input.search)){
    p.push(`%${text(input.search)}%`);
    w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.part_number ILIKE $${p.length} OR l.department_name ILIKE $${p.length} OR l.equipment_name ILIKE $${p.length} OR l.sub_equipment_name ILIKE $${p.length} OR u.discipline ILIKE $${p.length} OR m.vendor ILIKE $${p.length} OR l.sap_location_code ILIKE $${p.length})`);
  }
  return {p,w};
}

export async function getMaterialPage(input={}){
  const page=Math.max(Number(input.page)||1,1);
  const pageSize=Math.min(Math.max(Number(input.page_size)||50,10),200);
  const {p,w}=filtersWhere(input);
  const where=w.join(' AND ');
  const count=(await q(`SELECT COUNT(*)::int total FROM material_usages u JOIN materials m ON m.id=u.material_id JOIN locations l ON l.id=u.location_id WHERE ${where}`,p)).rows[0]?.total||0;
  const offset=(page-1)*pageSize;
  const qp=[...p,pageSize,offset];
  const rows=(await q(`${listSql} WHERE ${where} ORDER BY l.area_name,l.equipment_name,l.sub_equipment_name,m.spare_name,m.material_code,u.id LIMIT $${p.length+1} OFFSET $${p.length+2}`,qp)).rows;
  return {rows,pagination:{page,page_size:pageSize,total:count,pages:Math.max(Math.ceil(count/pageSize),1),has_previous:page>1,has_next:offset+rows.length<count}};
}
