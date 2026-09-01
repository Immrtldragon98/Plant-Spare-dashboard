import {q} from '../db.js';

export async function getImportHistoryPage(input={}){
  const page=Math.max(Number(input.page)||1,1),pageSize=Math.min(Math.max(Number(input.page_size)||25,10),100),offset=(page-1)*pageSize;
  const total=Number((await q(`SELECT COUNT(*)::int total FROM import_history`)).rows[0]?.total||0);
  const rows=(await q(`SELECT h.*,u.name imported_by_name,COALESCE(h.details->>'upload_type',h.import_type) display_type FROM import_history h LEFT JOIN users u ON u.id=h.imported_by ORDER BY imported_at DESC,id DESC LIMIT $1 OFFSET $2`,[pageSize,offset])).rows;
  return {rows,pagination:{page,page_size:pageSize,total,pages:Math.max(Math.ceil(total/pageSize),1),has_previous:page>1,has_next:offset+rows.length<total}};
}
