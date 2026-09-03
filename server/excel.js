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
  material_code:['material code','material','material number','material no','material no.','material id','mat code','mat no','mat no.','matnr','new code','materialcode','code'],
  spare_name:['spare name','part name','part name sparename','part name spare name','item name','item','spare','name'],
  description:['description','material description','material desc','short description','short text','item description'],
  part_number:['part number','part no','part no.','p art number','item part no','item- part no','item part number','pn'],
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
function headerIndex(headerRow,...names){const wanted=names.map(norm);return headerRow.findIndex(h=>wanted.includes(norm(h)))}

function masterSemanticMap(rows,h){
  const headerRow=rows[h.i]||[],map={...h.map};
  const item=headerIndex(headerRow,'item');
  const partName=headerIndex(headerRow,'part name','part name/sparename','part name spare name','spare name');
  const shortText=headerIndex(headerRow,'short text');
  const description=headerIndex(headerRow,'description');
  const shortDescription=headerIndex(headerRow,'short description');
  const installed=headerIndex(headerRow,'inst quantity','installed quantity');
  const tiq=headerIndex(headerRow,'tiq');
  const qty=headerIndex(headerRow,'qty','quantity');

  if(item>=0)map.spare_name=item;
  if(partName>=0)map.spare_name=partName;
  if(shortText>=0&&description>=0){map.spare_name=description;map.description=shortText}
  else if(description>=0&&shortDescription>=0){map.spare_name=description;map.description=shortDescription}
  if(installed>=0)map.required_qty=installed;else if(tiq>=0)map.required_qty=tiq;else if(qty>=0)map.required_qty=qty;
  return map;
}

const equipMap={
 'flap assembly':{sub_equipment:'Coiler'},
 'mandrel assembly':{sub_equipment:'Coiler'},
 'tibal':{sub_equipment:'TiBAl Rod'},
 'tibal rod':{sub_equipment:'TiBAl Rod'},
 'casting':{sub_equipment:'Casting'},
 'casting water circuit':{sub_equipment:'Casting Water Circuit'},
 'bar straightner':{sub_equipment:'Bar Straightener'},
 'bar straigthener':{sub_equipment:'Bar Straightener'},
 'bar straightener':{sub_equipment:'Bar Straightener'},
 'bar cooler':{sub_equipment:'Bar Cooler'},
 'roughing mill':{sub_equipment:'Roughing Mill'},
 'finishing mill':{sub_equipment:'Finishing Mill'},
 'rac':{sub_equipment:'RAC'},
 'dmat':{sub_equipment:'DMAT'},
 'main shear':{sub_equipment:'Main Shear'},
 'mainshear':{sub_equipment:'Main Shear'},
 'auto shear':{sub_equipment:'Cropping Shear'},
 'autoshear':{sub_equipment:'Cropping Shear'},
 'cropping shear':{sub_equipment:'Cropping Shear'},
 'coiler':{sub_equipment:'Coiler'},
 'emuslion circuit':{sub_equipment:'Emulsion Circuit'},
 'emulsion circuit':{sub_equipment:'Emulsion Circuit'},
 'quenchining circuit':{sub_equipment:'Quenching Circuit'},
 'quenching circuit':{sub_equipment:'Quenching Circuit'}
};
function sheetLocation(name){const n=norm(name);return equipMap[n]||{sub_equipment:clean(name)}}

export function parseMasterExcel(buffer,area,departmentCode,defaultDiscipline=''){
  if(!area)throw new Error('Area is required for spare-master import');
  if(!departmentCode)throw new Error('Department is required for spare-master import');
  const wb=readWorkbook(buffer),materials=[],issues=[];
  for(const sheetName of wb.SheetNames){
    if(norm(sheetName)==='sheet1')continue;
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:false});
    const h=findHeader(rows);
    if(h.map.material_code===undefined){issues.push({sheet:sheetName,reason:'No Material Code column recognized',headers:h.headers});continue}
    const map=masterSemanticMap(rows,h);
    const detected=sheetLocation(sheetName);
    const subEquipment=detected.sub_equipment||clean(sheetName);
    for(let i=h.i+1;i<rows.length;i++){
      const row=rows[i];
      const rawCode=clean(pick(row,map,'material_code'));
      let code=canonicalMaterialCode(rawCode);
      let spareName=clean(pick(row,map,'spare_name'))||null;
      let description=clean(pick(row,map,'description'))||null;
      if(spareName&&description&&spareName===description)description=null;
      const descCode=canonicalMaterialCode(description);
      if(!code&&descCode&&clean(description).toUpperCase()===descCode){
        code=descCode;spareName=spareName||rawCode||null;description=null;
        issues.push({sheet:sheetName,row:i+1,reason:`High-confidence swapped columns detected: ${rawCode} → ${descCode}`});
      }
      if(!code&&!spareName&&!description)continue;
      if(!code&&noteRow(rawCode)&&!description)continue;
      const manufacturer=clean(pick(row,map,'manufacturer'))||null;
      const vendor=vendorName(pick(row,map,'vendor'))||vendorName(manufacturer);
      materials.push({material_code:code,spare_name:spareName,description,part_number:clean(pick(row,map,'part_number'))||null,required_qty:asNum(pick(row,map,'required_qty')),discipline:clean(pick(row,map,'discipline'))||defaultDiscipline||null,uom:clean(pick(row,map,'uom'))||null,vendor,manufacturer,notes:clean(pick(row,map,'notes'))||null,area,equipment:area,sub_equipment:subEquipment,sap_location_code:clean(pick(row,map,'sap_location_code'))||null,source_sheet:sheetName,source_row:i+1});
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
