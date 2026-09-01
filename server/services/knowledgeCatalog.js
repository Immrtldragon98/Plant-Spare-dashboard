import {q} from '../db.js';
import {knowledgeStoreEnabled} from './knowledge.js';

const pageSpec=input=>{const page=Math.max(Number(input.page)||1,1),pageSize=Math.min(Math.max(Number(input.page_size)||25,10),100);return{page,pageSize,offset:(page-1)*pageSize}};
const result=(rows,total,page,pageSize)=>({rows,pagination:{page,page_size:pageSize,total,pages:Math.max(Math.ceil(total/pageSize),1),has_previous:page>1,has_next:(page-1)*pageSize+rows.length<total}});

export async function getKnowledgePage(input={}){
  const {page,pageSize,offset}=pageSpec(input);
  if(await knowledgeStoreEnabled()){
    const total=Number((await q(`SELECT COUNT(*)::int total FROM knowledge_documents WHERE active=true`)).rows[0]?.total||0);
    const rows=(await q(`SELECT d.*,COUNT(c.id)::int chunks FROM knowledge_documents d LEFT JOIN knowledge_chunks c ON c.document_id=d.id WHERE d.active=true GROUP BY d.id ORDER BY d.uploaded_at DESC,d.id DESC LIMIT $1 OFFSET $2`,[pageSize,offset])).rows.map(r=>({id:r.id,file_name:r.file_name,imported_at:r.uploaded_at,chunks:r.chunks,storage:r.storage_provider,originalArchived:r.original_archived,title:r.title,document_type:r.document_type,manufacturer:r.manufacturer,department_code:r.department_code,equipment:r.equipment,sub_equipment:r.sub_equipment,discipline:r.discipline,material_code:r.material_code,notes:r.notes,file_size:r.file_size}));
    return result(rows,total,page,pageSize);
  }
  const total=Number((await q(`SELECT COUNT(*)::int total FROM import_history WHERE import_type='knowledge_document'`)).rows[0]?.total||0);
  const rows=(await q(`SELECT id,file_name,imported_at,details FROM import_history WHERE import_type='knowledge_document' ORDER BY imported_at DESC,id DESC LIMIT $1 OFFSET $2`,[pageSize,offset])).rows.map(r=>({id:r.id,file_name:r.file_name,imported_at:r.imported_at,chunks:Array.isArray(r.details?.chunks)?r.details.chunks.length:0,storage:r.details?.storage||'unknown',originalArchived:Boolean(r.details?.originalArchived),...(r.details?.metadata||{})}));
  return result(rows,total,page,pageSize);
}
