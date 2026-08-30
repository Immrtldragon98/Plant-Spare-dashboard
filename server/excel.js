import XLSX from 'xlsx';

const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');
const asNum=v=>{if(v===null||v===undefined||clean(v)==='')return null;const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
const emptyCodes=new Set(['NOT MADE','N/A','NA','NOT AVAILABLE','TO BE CREATED','TBC','MAKE CODE','MAKE CODE AND ORDER','MAKE CODE FOR ORDER']);
export const vendorName=v=>{const s=clean(v);if(!s)return null;if(/^\d+$/.test(s))return null;const withoutCode=s.replace(/^\d{4,}\s+/, '').trim();return withoutCode||null};

function readWorkbook(buffer){
  try{return XLSX.read(buffer,{type:'buffer'})}
  catch(error){
    const message=String(error?.message||error||'');
    if(/password|encrypt|crypto|protected/i.test(message))throw new Error('Password-protected Excel files are not supported. Open the file in Excel, Save As an unprotected .xlsx, then upload that copy.');
    throw new Error(`Could not read Excel file: ${message||'unknown workbook error'}`);
  }
}

export function canonicalMaterialCode(v){
  const raw=clean(v).toUpperCase();
  if(!raw||emptyCodes.has(raw)||raw==='MATERIAL CODE'||raw==='MATERIAL')return null;
  return /^[A-Z]{3}\d{12}$/.test(raw)?raw:null;
}

export function extractLegacyMaterialCode(v){
  const raw=clean(v).toUpperCase();
  const m=raw.match(/\b[A-Z]{3}\d{12}\b/);
  return m?m[0]:null;
}

const noteRow=v=>/^(MAINTENANCE|MAINTANCE|SPARE|PLANNING)\s*NOTE$/i.test(clean(v))||/^\d+\.\s+/.test(clean(v));

const aliases={
  material_code:['material code','material','material number','material no','material no.','material id','mat code','mat no','mat no.','matnr','new code','materialcode'],
  spare_name:['spare name','part name','item name','spare','name'],
  description:['description','material description','material desc','short description','short text','item description'],
  part_number:['part number','part no','part no.','item part no','item- part no','item part number','pn'],
  required_qty:['tiq','qty','quantity','inst quantity','installed quantity','per line','required qty','safety stock to maintain'],
  discipline:['discipline','trade','category'],
  vendor:['vendor','vendor name','supplier name','name of supplier','supplier','suppl','lifnr'],
  manufacturer:['manufacturer','make','maker'],
  uom:['uom','unit','base unit of measure','base uom','order unit'],
  notes:['notes','note','effect on production','remarks','justification'],
  store_qty:['available in store','store','store qty','unrestricted stock','unrestricted use stock','unrestricted use','unrestricted','unrestricted stock qty','available stock','stock','labst','total stock'],
  pr_qty:['in pr','pr qty','open pr','open pr qty','pr open qty','purchase requisition qty','purchase requisition open qty','remaining pr qty','requisition quantity','order quantity'],
  po_qty:['in po','po qty','open po','open po qty','po open qty','purchase order qty','remaining po qty','still to be delivered qty','still to be delivered'],
  sap_location_code:['sap hierarchy','sap location','functional location','functional loc','func location','func loc','floc','technical object','hierarchy code']
};

function keyFor(header){
  const n=norm(header);
  if(n.includes('still to be delivered'))return 'po_qty';
  if(n==='order quantity'||n.includes('order quantity'))return 'pr_qty';
  for(const[k,vals]of Object.entries(aliases))if(vals.some(x=>n===norm(x)))return k;
  return null;
}

function findHeader(rows,maxRows=80){
  let best={i:0,score:-1,map:{},headers:[]};
  for(let i=0;i<Math.min(rows.length,maxRows);i++){
    const map={};let score=0;
    rows[i].forEach((h,j)=>{const k=keyFor(h);if(k&&map[k]===undefined){map[k]=j;score++}});
    if(score>best.score)best={i,score,map,headers:rows[i].map(clean).filter(Boolean)};
  }
  return best;
}
function pick(row,map,key){return map[key]===undefined?null:row[map[key]]}

const equipMap={
 'flap assembly':{equipment:'Coiler',sub_equipment:'Flap Assembly'},
 'mandrel assembly':{equipment:'Coiler',sub_equipment:'Mandrel Assembly'},
 'tibal':{equipment:'TiBAl',sub_equipment:null},
 'casting':{equipment:'Casting',sub_equipment:null},
 'degesser':{equipment:'Degasser',sub_equipment:null},
 'bar straightner':{equipment:'Bar Straightener',sub_equipment:null},
 'autoshear':{equipment:'Auto Shear',sub_equipment:null},
 'bar cooler':{equipment:'Bar Cooler',sub_equipment:null},
 'roughing mill':{equipment:'Roughing Mill',sub_equipment:null},
 'finishing mill':{equipment:'Finishing Mill',sub_equipment:null},
 'main shear':{equipment:'Main Shear',sub_equipment:null},
 'furnace':{equipment:'Furnace',sub_equipment:null},
 'hydraulic':{equipment:'Hydraulic',sub_equipment:null}
};
function sheetLocation(name){const n=norm(name);return equipMap[n]||{equipment:clean(name),sub_equipment:null}}

export function parseMasterExcel(buffer,area,departmentCode,defaultDiscipline=''){
  if(!area)throw new Error('Area is required for spare-master import');
  if(!departmentCode)throw new Error('Department is required for spare-master import');
  const wb=readWorkbook(buffer),materials=[],issues=[];
  for(const sheetName of wb.SheetNames){
    if(norm(sheetName)==='sheet1')continue;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:false});
    const h=findHeader(rows);
    if(h.map.material_code===undefined){issues.push({sheet:sheetName,reason:'No Material Code column recognized',headers:h.headers});continue}
    const detected=sheetLocation(sheetName);
    const subEquipment=detected.sub_equipment||detected.equipment||clean(sheetName);
    for(let i=h.i+1;i<rows.length;i++){
      const row=rows[i];
      const rawCode=clean(pick(row,h.map,'material_code'));
      let code=canonicalMaterialCode(rawCode);
      let spareName=clean(pick(row,h.map,'spare_name'))||null;
      let description=clean(pick(row,h.map,'description'))||null;
      const descCode=canonicalMaterialCode(description);
      if(!code&&descCode&&clean(description).toUpperCase()===descCode){
        code=descCode;spareName=spareName||rawCode||null;description=null;
        issues.push({sheet:sheetName,row:i+1,reason:`High-confidence swapped columns detected: ${rawCode} → ${descCode}`});
      }
      if(!code&&rawCode&&!spareName&&!noteRow(rawCode))spareName=rawCode;
      if(!code&&!spareName&&!description)continue;
      if(!code&&noteRow(rawCode)&&!description)continue;
      materials.push({material_code:code,spare_name:spareName,description,part_number:clean(pick(row,h.map,'part_number'))||null,required_qty:asNum(pick(row,h.map,'required_qty')),discipline:clean(pick(row,h.map,'discipline'))||defaultDiscipline||null,uom:clean(pick(row,h.map,'uom'))||null,vendor:vendorName(pick(row,h.map,'vendor')),manufacturer:clean(pick(row,h.map,'manufacturer'))||null,notes:clean(pick(row,h.map,'notes'))||null,area,equipment:area,sub_equipment:subEquipment,sap_location_code:clean(pick(row,h.map,'sap_location_code'))||null,source_sheet:sheetName,source_row:i+1});
      if(rawCode&&!code)issues.push({sheet:sheetName,row:i+1,reason:`Invalid Material Code kept out of Material Code: ${rawCode}`});
    }
  }
  return {materials,issues,sheets:wb.SheetNames};
}

