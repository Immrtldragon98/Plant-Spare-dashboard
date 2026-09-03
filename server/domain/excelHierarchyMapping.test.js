import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {parseMasterExcel} from '../excel.js';

const expected={
  'Tibal rod':'TiBAl Rod',
  'Casting':'Casting',
  'Casting water circuit':'Casting Water Circuit',
  'Bar straigthener':'Bar Straightener',
  'Bar cooler':'Bar Cooler',
  'Roughing mill':'Roughing Mill',
  'Finishing mill':'Finishing Mill',
  'RAC':'RAC',
  'Dmat':'DMAT',
  'Mainshear':'Main Shear',
  'Cropping shear':'Cropping Shear',
  'Coiler':'Coiler',
  'Emuslion circuit':'Emulsion Circuit',
  'Quenchining circuit':'Quenching Circuit'
};

test('WRM sheets map material usages to equipment and canonical sub-equipment',()=>{
  const wb=XLSX.utils.book_new();
  let index=1;
  for(const sheetName of Object.keys(expected)){
    const code=`MMT${String(index).padStart(12,'0')}`;
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Material Code','Spare Name'],
      [code,`Spare ${index}`]
    ]),sheetName);
    index++;
  }
  const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  const parsed=parseMasterExcel(buffer,'WRM','3102_CH2','Mechanical');
  assert.equal(parsed.materials.length,Object.keys(expected).length);
  for(const row of parsed.materials){
    assert.equal(row.area,'WRM');
    assert.equal(row.equipment,'WRM');
    assert.equal(row.sub_equipment,expected[row.source_sheet]);
  }
});


test('placeholder and invalid code cells never become spare names',()=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['Material Code','Description'],
    ['NOT MADE','Unknown item'],
    ['MGS314117053696 -2pc','Oil seal']
  ]),'Coiler');
  const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
  const parsed=parseMasterExcel(buffer,'WRM','3102_CH2','Mechanical');
  assert.equal(parsed.materials.length,2);
  assert.deepEqual(parsed.materials.map(x=>x.spare_name),[null,null]);
  assert.deepEqual(parsed.materials.map(x=>x.description),['Unknown item','Oil seal']);
});
