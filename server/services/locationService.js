import { q } from '../db.js';
export async function getDepartment(departmentCode){return (await q('SELECT * FROM departments WHERE department_code=$1 AND active=true',[departmentCode])).rows[0];}
export async function findOrCreateLocation({department_code,area,equipment=null,sub_equipment=null,sap_location_code=null}){
  const dept=await getDepartment(department_code); if(!dept) throw new Error('Unknown department');
  if(sap_location_code){const exact=(await q('SELECT * FROM locations WHERE sap_location_code=$1',[sap_location_code])).rows[0];if(exact)return exact;}
  const existing=(await q(`SELECT * FROM locations WHERE department_code=$1 AND area_name=$2 AND COALESCE(equipment_name,'')=COALESCE($3,'') AND COALESCE(sub_equipment_name,'')=COALESCE($4,'') AND active=true ORDER BY id LIMIT 1`,[department_code,area,equipment,sub_equipment])).rows[0];
  if(existing){if(sap_location_code&&!existing.sap_location_code)return (await q('UPDATE locations SET sap_location_code=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[sap_location_code,existing.id])).rows[0];return existing;}
  if(equipment===area&&sub_equipment){
    const legacy=(await q(`SELECT * FROM locations WHERE department_code=$1 AND area_name=$2 AND equipment_name=$3 AND COALESCE(sub_equipment_name,'')='' AND active=true ORDER BY id LIMIT 1`,[department_code,area,sub_equipment])).rows[0];
    if(legacy){
      return (await q(`UPDATE locations SET equipment_name=$1,sub_equipment_name=$2,sap_location_code=COALESCE(sap_location_code,$3),updated_at=NOW() WHERE id=$4 RETURNING *`,[equipment,sub_equipment,sap_location_code||null,legacy.id])).rows[0];
    }
  }
  const areaRow=(await q(`SELECT a.* FROM areas a JOIN departments d ON d.id=a.department_id WHERE d.department_code=$1 AND a.area_name=$2 AND a.active=true`,[department_code,area])).rows[0];
  return (await q(`INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_name,sub_equipment_name,sap_location_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[dept.plant_code,dept.department_code,dept.department_name,areaRow?.area_code||null,area,equipment,sub_equipment,sap_location_code||null])).rows[0];
}
