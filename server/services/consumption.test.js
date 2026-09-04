import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMovementRow} from './consumption.js';

test('normalizes confirmed SAP goods issue',()=>{
  const row=normalizeMovementRow({Material:'MMT311715050461','Movement Type':261,Quantity:3,'Posting Date':'2026-08-01',UOM:'EA'});
  assert.equal(row.valid,true);
  assert.equal(row.quantity,3);
  assert.equal(row.movementType,'261');
});

test('deducts SAP reversal from consumption',()=>{
  const row=normalizeMovementRow({Material:'MMT311715050461','Movement Type':262,Quantity:2,'Posting Date':'2026-08-02'});
  assert.equal(row.valid,true);
  assert.equal(row.quantity,-2);
});

test('inventory-style rows are not accepted as consumption',()=>{
  const row=normalizeMovementRow({Material:'MMT311715050461',Quantity:10,'Posting Date':'2026-08-02'});
  assert.equal(row.valid,false);
  assert.equal(row.reason,'unsupported_movement_type');
});
