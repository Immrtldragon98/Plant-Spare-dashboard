import test from 'node:test';
import assert from 'node:assert/strict';
import {changesToMaterialEvents,batchChangesToMaterialEvents} from './materialEvents.js';

test('maps store quantity change to inventory snapshot',()=>{
  const events=changesToMaterialEvents({material_id:7,material_code:'mmt311715050461',old:{store_qty:'8'},new:{store_qty:'4'}},{sourceType:'universal_stock',sourceRef:'stock.xlsx',importHistoryId:11});
  assert.equal(events.length,1);
  assert.equal(events[0].event_type,'INVENTORY_SNAPSHOT');
  assert.equal(events[0].old_value,8);
  assert.equal(events[0].new_value,4);
  assert.equal(events[0].material_code,'MMT311715050461');
});

test('maps PR and PO fields independently',()=>{
  const events=changesToMaterialEvents({material_id:7,material_code:'MMT311715050461',old:{pr_qty:2,po_qty:3},new:{pr_qty:5,po_qty:9}});
  assert.deepEqual(events.map(x=>x.event_type).sort(),['OPEN_PO_SNAPSHOT','OPEN_PR_SNAPSHOT']);
});

test('does not create events for vendor-only or unchanged values',()=>{
  assert.equal(changesToMaterialEvents({material_id:7,material_code:'MMT311715050461',old:{vendor:'A'},new:{vendor:'B'}}).length,0);
  assert.equal(changesToMaterialEvents({material_id:7,material_code:'MMT311715050461',old:{store_qty:4},new:{store_qty:4}}).length,0);
});

test('batch converter preserves only supported quantitative events',()=>{
  const events=batchChangesToMaterialEvents([
    {material_id:1,material_code:'MMT311715050461',old:{store_qty:1},new:{store_qty:2}},
    {material_id:2,material_code:'MMT311715050460',old:{pr_qty:0},new:{pr_qty:3}}
  ]);
  assert.equal(events.length,2);
});