function rowsForTypedImport(buffer,type){
  const wb=readWorkbook(buffer),rawRows=[],issues=[],sheetDiagnostics=[];
  for(const sheetName of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:false});
    const h=findHeader(rows);
    sheetDiagnostics.push({sheet:sheetName,headerRow:h.i+1,recognized:Object.keys(h.map),headers:h.headers});
    if(h.map.material_code===undefined){issues.push({sheet:sheetName,reason:'No Material/Material Code column recognized',headers:h.headers});continue}
    const required=type==='stock'?'store_qty':type==='open_pr'?'pr_qty':type==='open_po'?'po_qty':null;
    if(required&&h.map[required]===undefined){issues.push({sheet:sheetName,reason:`No ${type==='stock'?'Stock':type==='open_pr'?'PR Qty / Order Quantity':'PO Qty / Still to be delivered (qty)'} column recognized`,headers:h.headers});continue}
    for(let i=h.i+1;i<rows.length;i++){
      const row=rows[i],rawCode=pick(row,h.map,'material_code'),code=canonicalMaterialCode(rawCode);
      if(!code){if(clean(rawCode))issues.push({sheet:sheetName,row:i+1,reason:`Invalid Material Code ignored: ${clean(rawCode)}`});continue}
      rawRows.push({material_code:code,store_qty:asNum(pick(row,h.map,'store_qty')),pr_qty:asNum(pick(row,h.map,'pr_qty')),po_qty:asNum(pick(row,h.map,'po_qty')),vendor:type==='open_po'?vendorName(pick(row,h.map,'vendor')):(vendorName(pick(row,h.map,'vendor'))||null),sap_location_code:clean(pick(row,h.map,'sap_location_code'))||null,source_sheet:sheetName,source_row:i+1});
    }
  }
  return {rawRows,issues,sheetDiagnostics};
}

export function parseTypedSapExcel(buffer,type='stock'){
  const {rawRows,issues,sheetDiagnostics}=rowsForTypedImport(buffer,type),byMaterial=new Map();
  for(const r of rawRows){
    let x=byMaterial.get(r.material_code);
    if(!x){x={material_code:r.material_code,store_qty:null,pr_qty:null,po_qty:null,vendor:null,sap_location_code:r.sap_location_code};byMaterial.set(r.material_code,x)}
    if(type==='stock'&&r.store_qty!==null)x.store_qty=(x.store_qty||0)+r.store_qty;
    if(type==='open_pr'&&r.pr_qty!==null)x.pr_qty=(x.pr_qty||0)+r.pr_qty;
    if(type==='open_po'&&r.po_qty!==null)x.po_qty=(x.po_qty||0)+r.po_qty;
    if(r.vendor)x.vendor=r.vendor;
    if(!x.sap_location_code&&r.sap_location_code)x.sap_location_code=r.sap_location_code;
  }
  const rows=[...byMaterial.values()];
  if(!rows.length)issues.push({reason:`No valid rows found for ${type}. Material Code must match AAA123456789012 format.`});
  return {rows,issues,sheetDiagnostics};
}

export function parseSapStatusExcel(buffer){return parseTypedSapExcel(buffer,'stock')}
