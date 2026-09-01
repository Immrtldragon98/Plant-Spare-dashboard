import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiscipline,parseImportNumber,validateCanonicalRow} from './importContract.js';

test('normalizes common discipline aliases',()=>{
  assert.equal(normalizeDiscipline('Mech'),'Mechanical');
  assert.equal(normalizeDiscipline('ELEC'),'Electrical');
  assert.equal(normalizeDiscipline('Inst'),'Instrumentation');
  assert.equal(normalizeDiscipline('unknown trade'),null);
});

test('parses SAP-style numeric text safely',()=>{
  assert.equal(parseImportNumber('1,234.50 EA'),1234.5);
  assert.equal(parseImportNumber(''),null);
  assert.equal(parseImportNumber(null),null);
});

test('canonical row validator flags identity and unknown discipline issues',()=>{
  const issues=validateCanonicalRow({material_code:null,raw_discipline:'Mechanical Team'});
  assert.ok(issues.includes('Missing or invalid Material Code'));
  assert.ok(issues.includes('Unknown Discipline: Mechanical Team'));
});
