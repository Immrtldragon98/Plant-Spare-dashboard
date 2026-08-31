import {Router} from 'express';
import {q,pool} from '../db.js';
import {auth,allow} from '../auth.js';
import {getDepartment} from '../services/locationService.js';
const r=Router();

async function ensureSubDepartment(x){
  const code=String(x.department_code||'').trim(),name=String(x.department_name||'').trim();
  if(!code)throw new Error('Sub-department Code is required');
  let dept=await getDepartment(code);
  if(!dept){
    if(!name)throw new Error('Sub-department name is required for a new code');
    dept=(await q(`INSERT INTO departments(plant_code,department_code,department_name,active) VALUES($1,$2,$3,true) ON CONFLICT(department_code) DO UPDATE SET department_name=EXCLUDED.department_name,active=true,updated_at=NOW() RETURNING *`,[x.plant_code||'3102',code,name])).rows[0];
  }
  return dept;
}

r.get('/hierarchy',auth,async(req,res)=>{
  const p=[],where=['l.active=true'];
  if(req.query.department_code){p.push(req.query.department_code);where.push(`l.department_code=$${p.length}`)}
  const includePlaceholders=req.query.include_placeholders==='true';
  const x=await q(`WITH ranked AS (
    SELECT l.*,
      COUNT(*) OVER (PARTITION BY l.department_code,
        lower(regexp_replace(trim(l.area_name),'[^a-zA-Z0-9]+','','g')),
        lower(regexp_replace(trim(COALESCE(l.equipment_name,'')),'[^a-zA-Z0-9]+','','g')),
        lower(regexp_replace(trim(COALESCE(l.sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))
      ) duplicate_count,
      ROW_NUMBER() OVER (PARTITION BY l.department_code,
        lower(regexp_replace(trim(l.area_name),'[^a-zA-Z0-9]+','','g')),
        lower(regexp_replace(trim(COALESCE(l.equipment_name,'')),'[^a-zA-Z0-9]+','','g')),
        lower(regexp_replace(trim(COALESCE(l.sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))
        ORDER BY (l.equipment_code IS NOT NULL)::int DESC,(l.sub_equipment_code IS NOT NULL)::int DESC,(l.sap_location_code IS NOT NULL)::int DESC,l.id
      ) rn,
      (SELECT COUNT(*) FROM material_usages u WHERE u.location_id=l.id AND u.active=true) active_usages
    FROM locations l WHERE ${where.join(' AND ')}
  ) SELECT *,
    CASE
      WHEN COALESCE(trim(equipment_name),'')='' AND COALESCE(trim(sub_equipment_name),'')='' THEN 'Area placeholder'
      WHEN COALESCE(trim(equipment_name),'')='' OR COALESCE(trim(equipment_code),'')='' THEN 'Needs equipment mapping'
      WHEN COALESCE(trim(sub_equipment_name),'')<>'' AND COALESCE(trim(sub_equipment_code),'')='' THEN 'Needs sub-equipment code'
      ELSE 'Mapped'
    END mapping_status
  FROM ranked
  WHERE rn=1 ${includePlaceholders?'':`AND NOT (COALESCE(trim(equipment_name),'')='' AND COALESCE(trim(sub_equipment_name),'')='')`}
  ORDER BY department_name,area_name,equipment_name NULLS FIRST,sub_equipment_name NULLS FIRST`,p);
  res.json(x.rows)
});

const findDuplicate=async({excludeId=null,departmentCode,areaName,equipmentName='',subEquipmentName=''})=>{
  const params=[];let idClause='';
  if(excludeId!==null){params.push(excludeId);idClause=`id<>$${params.length} AND `}
  params.push(departmentCode,areaName,equipmentName,subEquipmentName);
  const base=params.length-3;
  const sql=`SELECT * FROM locations WHERE ${idClause}department_code=$${base}
    AND lower(regexp_replace(trim(area_name),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim($${base+1}),'[^a-zA-Z0-9]+','','g'))
    AND lower(regexp_replace(trim(COALESCE(equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($${base+2},'')),'[^a-zA-Z0-9]+','','g'))
    AND lower(regexp_replace(trim(COALESCE(sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($${base+3},'')),'[^a-zA-Z0-9]+','','g'))
    AND active=true ORDER BY id LIMIT 1`;
  return (await q(sql,params)).rows[0];
};

