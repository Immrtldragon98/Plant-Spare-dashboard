import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProcurementCoverage} from './procurementRules.js';

test('PR eligible when store plus PR plus PO is below required',()=>{
  const x=evaluateProcurementCoverage({required_qty:10,store_qty:2,pr_qty:3,po_qty:1});
  assert.equal(x.pr_eligible,true);
  assert.equal(x.ideal_pr_qty,4);
  assert.equal(x.pipeline_qty,6);
});

test('existing pipeline can cover low stock without new PR',()=>{
  const x=evaluateProcurementCoverage({required_qty:10,store_qty:2,pr_qty:3,po_qty:5});
  assert.equal(x.critical,true);
  assert.equal(x.pr_eligible,false);
  assert.equal(x.ideal_pr_qty,0);
});

test('zero stock uncovered spare is urgent',()=>{
  const x=evaluateProcurementCoverage({required_qty:8,store_qty:0,pr_qty:1,po_qty:1});
  assert.equal(x.pr_eligible,true);
  assert.equal(x.rule_priority,'Urgent');
  assert.equal(x.ideal_pr_qty,6);
});
