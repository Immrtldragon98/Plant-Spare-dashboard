const fieldMap={
  store_qty:{event_type:'INVENTORY_SNAPSHOT',value_key:'store_qty'},
  pr_qty:{event_type:'OPEN_PR_SNAPSHOT',value_key:'pr_qty'},
  po_qty:{event_type:'OPEN_PO_SNAPSHOT',value_key:'po_qty'}
};

const n=v=>v===null||v===undefined||v===''?null:Number(v);

export function changesToMaterialEvents(change,{sourceType='import',sourceRef=null,importHistoryId=null,occurredAt=null}={}){
  if(!change?.material_id||!change?.material_code)return [];
  const old=change.old||{},next=change.new||{};
  return Object.keys(fieldMap).flatMap(field=>{
    if(!(field in next))return [];
    const before=n(old[field]),after=n(next[field]);
    if(before===after)return [];
    return [{
      material_id:change.material_id,
      material_code:String(change.material_code).trim().toUpperCase(),
      event_type:fieldMap[field].event_type,
      event_at:occurredAt,
      old_value:before,
      new_value:after,
      quantity:after,
      source_type:sourceType,
      source_ref:sourceRef,
      import_history_id:importHistoryId,
      metadata:{field}
    }];
  });
}

export function batchChangesToMaterialEvents(changes=[],context={}){
  return changes.flatMap(change=>changesToMaterialEvents(change,context));
}