r.post('/hierarchy',auth,allow('admin'),async(req,res)=>{
  const x=req.body,dept=await ensureSubDepartment(x);if(!x.area_name)return res.status(400).json({error:'Equipment is required'});
  const subDepartmentName=String(x.department_name||dept.department_name||'').trim();
  if(subDepartmentName&&subDepartmentName!==dept.department_name){
    await q('UPDATE departments SET department_name=$1,updated_at=NOW() WHERE id=$2',[subDepartmentName,dept.id]);
    await q('UPDATE locations SET department_name=$1,updated_at=NOW() WHERE department_code=$2',[subDepartmentName,x.department_code]);
  }
  await q(`INSERT INTO areas(department_id,area_code,area_name) VALUES($1,$2,$3) ON CONFLICT(department_id,area_name) DO UPDATE SET area_code=COALESCE(EXCLUDED.area_code,areas.area_code),active=true,updated_at=NOW()`,[dept.id,x.area_code||null,x.area_name]);
  const existing=await findDuplicate({departmentCode:x.department_code,areaName:x.area_name,equipmentName:x.equipment_name||'',subEquipmentName:x.sub_equipment_name||''});
  if(existing)return res.status(409).json({error:'This Equipment / Sub-equipment already exists. Edit one of the rows to merge them.'});
  const y=await q(`INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name,sub_equipment_code,sub_equipment_name,sap_location_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[dept.plant_code,dept.department_code,subDepartmentName||dept.department_name,x.area_code||null,x.area_name,x.equipment_code||null,x.equipment_name||null,x.sub_equipment_code||null,x.sub_equipment_name||null,x.sap_location_code||null]);res.json(y.rows[0])
});

r.put('/hierarchy/:id',auth,allow('admin'),async(req,res)=>{
  const old=(await q('SELECT * FROM locations WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'Location not found'});
  const x={...old,...req.body},dept=await ensureSubDepartment(x);
  const subDepartmentName=String(x.department_name||dept.department_name||'').trim();
  const duplicate=await findDuplicate({excludeId:Number(req.params.id),departmentCode:x.department_code,areaName:x.area_name,equipmentName:x.equipment_name||'',subEquipmentName:x.sub_equipment_name||''});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    if(subDepartmentName&&subDepartmentName!==dept.department_name){
      await client.query('UPDATE departments SET department_name=$1,updated_at=NOW() WHERE id=$2',[subDepartmentName,dept.id]);
      await client.query('UPDATE locations SET department_name=$1,updated_at=NOW() WHERE department_code=$2',[subDepartmentName,x.department_code]);
    }
    await client.query(`INSERT INTO areas(department_id,area_code,area_name) VALUES($1,$2,$3) ON CONFLICT(department_id,area_name) DO UPDATE SET area_code=COALESCE(EXCLUDED.area_code,areas.area_code),active=true,updated_at=NOW()`,[dept.id,x.area_code||null,x.area_name]);
    if(duplicate){
      const targetId=duplicate.id,sourceId=Number(req.params.id);
      await client.query(`UPDATE material_usages target SET required_qty=COALESCE(target.required_qty,source.required_qty),discipline=COALESCE(target.discipline,source.discipline),notes=COALESCE(target.notes,source.notes),active=(target.active OR source.active),updated_by=$3,updated_at=NOW() FROM material_usages source WHERE source.location_id=$1 AND target.location_id=$2 AND target.material_id=source.material_id`,[sourceId,targetId,req.user.id]);
      await client.query(`UPDATE material_usages source SET active=false,updated_by=$3,updated_at=NOW() WHERE source.location_id=$1 AND EXISTS(SELECT 1 FROM material_usages target WHERE target.location_id=$2 AND target.material_id=source.material_id)`,[sourceId,targetId,req.user.id]);
      await client.query(`UPDATE material_usages source SET location_id=$2,updated_by=$3,updated_at=NOW() WHERE source.location_id=$1 AND NOT EXISTS(SELECT 1 FROM material_usages target WHERE target.location_id=$2 AND target.material_id=source.material_id)`,[sourceId,targetId,req.user.id]);
      await client.query(`UPDATE locations SET plant_code=$1,department_code=$2,department_name=$3,area_code=$4,area_name=$5,equipment_code=COALESCE($6,equipment_code),equipment_name=COALESCE($7,equipment_name),sub_equipment_code=COALESCE($8,sub_equipment_code),sub_equipment_name=COALESCE($9,sub_equipment_name),updated_at=NOW() WHERE id=$10`,[dept.plant_code,dept.department_code,subDepartmentName||dept.department_name,x.area_code||duplicate.area_code,x.area_name,x.equipment_code||duplicate.equipment_code,x.equipment_name||duplicate.equipment_name,x.sub_equipment_code||duplicate.sub_equipment_code,x.sub_equipment_name||duplicate.sub_equipment_name,targetId]);
      await client.query('UPDATE locations SET active=false,updated_at=NOW() WHERE id=$1',[sourceId]);
      await client.query('COMMIT');
      const merged=(await q('SELECT * FROM locations WHERE id=$1',[targetId])).rows[0];
      return res.json({...merged,merged:true,merged_from:sourceId});
    }
    const y=(await client.query(`UPDATE locations SET plant_code=$1,department_code=$2,department_name=$3,area_code=$4,area_name=$5,equipment_code=$6,equipment_name=$7,sub_equipment_code=$8,sub_equipment_name=$9,sap_location_code=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[dept.plant_code,dept.department_code,subDepartmentName||dept.department_name,x.area_code||null,x.area_name,x.equipment_code||null,x.equipment_name||null,x.sub_equipment_code||null,x.sub_equipment_name||null,x.sap_location_code||null,req.params.id])).rows[0];
    await client.query('COMMIT');res.json(y)
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

r.post('/departments',auth,allow('admin'),async(req,res)=>{const {plant_code='3102',department_code,department_name}=req.body;if(!department_code||!department_name)return res.status(400).json({error:'Department code and name are required'});const x=await q(`INSERT INTO departments(plant_code,department_code,department_name) VALUES($1,$2,$3) RETURNING *`,[plant_code,department_code,department_name]);res.json(x.rows[0])});
export default r;
