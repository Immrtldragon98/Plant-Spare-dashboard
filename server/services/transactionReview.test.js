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

test('rejects conflicting duplicate material rows',()=>{
  const out=deterministicTransactionReview({fileType:'open_pr',rows:[{material_code:'MMT311715050461',pr_qty:2},{material_code:'MMT311715050461',pr_qty:5}]});
  assert.equal(out.writeAllowed,false);assert.equal(out.findings.some(x=>x.code==='CONFLICTING_DUPLICATE'),true);
});

test('master row without material code is warning, not hard rejection',()=>{
  const out=deterministicTransactionReview({fileType:'master',rows:[{material_code:null,spare_name:'Bearing',required_qty:2}]});
  assert.equal(out.writeAllowed,true);assert.equal(out.decision,'warn');
});
