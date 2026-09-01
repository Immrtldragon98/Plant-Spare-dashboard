import test from 'node:test';
import assert from 'node:assert/strict';
import {deterministicTransactionReview} from './transactionReview.js';

test('accepts valid stock snapshot',()=>{
  const out=deterministicTransactionReview({fileType:'stock',rows:[{material_code:'MMT311715050461',store_qty:4}]});
  assert.equal(out.writeAllowed,true);assert.equal(out.decision,'accept');
});

test('rejects negative snapshot quantity',()=>{
  const out=deterministicTransactionReview({fileType:'open_po',rows:[{material_code:'MMT311715050461',po_qty:-1}]});
  assert.equal(out.writeAllowed,false);assert.equal(out.findings.some(x=>x.code==='NEGATIVE_QUANTITY'),true);
});

test('allows same material on different procurement lines',()=>{
  const out=deterministicTransactionReview({fileType:'open_po',rows:[
    {material_code:'MMT311715050461',po_qty:2,po_number:'450001',po_item:'10'},
    {material_code:'MMT311715050461',po_qty:5,po_number:'450001',po_item:'20'}
  ]});
  assert.equal(out.writeAllowed,true);assert.equal(out.findings.some(x=>x.code==='CONFLICTING_DUPLICATE'),false);
});

test('warns on exact duplicate procurement line',()=>{
  const row={material_code:'MMT311715050461',po_qty:2,po_number:'450001',po_item:'10'};
  const out=deterministicTransactionReview({fileType:'open_po',rows:[row,{...row}]});
  assert.equal(out.writeAllowed,true);assert.equal(out.findings.some(x=>x.code==='DUPLICATE_TRANSACTION_LINE'),true);
});

test('master row without material code is warning, not hard rejection',()=>{
  const out=deterministicTransactionReview({fileType:'master',rows:[{material_code:null,spare_name:'Bearing',required_qty:2}]});
  assert.equal(out.writeAllowed,true);assert.equal(out.decision,'warn');
});
