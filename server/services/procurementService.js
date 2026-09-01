import {q} from '../db.js';
import {areaVariants} from '../domain/area.js';
import {evaluateProcurementCoverage} from '../domain/procurementRules.js';

const clean=v=>String(v??'').trim();
const paging=input=>{const page=Math.max(Number(input.page)||1,1),pageSize=Math.min(Math.max(Number(input.page_size)||50,10),100);return{page,pageSize,offset:(page-1)*pageSize}};
const pageResult=(rows,total,page,pageSize)=>({rows,pagination:{page,page_size:pageSize,total,pages:Math.max(Math.ceil(total/pageSize),1),has_previous:page>1,has_next:page*pageSize<total}});

export async function procurementCandidates({department_code='',area='',search=''}){
  const p=[],w=['m.active=true','u.active=true',`m.material_code ~ '^[A-Z]{3}[0-9]{12}$'`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const x=await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.vendor,COALESCE(m.store_qty,0) store_qty,COALESCE(m.pr_qty,0) pr_qty,COALESCE(m.po_qty,0) po_qty,SUM(COALESCE(u.required_qty,0)) required_qty,string_agg(DISTINCT l.area_name,', ' ORDER BY l.area_name) areas,string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name)) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.id`,p);
  return x.rows.map(row=>({...row,...evaluateProcurementCoverage(row)}));
}

export async function procurementSnapshot({department_code='',area='',type='po',search=''}){
  if(type==='critical'||type==='eligible'){
    const rows=await procurementCandidates({department_code,area,search});
    return rows.filter(x=>type==='critical'?x.critical:x.pr_eligible).sort((a,b)=>b.ideal_pr_qty-a.ideal_pr_qty||String(a.material_code).localeCompare(String(b.material_code)));
  }
  const p=[],w=['m.active=true','u.active=true',`(m.material_code IS NULL OR m.material_code ~ '^[A-Z]{3}[0-9]{12}$')`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(type==='pr')w.push('COALESCE(m.pr_qty,0)>0');else if(type==='po')w.push('COALESCE(m.po_qty,0)>0');else w.push('(COALESCE(m.pr_qty,0)>0 OR COALESCE(m.po_qty,0)>0)');
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const x=await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.pr_qty,m.po_qty,m.vendor,string_agg(DISTINCT l.area_name,', ' ORDER BY l.area_name) areas,string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name)) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${w.join(' AND ')} GROUP BY m.id ORDER BY CASE WHEN $${p.length+1}='pr' THEN COALESCE(m.pr_qty,0) ELSE COALESCE(m.po_qty,0) END DESC,m.material_code`,[...p,type]);
  return x.rows;
}

export async function procurementPage(input={}){
  const {department_code='',area='',type='po',search=''}=input,{page,pageSize,offset}=paging(input);
  if(type==='critical'||type==='eligible'){
    const all=await procurementCandidates({department_code,area,search});
    const filtered=all.filter(x=>type==='critical'?x.critical:x.pr_eligible).sort((a,b)=>b.ideal_pr_qty-a.ideal_pr_qty||String(a.material_code).localeCompare(String(b.material_code)));
    return pageResult(filtered.slice(offset,offset+pageSize),filtered.length,page,pageSize);
  }
  const p=[],w=['m.active=true','u.active=true',`(m.material_code IS NULL OR m.material_code ~ '^[A-Z]{3}[0-9]{12}$')`];
  const add=(sql,val)=>{p.push(val);w.push(sql.replace('?',`$${p.length}`))};
  if(department_code)add('l.department_code=?',department_code);
  if(area){p.push(areaVariants(area));w.push(`l.area_name=ANY($${p.length})`)}
  if(type==='pr')w.push('COALESCE(m.pr_qty,0)>0');else if(type==='po')w.push('COALESCE(m.po_qty,0)>0');else w.push('(COALESCE(m.pr_qty,0)>0 OR COALESCE(m.po_qty,0)>0)');
  if(search){p.push(`%${search}%`);w.push(`(m.material_code ILIKE $${p.length} OR m.spare_name ILIKE $${p.length} OR m.description ILIKE $${p.length} OR m.vendor ILIKE $${p.length})`)}
  const where=w.join(' AND ');
  const total=Number((await q(`SELECT COUNT(DISTINCT m.id)::int total FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${where}`,p)).rows[0]?.total||0);
  const qp=[...p,type,pageSize,offset],typeParam=p.length+1,limitParam=p.length+2,offsetParam=p.length+3;
  const rows=(await q(`SELECT m.id,m.material_code,m.spare_name,m.description,m.pr_qty,m.po_qty,m.vendor,string_agg(DISTINCT l.area_name,', ' ORDER BY l.area_name) areas,string_agg(DISTINCT COALESCE(l.sub_equipment_name,l.equipment_name),', ' ORDER BY COALESCE(l.sub_equipment_name,l.equipment_name)) equipment FROM materials m JOIN material_usages u ON u.material_id=m.id JOIN locations l ON l.id=u.location_id WHERE ${where} GROUP BY m.id ORDER BY CASE WHEN $${typeParam}='pr' THEN COALESCE(m.pr_qty,0) ELSE COALESCE(m.po_qty,0) END DESC,m.material_code LIMIT $${limitParam} OFFSET $${offsetParam}`,qp)).rows;
  return pageResult(rows,total,page,pageSize);
}

export function deterministicScreen(rows){return rows.map(x=>({material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason}))}
export const cleanProcurementText=clean;
