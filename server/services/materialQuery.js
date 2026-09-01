import {q} from '../db.js';

export const codeFrom=v=>String(v||'').toUpperCase().match(/[A-Z]{3}\d{12}/)?.[0]||null;
export const num=v=>Number(v||0);
export const safeText=(v,n=200)=>String(v||'').trim().slice(0,n);

function character(x){
  const tags=[],req=num(x.required_qty),store=num(x.store_qty),pr=num(x.pr_qty),po=num(x.po_qty);
  if(req>0&&store===0)tags.push('Zero stock');
  if(req>0&&store<req)tags.push('Below required');
  if(store+pr+po<req)tags.push('Uncovered shortage');
  if(pr+po>0&&store<req)tags.push('Pipeline dependent');
  if(num(x.usage_count)>1)tags.push('Multi-location');
  return tags.length?tags.join(' · '):'Currently covered';
}

function scopedWhere(context={},extra={}){
  const p=[],w=['m.active=true','u.active=true'];
  const departmentCode=safeText(extra.department_code||context.department_code,80);
  const equipment=safeText(extra.equipment||context.equipment,120);
  const subEquipment=safeText(extra.sub_equipment||context.sub_equipment,120);
  const discipline=safeText(extra.discipline||context.discipline,80);
  if(departmentCode){p.push(departmentCode);w.push(`l.department_code=$${p.length}`)}
  if(equipment){p.push(equipment);w.push(`(l.equipment_name=$${p.length} OR l.area_name=$${p.length})`)}
  if(subEquipment){p.push(subEquipment);w.push(`l.sub_equipment_name=$${p.length}`)}
  if(discipline){p.push(discipline);w.push(`u.discipline=$${p.length}`)}
  return {p,w};
}

export async function materialRows(context={},filters={}){
  const {p,w}=scopedWhere(context,filters);
  const code=codeFrom(filters.material_code||'');
  if(code){p.push(code);w.push(`m.material_code=$${p.length}`)}
  const search=safeText(filters.search,120);
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.part_number ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  if(filters.zero_stock)w.push('COALESCE(m.store_qty,0)=0');
  if(filters.no_po)w.push('COALESCE(m.po_qty,0)=0');
  const limit=Math.min(Math.max(Number(filters.limit)||20,1),50);
  const sql=`SELECT m.material_code,m.spare_name,m.description,m.part_number,m.uom,m.vendor,m.store_qty,m.pr_qty,m.po_qty,
      SUM(COALESCE(u.required_qty,0)) required_qty,
      COUNT(DISTINCT u.location_id) usage_count,
      string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name,l.area_name)) locations
    FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id
    WHERE ${w.join(' AND ')}
    GROUP BY m.id
    ORDER BY GREATEST(SUM(COALESCE(u.required_qty,0))-(COALESCE(m.store_qty,0)+COALESCE(m.pr_qty,0)+COALESCE(m.po_qty,0)),0) DESC,m.material_code
    LIMIT ${limit}`;
  let rows=(await q(sql,p)).rows.map(x=>({...x,uncovered_gap:Math.max(num(x.required_qty)-(num(x.store_qty)+num(x.pr_qty)+num(x.po_qty)),0),spare_character:character(x)}));
  if(filters.pr_eligible)rows=rows.filter(x=>num(x.required_qty)>num(x.store_qty)+num(x.pr_qty)+num(x.po_qty));
  return rows;
}

export function fallbackAnswer(rows,context){
  if(!rows.length)return `I could not find matching spare data${context?.equipment?` under ${context.equipment}`:''}. Try a Material Code, spare name, or broaden the current filters.`;
  return `Based on current dashboard data:\n${rows.slice(0,8).map(x=>`${x.material_code} — ${x.spare_name||x.description||'Spare'}: required ${num(x.required_qty)}, store ${num(x.store_qty)}, open PR ${num(x.pr_qty)}, open PO ${num(x.po_qty)}, uncovered gap ${num(x.uncovered_gap)}. Character: ${x.spare_character}. Used at ${x.locations||'unmapped location'}.`).join('\n')}`;
}
