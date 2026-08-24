import XLSX from 'xlsx';

const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/]+/g,' ').replace(/\s+/g,' ');
const asNum=v=>{if(v===null||v===undefined||clean(v)==='')return null;const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const emptyCodes=new Set(['NOT MADE','N/A','NA','NOT AVAILABLE','TO BE CREATED','TBC','MAKE CODE','MAKE CODE AND ORDER','MAKE CODE FOR ORDER']);
function materialCode(v){const raw=clean(v).toUpperCase();if(!raw||emptyCodes.has(raw)||raw==='MATERIAL CODE')return null;const compact=raw.replace(/\s+/g,'');if(/^\d{6,18}$/.test(compact))return compact;const m=raw.match(/\b[A-Z]{2,5}\d{6,}[A-Z0-9-]*\b/);return m?m[0]:null}
const noteRow=v=>/^(MAINTENANCE|MAINTANCE|SPARE|PLANNING)\s*NOTE$/i.test(clean(v))||/^\d+\.\s+/.test(clean(v));

const aliases={
  material_code:['material code','code','new code','materialcode','mat code'],
  spare_name:['spare name','part name','item name','spare','item'],
  description:['description','material desc','short description','short text','item description'],
  part_number:['part number','part no','item part no','item part number','pn'],
  required_qty:['tiq','qty','quantity','inst quantity','installed quantity','per line','required qty'],
  discipline:['discipline','trade','category'],vendor:['vendor','suppl','supplier','supplier name'],manufacturer:['manufacturer','make','maker'],uom:['uom','unit'],notes:['notes','note','effect on production','remarks'],
  store_qty:['available in store','store','store qty','unrestricted stock','available stock','stock'],pr_qty:['in pr','pr','pr qty','purchase requisition qty','open pr qty'],po_qty:['in po','po','po qty','purchase order qty','open po qty'],
  sap_location_code:['sap hierarchy','sap location','functional location','functional loc','func location','func loc','floc','technical object','hierarchy code']
};
function keyFor(header){const n=norm(header);for(const[k,vals]of Object.entries(aliases))if(vals.some(x=>n===norm(x)))return k;return null}
function findHeader(rows){let best={i:0,score:-1,map:{}};for(let i=0;i<Math.min(rows.length,15);i++){const map={};let score=0;rows[i].forEach((h,j)=>{const k=keyFor(h);if(k&&map[k]===undefined){map[k]=j;score++}});if(score>best.score)best={i,score,map}}return best}
function pick(row,map,key){return map[key]===undefined?null:row[map[key]]}
const equipMap={'flap assembly':{equipment:'Coiler',sub_equipment:'Flap Assembly'},'mandrel assembly':{equipment:'Coiler',sub_equipment:'Mandrel Assembly'},'tibal':{equipment:'TiBAl',sub_equipment:null},'casting':{equipment:'Casting',sub_equipment:null},'degesser':{equipment:'Degasser',sub_equipment:null},'bar straightner':{equipment:'Bar Straightener',sub_equipment:null},'autoshear':{equipment:'Auto Shear',sub_equipment:null},'bar cooler':{equipment:'Bar Cooler',sub_equipment:null},'roughing mill':{equipment:'Roughing Mill',sub_equipment:null},'finishing mill':{equipment:'Finishing Mill',sub_equipment:null},'main shear':{equipment:'Main Shear',sub_equipment:null},'furnace':{equipment:'Furnace',sub_equipment:null},'hydraulic':{equipment:'Hydraulic',sub_equipment:null}};
function sheetLocation(name){return equipMap[norm(name)]||{equipment:clean(name),sub_equipment:null}}

export function parseMasterExcel(buffer,area,departmentCode,defaultDiscipline=''){
 if(!area)throw new Error('Area is required for spare-master import');if(!departmentCode)throw new Error('Department is required for spare-master import');
 const wb=XLSX.read(buffer,{type:'buffer'}),materials=[],issues=[];
 for(const sheetName of wb.SheetNames){if(norm(sheetName)==='sheet1')continue;const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:false});const h=findHeader(rows);if(h.map.material_code===undefined){issues.push({sheet:sheetName,reason:'No material-code column recognized'});continue}const loc=sheetLocation(sheetName);
  for(let i=h.i+1;i<rows.length;i++){const row=rows[i],rawCode=clean(pick(row,h.map,'material_code'));let code=materialCode(rawCode),spareName=clean(pick(row,h.map,'spare_name'))||null,description=clean(pick(row,h.map,'description'))||null;const descCode=materialCode(description);if(!code&&descCode&&clean(description).toUpperCase()===descCode){code=descCode;spareName=spareName||rawCode||null;description=null}if(!code&&rawCode&&!spareName&&!noteRow(rawCode))spareName=rawCode;if(!code&&!spareName&&!description)continue;if(!code&&noteRow(rawCode)&&!description)continue;
   materials.push({material_code:code,spare_name:spareName,description,part_number:clean(pick(row,h.map,'part_number'))||null,required_qty:asNum(pick(row,h.map,'required_qty')),discipline:clean(pick(row,h.map,'discipline'))||defaultDiscipline||null,uom:clean(pick(row,h.map,'uom'))||null,vendor:clean(pick(row,h.map,'vendor'))||null,manufacturer:clean(pick(row,h.map,'manufacturer'))||null,notes:clean(pick(row,h.map,'notes'))||null,area,equipment:loc.equipment,sub_equipment:loc.sub_equipment,sap_location_code:clean(pick(row,h.map,'sap_location_code'))||((departmentCode==='3102_CH2'&&area==='WRM'&&loc.equipment==='Coiler')?'3102_CH2_WRM_Coiler':null),source_sheet:sheetName,source_row:i+1});
   if(rawCode&&!code)issues.push({sheet:sheetName,row:i+1,reason:`Material code not recognized; kept as spare name: ${rawCode}`});
  }
 }
 return {materials,issues,sheets:wb.SheetNames};
}

export function parseSapStatusExcel(buffer){const wb=XLSX.read(buffer,{type:'buffer'}),byMaterial=new Map(),issues=[];for(const sheetName of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:false});const h=findHeader(rows);if(h.map.material_code===undefined)continue;for(let i=h.i+1;i<rows.length;i++){const row=rows[i],code=materialCode(pick(row,h.map,'material_code'));if(!code)continue;const incoming={material_code:code,store_qty:asNum(pick(row,h.map,'store_qty')),pr_qty:asNum(pick(row,h.map,'pr_qty')),po_qty:asNum(pick(row,h.map,'po_qty')),vendor:clean(pick(row,h.map,'vendor'))||null,sap_location_code:clean(pick(row,h.map,'sap_location_code'))||null,source_sheet:sheetName,source_row:i+1};const existing=byMaterial.get(code);if(!existing)byMaterial.set(code,incoming);else{for(const k of ['store_qty','pr_qty','po_qty','vendor'])if(incoming[k]!==null)existing[k]=incoming[k];if(!existing.sap_location_code&&incoming.sap_location_code)existing.sap_location_code=incoming.sap_location_code}}}const rowsOut=[...byMaterial.values()];if(!rowsOut.length)issues.push({reason:'No rows found. SAP export must include Material Code and Store/PR/PO or Vendor data.'});return {rows:rowsOut,issues}}
