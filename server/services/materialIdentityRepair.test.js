import test from 'node:test';
import assert from 'node:assert/strict';
import {findSafeMaterialCandidate} from './materialIdentityRepair.js';

const code='MMT311715050461';

test('repairs a unique code stored in description',()=>{
  const rows=[{id:1,material_code:null,description:code}];
  const hit=findSafeMaterialCandidate(code,rows);
  assert.equal(hit?.row.id,1);
  assert.match(hit?.reason,/Description/);
});

test('repairs a unique code embedded in legacy material text',()=>{
  const rows=[{id:2,material_code:`OLD-${code}-TEXT`,description:'Bearing'}];
  const hit=findSafeMaterialCandidate(code,rows);
  assert.equal(hit?.row.id,2);
  assert.match(hit?.reason,/embedded/);
});

test('rejects ambiguous repair candidates',()=>{
  const rows=[{id:1,material_code:null,description:code},{id:2,material_code:null,description:code}];
  assert.equal(findSafeMaterialCandidate(code,rows),null);
});
