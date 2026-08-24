import { q } from '../db.js';
export function audit(user,action,entityType,entityId,code,oldData,newData){return q(`INSERT INTO audit_log(user_id,action,entity_type,entity_id,material_code,old_data,new_data) VALUES($1,$2,$3,$4,$5,$6,$7)`,[user.id,action,entityType,entityId,code,oldData,newData]);}
