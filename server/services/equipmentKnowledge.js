import {q} from '../db.js';
import {materialRows,safeText} from './materialQuery.js';

let graphEnabledState=null;
const clean=v=>String(v??'').trim();

export async function equipmentKnowledgeGraphEnabled(){
  if(graphEnabledState!==null)return graphEnabledState;
  try{
    const r=await q(`SELECT to_regclass('public.equipment_components') components,to_regclass('public.component_material_links') material_links,to_regclass('public.component_knowledge_links') knowledge_links`);
    graphEnabledState=Boolean(r.rows[0]?.components&&r.rows[0]?.material_links&&r.rows[0]?.knowledge_links);
  }catch{graphEnabledState=false}
  return graphEnabledState;
}

function scopeSql(input={}){
  const p=[],w=['l.active=true'];
  const add=(sql,value)=>{const v=clean(value);if(v){p.push(v);w.push(sql.replace('?',`$${p.length}`))}};
  add('l.department_code=?',input.department_code);
  if(clean(input.equipment)){p.push(clean(input.equipment));w.push(`(l.equipment_name=$${p.length} OR l.area_name=$${p.length})`)}
  add('l.sub_equipment_name=?',input.sub_equipment);
  return {p,w};
}

export async function getEquipmentKnowledge(input={}){
  const context={department_code:safeText(input.department_code,80),equipment:safeText(input.equipment,120),sub_equipment:safeText(input.sub_equipment,120),discipline:safeText(input.discipline,80)};
  const {p,w}=scopeSql(context);
  const locations=(await q(`SELECT id,plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name,sub_equipment_code,sub_equipment_name,sap_location_code FROM locations l WHERE ${w.join(' AND ')} ORDER BY l.equipment_name,l.sub_equipment_name LIMIT 100`,p)).rows;
  const materials=await materialRows(context,{limit:50});
  const critical=materials.filter(x=>Number(x.required_qty||0)>0&&Number(x.store_qty||0)<Number(x.required_qty||0));
  const uncovered=materials.filter(x=>Number(x.uncovered_gap||0)>0);

  const docParams=[],docWhere=['active=true'];
  const addDoc=(col,val)=>{if(clean(val)){docParams.push(clean(val));docWhere.push(`${col}=$${docParams.length}`)}};
  addDoc('department_code',context.department_code);addDoc('equipment',context.equipment);addDoc('sub_equipment',context.sub_equipment);
  const documents=(await q(`SELECT id,title,file_name,document_type,manufacturer,equipment,sub_equipment,discipline,material_code,notes,uploaded_at,original_archived FROM knowledge_documents WHERE ${docWhere.join(' AND ')} ORDER BY uploaded_at DESC LIMIT 30`,docParams)).rows;

  let components=[];
  if(await equipmentKnowledgeGraphEnabled()&&locations.length){
    const ids=locations.map(x=>x.id);
    components=(await q(`SELECT c.id,c.location_id,c.parent_component_id,c.component_name,c.component_type,c.description,c.drawing_number,c.oem,c.notes,c.source,c.confidence,
      COUNT(DISTINCT ml.material_id)::int material_count,COUNT(DISTINCT kl.document_id)::int document_count
      FROM equipment_components c
      LEFT JOIN component_material_links ml ON ml.component_id=c.id
      LEFT JOIN component_knowledge_links kl ON kl.component_id=c.id
      WHERE c.active=true AND c.location_id=ANY($1::bigint[])
      GROUP BY c.id ORDER BY c.parent_component_id NULLS FIRST,c.component_name`,[ids])).rows;
  }

  const hierarchy=locations.map(x=>({plant:x.plant_code,department:x.department_name||x.department_code,sub_department:x.area_name,sub_department_code:x.area_code,equipment:x.equipment_name,equipment_code:x.equipment_code,sub_equipment:x.sub_equipment_name,sub_equipment_code:x.sub_equipment_code,sap_location_code:x.sap_location_code}));
  return {enabled:true,graphEnabled:await equipmentKnowledgeGraphEnabled(),context,hierarchy,summary:{locations:locations.length,materials:materials.length,critical:critical.length,uncovered:uncovered.length,documents:documents.length,components:components.length},materials,critical:critical.slice(0,12),uncovered:uncovered.slice(0,12),documents,components};
}

