import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotRowsFromCanonical} from './plantExcelGateway.js';

test('aggregates open PO lines by material code',()=>{
  const rows=snapshotRowsFromCanonical('open_po',[
    {material_code:'MMT311715050461',po_qty:2,po_number:'450001',po_item:'10',vendor:'Vendor A',source_sheet:'Data',source_row:2},
    {material_code:'MMT311715050461',po_qty:5,po_number:'450001',po_item:'20',vendor:'Vendor A',source_sheet:'Data',source_row:3},
    {material_code:'MCV301031000017',po_qty:8,po_number:'450002',po_item:'10',vendor:'Vendor B',source_sheet:'Data',source_row:4}
  ]);
  assert.equal(rows.length,2);
  const first=rows.find(x=>x.material_code==='MMT311715050461');
  assert.equal(first.po_qty,7);
  assert.equal(first.pr_qty,null);
  assert.equal(first.metadata.line_count,2);
});

test('de-duplicates exact PO document item line before aggregation',()=>{
  const line={material_code:'MMT311715050461',po_qty:2,po_number:'450001',po_item:'10',source_sheet:'Data',source_row:2};
  const rows=snapshotRowsFromCanonical('open_po',[line,{...line,source_row:3}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].po_qty,2);
  assert.equal(rows[0].metadata.line_count,1);
});

test('aggregates open PR independently of PO',()=>{
  const rows=snapshotRowsFromCanonical('open_pr',[
    {material_code:'MMT311715050461',pr_qty:3,pr_number:'100001',pr_item:'10'},
    {material_code:'MMT311715050461',pr_qty:4,pr_number:'100002',pr_item:'10'}
  ]);
  assert.equal(rows[0].pr_qty,7);
  assert.equal(rows[0].po_qty,null);
});
