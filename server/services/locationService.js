import { q } from '../db.js';

export async function getDepartment(departmentCode){
  return (await q('SELECT * FROM departments WHERE department_code=$1 AND active=true',[departmentCode])).rows[0];
}

const clean=v=>String(v??'').trim();

export async function findOrCreateLocation({department_code,area,equipment=null,sub_equipment=null,sap_location_code=null,equipment_code=null,sub_equipment_code=null}){
  const dept=await getDepartment(department_code);
  if(!dept) throw new Error('Unknown department');

  const areaName=clean(area),equipmentName=clean(equipment)||null,subEquipmentName=clean(sub_equipment)||null;
  if(sap_location_code){
    const exact=(await q('SELECT * FROM locations WHERE upper(trim(sap_location_code))=upper(trim($1)) AND active=true ORDER BY id LIMIT 1',[sap_location_code])).rows[0];
    if(exact)return exact;
  }

  const existing=(await q(`SELECT * FROM locations
    WHERE department_code=$1
      AND lower(regexp_replace(trim(area_name),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim($2),'[^a-zA-Z0-9]+','','g'))
      AND lower(regexp_replace(trim(COALESCE(equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($3,'')),'[^a-zA-Z0-9]+','','g'))
      AND lower(regexp_replace(trim(COALESCE(sub_equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim(COALESCE($4,'')),'[^a-zA-Z0-9]+','','g'))
      AND active=true
    ORDER BY (equipment_code IS NOT NULL)::int DESC,(sub_equipment_code IS NOT NULL)::int DESC,id
    LIMIT 1`,[department_code,areaName,equipmentName,subEquipmentName])).rows[0];

  if(existing){
    const nextEquipmentCode=existing.equipment_code||equipment_code||null;
    const nextSubCode=existing.sub_equipment_code||sub_equipment_code||null;
    const nextSap=existing.sap_location_code||sap_location_code||null;
    if(nextEquipmentCode!==existing.equipment_code||nextSubCode!==existing.sub_equipment_code||nextSap!==existing.sap_location_code){
      return (await q(`UPDATE locations SET equipment_code=$1,sub_equipment_code=$2,sap_location_code=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,[nextEquipmentCode,nextSubCode,nextSap,existing.id])).rows[0];
    }
    return existing;
  }

  if(equipmentName===areaName&&subEquipmentName){
    const legacy=(await q(`SELECT * FROM locations WHERE department_code=$1 AND area_name=$2 AND lower(regexp_replace(trim(COALESCE(equipment_name,'')),'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(trim($3),'[^a-zA-Z0-9]+','','g')) AND COALESCE(trim(sub_equipment_name),'')='' AND active=true ORDER BY id LIMIT 1`,[department_code,areaName,subEquipmentName])).rows[0];
    if(legacy){
      return (await q(`UPDATE locations SET equipment_name=$1,equipment_code=COALESCE(equipment_code,$2),sub_equipment_name=$3,sub_equipment_code=COALESCE(sub_equipment_code,$4),sap_location_code=COALESCE(sap_location_code,$5),updated_at=NOW() WHERE id=$6 RETURNING *`,[equipmentName,equipment_code||null,subEquipmentName,sub_equipment_code||null,sap_location_code||null,legacy.id])).rows[0];
    }
  }

  const areaRow=(await q(`SELECT a.* FROM areas a JOIN departments d ON d.id=a.department_id WHERE d.department_code=$1 AND lower(trim(a.area_name))=lower(trim($2)) AND a.active=true ORDER BY a.id LIMIT 1`,[department_code,areaName])).rows[0];
  return (await q(`INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name,sub_equipment_code,sub_equipment_name,sap_location_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[dept.plant_code,dept.department_code,dept.department_name,areaRow?.area_code||null,areaName,equipment_code||null,equipmentName,sub_equipment_code||null,subEquipmentName,sap_location_code||null])).rows[0];
}