export async function createEquipmentComponent(input,userId){
  if(!await equipmentKnowledgeGraphEnabled())throw new Error('Equipment knowledge graph migration 009 is not active');
  const locationId=Number(input.location_id);if(!locationId)throw new Error('location_id is required');
  const name=clean(input.component_name);if(!name)throw new Error('Component name is required');
  return (await q(`INSERT INTO equipment_components(location_id,parent_component_id,component_name,component_type,description,drawing_number,oem,notes,source,confidence,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'planner',1,$9) RETURNING *`,[locationId,input.parent_component_id||null,name,clean(input.component_type)||'Assembly',clean(input.description)||null,clean(input.drawing_number)||null,clean(input.oem)||null,clean(input.notes)||null,userId])).rows[0];
}

export async function linkComponentMaterial({component_id,material_code,part_number,drawing_item},userId){
  if(!await equipmentKnowledgeGraphEnabled())throw new Error('Equipment knowledge graph migration 009 is not active');
  const code=clean(material_code).toUpperCase();
  const material=(await q(`SELECT id,material_code,spare_name FROM materials WHERE active=true AND upper(material_code)=upper($1)`,[code])).rows[0];
  if(!material)throw new Error('Material Code is not present in the current material master');
  const row=(await q(`INSERT INTO component_material_links(component_id,material_id,part_number,drawing_item,source,confidence,approved,approved_by)
    VALUES($1,$2,$3,$4,'planner',1,true,$5)
    ON CONFLICT(component_id,material_id) DO UPDATE SET part_number=EXCLUDED.part_number,drawing_item=EXCLUDED.drawing_item,approved=true,approved_by=EXCLUDED.approved_by,updated_at=NOW()
    RETURNING *`,[Number(component_id),material.id,clean(part_number)||null,clean(drawing_item)||null,userId])).rows[0];
  return {...row,material_code:material.material_code,spare_name:material.spare_name};
}

export async function linkComponentDocument({component_id,document_id,relation_type},userId){
  if(!await equipmentKnowledgeGraphEnabled())throw new Error('Equipment knowledge graph migration 009 is not active');
  return (await q(`INSERT INTO component_knowledge_links(component_id,document_id,relation_type,source,confidence,approved,approved_by)
    VALUES($1,$2,$3,'planner',1,true,$4)
    ON CONFLICT(component_id,document_id,relation_type) DO UPDATE SET approved=true,approved_by=EXCLUDED.approved_by
    RETURNING *`,[Number(component_id),Number(document_id),clean(relation_type)||'reference',userId])).rows[0];
}

export async function getComponentDetail(componentId){
  if(!await equipmentKnowledgeGraphEnabled())return {enabled:false};
  const component=(await q(`SELECT c.*,l.department_code,l.area_name,l.equipment_name,l.sub_equipment_name FROM equipment_components c JOIN locations l ON l.id=c.location_id WHERE c.id=$1 AND c.active=true`,[Number(componentId)])).rows[0];
  if(!component)throw new Error('Component not found');
  const materials=(await q(`SELECT m.material_code,m.spare_name,m.description,m.part_number,m.uom,m.vendor,m.store_qty,m.pr_qty,m.po_qty,ml.part_number linked_part_number,ml.drawing_item,ml.source,ml.confidence,ml.approved FROM component_material_links ml JOIN materials m ON m.id=ml.material_id WHERE ml.component_id=$1 AND m.active=true ORDER BY m.material_code`,[component.id])).rows;
  const documents=(await q(`SELECT d.id,d.title,d.file_name,d.document_type,d.manufacturer,d.material_code,d.uploaded_at,kl.relation_type,kl.source,kl.confidence,kl.approved FROM component_knowledge_links kl JOIN knowledge_documents d ON d.id=kl.document_id WHERE kl.component_id=$1 AND d.active=true ORDER BY d.uploaded_at DESC`,[component.id])).rows;
  return {enabled:true,component,materials,documents};
}
