import {Router} from 'express';import {q} from '../db.js';import {auth,allow} from '../auth.js';import {getDepartment} from '../services/locationService.js';
const r=Router();

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

r.post('/hierarchy',auth,allow('admin'),async(req,res)=>{
  const x=req.body,dept=await getDepartment(x.department_code);if(!dept)return res.status(400).json({error:'Unknown department'});if(!x.area_name)return res.status(400).json({error:'Area is required'});
  await q(`INSERT INTO areas(department_id,area_code,area_name) VALUES($1,$2,$3) ON CONFLICT(department_id,area_name) DO UPDATE SET area_code=COALESCE(EXCLUDED.area_code,areas.area_code),active=true,updated_at=NOW()`,[dept.id,x.area_code||null,x.area_name]);
  const existing=(await q(`SELECT * FROM locations WHERE department_code=$1 AND lower(regexp_replace(trim(area_name),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim($2),'[^a-zA-Z0-9]+','','g')) AND lower(regexp_replace(trim(COALESCE(equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($3,'')),'[^a-zA-Z0-9]+','','g')) AND lower(regexp_replace(trim(COALESCE(sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($4,'')),'[^a-zA-Z0-9]+','','g')) AND active=true ORDER BY id LIMIT 1`,[x.department_code,x.area_name,x.equipment_name||'',x.sub_equipment_name||''])).rows[0];
  if(existing)return res.status(409).json({error:'This Area / Equipment / Sub-equipment already exists. Edit the existing row instead.'});
  const y=await q(`INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name,sub_equipment_code,sub_equipment_name,sap_location_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[dept.plant_code,dept.department_code,dept.department_name,x.area_code||null,x.area_name,x.equipment_code||null,x.equipment_name||null,x.sub_equipment_code||null,x.sub_equipment_name||null,x.sap_location_code||null]);res.json(y.rows[0])
});

r.put('/hierarchy/:id',auth,allow('admin'),async(req,res)=>{
  const old=(await q('SELECT * FROM locations WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'Location not found'});const x={...old,...req.body},dept=await getDepartment(x.department_code);if(!dept)return res.status(400).json({error:'Unknown department'});
  await q(`INSERT INTO areas(department_id,area_code,area_name) VALUES($1,$2,$3) ON CONFLICT(department_id,area_name) DO UPDATE SET area_code=COALESCE(EXCLUDED.area_code,areas.area_code),active=true,updated_at=NOW()`,[dept.id,x.area_code||null,x.area_name]);
  const duplicate=(await q(`SELECT id FROM locations WHERE id<>$1 AND department_code=$2 AND lower(regexp_replace(trim(area_name),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim($3),'[^a-zA-Z0-9]+','','g')) AND lower(regexp_replace(trim(COALESCE(equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($4,'')),'[^a-zA-Z0-9]+','','g')) AND lower(regexp_replace(trim(COALESCE(sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($5,'')),'[^a-zA-Z0-9]+','','g')) AND active=true LIMIT 1`,[req.params.id,x.department_code,x.area_name,x.equipment_name||'',x.sub_equipment_name||''])).rows[0];
  if(duplicate)return res.status(409).json({error:'Another hierarchy row already represents this Area / Equipment / Sub-equipment.'});
  const y=await q(`UPDATE locations SET plant_code=$1,department_code=$2,department_name=$3,area_code=$4,area_name=$5,equipment_code=$6,equipment_name=$7,sub_equipment_code=$8,sub_equipment_name=$9,sap_location_code=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[dept.plant_code,dept.department_code,dept.department_name,x.area_code||null,x.area_name,x.equipment_code||null,x.equipment_name||null,x.sub_equipment_code||null,x.sub_equipment_name||null,x.sap_location_code||null,req.params.id]);res.json(y.rows[0])
});

r.post('/departments',auth,allow('admin'),async(req,res)=>{const {plant_code='3102',department_code,department_name}=req.body;if(!department_code||!department_name)return res.status(400).json({error:'Department code and name are required'});const x=await q(`INSERT INTO departments(plant_code,department_code,department_name) VALUES($1,$2,$3) RETURNING *`,[plant_code,department_code,department_name]);res.json(x.rows[0])});
export default r;
