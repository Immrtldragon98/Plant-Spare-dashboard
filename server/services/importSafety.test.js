import test from 'node:test';
import assert from 'node:assert/strict';
import {deterministicTransactionReview} from './transactionReview.js';
import {snapshotRowsFromCanonical} from './plantExcelGateway.js';

const code='MMT311715040614';

test('blank and invalid transaction Material Codes are skipped, not blocking',()=>{
  const out=deterministicTransactionReview({fileType:'open_po',rows:[
    {material_code:null,po_qty:2},
    {material_code:'BAD-CODE',po_qty:3},
    {material_code:code,po_qty:4}
  ]});
  assert.equal(out.blocking,0);
  assert.equal(out.skipped,2);
  assert.equal(out.writeAllowed,true);
});

test('negative quantity remains a hard blocker for a valid Material Code',()=>{
  const out=deterministicTransactionReview({fileType:'stock',rows:[{material_code:code,store_qty:-1}]});
  assert.equal(out.writeAllowed,false);
  assert.equal(out.blocking,1);
  assert.equal(out.findings[0].code,'NEGATIVE_QUANTITY');
});

test('open PO lines aggregate by Material Code and preserve valid fractional quantities',()=>{
  const rows=snapshotRowsFromCanonical('open_po',[
    {material_code:code,po_qty:0.18,vendor:'Vendor A',po_number:'450001',po_item:'10',source_sheet:'PO',source_row:2},
    {material_code:code,po_qty:2,vendor:'Vendor B',po_number:'450002',po_item:'10',source_sheet:'PO',source_row:3}
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].material_code,code);
  assert.equal(rows[0].po_qty,2.18);
  assert.equal(rows[0].metadata.line_count,2);
});

test('exact duplicate procurement line is de-duplicated before aggregation',()=>{
  const line={material_code:code,pr_qty:5,pr_number:'10001',pr_item:'10',source_sheet:'PR',source_row:2};
  const rows=snapshotRowsFromCanonical('open_pr',[line,{...line,source_row:3}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].pr_qty,5);
  assert.equal(rows[0].metadata.line_count,1);
});
