import {q} from '../db.js';

const clean=v=>String(v??'').trim();

function matchingChanges(details,materialCode){
  const code=clean(materialCode).toUpperCase();
  const changes=Array.isArray(details?.changes)?details.changes:[];
  return changes.filter(c=>clean(c?.material_code).toUpperCase()===code).map(c=>({
    material_code:clean(c.material_code),
    old:c.old||{},
    new:c.new||{},
    material_id:c.material_id||null
  }));
}

export async function getMaterialImportHistory(materialCode,limit=20){
  const code=clean(materialCode).toUpperCase();
  if(!/^[A-Z]{3}\d{12}$/.test(code))return {material_code:code,events:[],note:'A valid SAP Material Code is required.'};
  const max=Math.min(Math.max(Number(limit)||20,1),50);
  const rows=(await q(`SELECT id,import_type,file_name,imported_at,details
    FROM import_history
    WHERE details::text ILIKE $1
    ORDER BY imported_at DESC
    LIMIT $2`,[`%${code}%`,max])).rows;
  const events=[];
  for(const row of rows){
    const matches=matchingChanges(row.details,code);
    if(matches.length){
      for(const m of matches)events.push({batch_id:row.id,date:row.imported_at,file:row.file_name,import_type:row.import_type,...m});
      continue;
    }
    const d=row.details||{};
    const missing=Array.isArray(d.missing_material_codes)&&d.missing_material_codes.some(x=>clean(x).toUpperCase()===code);
    const corrected=Array.isArray(d.corrected_material_codes)&&d.corrected_material_codes.some(x=>clean(x).toUpperCase()===code);
    if(missing||corrected)events.push({batch_id:row.id,date:row.imported_at,file:row.file_name,import_type:row.import_type,event:missing?'missing_from_master':'material_code_corrected'});
  }
  return {material_code:code,events,note:'This is import/change history, not consumption or failure history. A value changing between uploaded SAP/Excel snapshots does not by itself prove consumption.'};
}
