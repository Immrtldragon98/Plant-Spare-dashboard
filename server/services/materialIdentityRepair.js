import {q} from '../db.js';
import {canonicalMaterialCode,extractLegacyMaterialCode} from '../excel.js';

const upper=v=>String(v??'').trim().toUpperCase();

export function findSafeMaterialCandidate(code,materials=[]){
  const target=upper(code);
  if(!canonicalMaterialCode(target))return null;
  const exactDescription=materials.filter(m=>upper(m.description)===target);
  if(exactDescription.length===1&&!canonicalMaterialCode(exactDescription[0].material_code))return {row:exactDescription[0],reason:'Material Code was stored in Description'};
  const embedded=materials.filter(m=>m.material_code&&upper(m.material_code)!==target&&extractLegacyMaterialCode(m.material_code)===target);
  if(embedded.length===1)return {row:embedded[0],reason:'Material Code was embedded inside old Material Code text'};
  return null;
}

export async function resolveOrRepairMaterial(code,{userId=null}={}){
  const target=upper(code),exact=(await q('SELECT * FROM materials WHERE upper(material_code)=upper($1) AND active=true',[target])).rows[0];
  if(exact)return {material:exact,repaired:false};
  const materials=(await q('SELECT * FROM materials WHERE active=true')).rows;
  const candidate=findSafeMaterialCandidate(target,materials);
  if(!candidate)return {material:null,repaired:false};
  const old=candidate.row;
  const repaired=(await q(`UPDATE materials SET material_code=$1,spare_name=COALESCE(NULLIF(spare_name,''),$2),description=CASE WHEN upper(trim(COALESCE(description,'')))=upper($1) THEN NULL ELSE description END,updated_by=COALESCE($3,updated_by),updated_at=NOW() WHERE id=$4 RETURNING *`,[target,old.material_code,userId,old.id])).rows[0];
  return {material:repaired,repaired:true,reason:candidate.reason,old};
}
