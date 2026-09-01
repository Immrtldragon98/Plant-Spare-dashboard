import XLSX from 'xlsx';
import {canonicalMaterialCode,vendorName} from '../excel.js';
import {analyzeImport} from './importAI.js';
import {cleanText,normalizeHeader,parseImportNumber,normalizeDiscipline,validateCanonicalRow} from '../domain/importContract.js';

const clean=cleanText;
const num=parseImportNumber;
const date=v=>clean(v)||null;
const norm=normalizeHeader;

function rowObjects(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false})}

function findHeaderIndex(rows,mapping={}){
  const wanted=new Set(Object.values(mapping||{}).map(norm).filter(Boolean));
  let best={index:0,score:-1,headers:[]};
  for(let i=0;i<Math.min(rows.length,80);i++){
    const headers=rows[i].map(clean);
    const score=headers.reduce((n,h)=>n+(wanted.has(norm(h))?1:0),0);
    if(score>best.score)best={index:i,score,headers};
  }
  return best;
}

function columnIndex(headers,name){const n=norm(name);if(!n)return -1;return headers.findIndex(h=>norm(h)===n)}
function read(row,headers,mapping,key){const idx=columnIndex(headers,mapping?.[key]);return idx<0?null:row[idx]}

function canonicalRow(row,headers,mapping,sheetName,rowNumber,fileType,defaultDiscipline=''){
  const rawCode=read(row,headers,mapping,'material_code');
  const material_code=canonicalMaterialCode(rawCode);
  const rawDiscipline=clean(read(row,headers,mapping,'discipline'));
  const mappedDiscipline=normalizeDiscipline(rawDiscipline);
  const out={
    material_code,
    raw_material_code:clean(rawCode)||null,
    alternate_material_code:clean(read(row,headers,mapping,'alternate_material_code'))||null,
    spare_name:clean(read(row,headers,mapping,'spare_name'))||null,
    description:clean(read(row,headers,mapping,'description'))||null,
    part_number:clean(read(row,headers,mapping,'part_number'))||null,
    uom:clean(read(row,headers,mapping,'uom'))||null,
    discipline:mappedDiscipline||normalizeDiscipline(defaultDiscipline)||null,
    raw_discipline:rawDiscipline&&!mappedDiscipline?rawDiscipline:null,
    required_qty:num(read(row,headers,mapping,'required_qty')),
    store_qty:num(read(row,headers,mapping,'store_qty')),
    pr_qty:num(read(row,headers,mapping,'pr_qty')),
    po_qty:num(read(row,headers,mapping,'po_qty')),
    planned_pr_qty:num(read(row,headers,mapping,'planned_pr_qty')),
    safety_stock:num(read(row,headers,mapping,'safety_stock')),
    ideal_pr_qty:num(read(row,headers,mapping,'ideal_pr_qty')),
    vendor:vendorName(read(row,headers,mapping,'vendor_name')),
    vendor_code:clean(read(row,headers,mapping,'vendor_code'))||null,
    manufacturer:clean(read(row,headers,mapping,'manufacturer'))||null,
    assembly_name:clean(read(row,headers,mapping,'assembly_name'))||null,
    equipment_description:clean(read(row,headers,mapping,'equipment_description'))||null,
    tracking_id:clean(read(row,headers,mapping,'tracking_id'))||null,
    pr_number:clean(read(row,headers,mapping,'pr_number'))||null,
    pr_item:clean(read(row,headers,mapping,'pr_item'))||null,
    po_number:clean(read(row,headers,mapping,'po_number'))||null,
    po_raised_date:date(read(row,headers,mapping,'po_raised_date')),
    pr_raised_date:date(read(row,headers,mapping,'pr_raised_date')),
    rate:num(read(row,headers,mapping,'rate')),
    total_price:num(read(row,headers,mapping,'total_price')),
    lead_time_years:num(read(row,headers,mapping,'lead_time_years')),
    consumption_fy24:num(read(row,headers,mapping,'consumption_fy24')),
    consumption_fy25:num(read(row,headers,mapping,'consumption_fy25')),
    consumption_fy26:num(read(row,headers,mapping,'consumption_fy26')),
    consumption_fy27:num(read(row,headers,mapping,'consumption_fy27')),
    last_issue_date:date(read(row,headers,mapping,'last_issue_date')),
    justification:clean(read(row,headers,mapping,'justification'))||null,
    notes:clean(read(row,headers,mapping,'notes'))||null,
    failure_root_cause:clean(read(row,headers,mapping,'failure_root_cause'))||null,
    oem_recommended_life:clean(read(row,headers,mapping,'oem_recommended_life'))||null,
    installed_qty:num(read(row,headers,mapping,'installed_qty')),
    ved:clean(read(row,headers,mapping,'ved'))||null,
    ved_new:clean(read(row,headers,mapping,'ved_new'))||null,
    indigenous_imported:clean(read(row,headers,mapping,'indigenous_imported'))||null,
    local_repair:clean(read(row,headers,mapping,'local_repair'))||null,
    expected_date:date(read(row,headers,mapping,'expected_date')),
    out_date:date(read(row,headers,mapping,'out_date')),
    in_date:date(read(row,headers,mapping,'in_date')),
    source_sheet:sheetName,
    source_row:rowNumber,
    file_type:fileType
  };
  const meaningful=Object.entries(out).some(([k,v])=>!['source_sheet','source_row','file_type','raw_material_code','raw_discipline'].includes(k)&&v!==null&&v!=='');
  return meaningful?out:null;
}

function localSheetMapping(sheetSummary){
  const headers=sheetSummary.rows.flatMap(r=>r).map(clean).filter(Boolean),map={};
  const aliases={
    material_code:['material code','material','material no','material no.','material number','code','new code'],
    spare_name:['spare name','item','part name','part name/sparename','material short text'],
    description:['description','short description','short text','material description'],
    part_number:['part number','part no','part no.','p art number'],
    required_qty:['tiq','qty','inst quantity','installed quantity','required qty'],
    discipline:['discipline','trade','maintenance discipline','category'],
    vendor_name:['vendor','vendor name','supplier','name of supplier','manufacturer'],
    uom:['uom','unit'],store_qty:['unrestricted','total stock','store qty','stock'],pr_qty:['open pr','order quantity'],po_qty:['open po','still to be delivered (qty)','still to be delivered qty'],
    planned_pr_qty:['pr quantity'],safety_stock:['safety stock'],consumption_fy24:['cons 2024','fy24'],consumption_fy25:['cons 2025','fy25'],consumption_fy26:['cons 2026','fy26'],lead_time_years:['lead time'],justification:['justification for procurement','justification'],assembly_name:['assembly name']
  };
  for(const[k,vals]of Object.entries(aliases)){const h=headers.find(x=>vals.some(a=>norm(x)===norm(a)));if(h)map[k]=h}
  const has=x=>headers.find(h=>norm(h)===norm(x));
  if(has('short text')&&has('description')&&has('assembly name')){map.spare_name=has('description');map.description=has('short text')}
  if(has('description')&&has('inst quantity')&&has('short description')){map.spare_name=has('description');map.description=has('short description');map.required_qty=has('inst quantity')}
  return map;
}

export async function parseUniversalImport(buffer,defaultDiscipline=''){
  const ai=await analyzeImport(buffer),wb=XLSX.read(buffer,{type:'buffer'}),rows=[],issues=[],sheetMappings={};
  const global=ai.analysis?.mappings||{},proposedBySheet=ai.analysis?.sheetMappings||ai.analysis?.mappingsBySheet||{};
  for(const sheetName of wb.SheetNames){
    const sheetSummary=ai.summary?.sheets?.find(s=>s.name===sheetName)||{name:sheetName,rows:[]};
    const mapping={...localSheetMapping(sheetSummary),...global,...(proposedBySheet?.[sheetName]||{})};
    sheetMappings[sheetName]=mapping;
    const grid=rowObjects(wb.Sheets[sheetName]),h=findHeaderIndex(grid,mapping);
    if(columnIndex(h.headers,mapping.material_code)<0){issues.push({sheet:sheetName,reason:'No Material Code mapping available',headers:h.headers.filter(Boolean)});continue}
    for(let i=h.index+1;i<grid.length;i++){
      const x=canonicalRow(grid[i],h.headers,mapping,sheetName,i+1,ai.analysis?.fileType||'unknown',defaultDiscipline);
      if(!x)continue;
      const validation=validateCanonicalRow(x,{requiresMaterialCode:true});
      if(x.raw_material_code&&!x.material_code)issues.push({sheet:sheetName,row:i+1,reason:`Invalid Material Code ignored: ${x.raw_material_code}`});
      for(const reason of validation.filter(v=>!v.startsWith('Missing or invalid Material Code')))issues.push({sheet:sheetName,row:i+1,reason});
      rows.push(x);
    }
  }
  return {fileType:ai.analysis?.fileType||'unknown',confidence:ai.analysis?.confidence??null,aiEnabled:ai.aiEnabled,source:ai.analysis?.source||'deterministic',rows,issues,sheetMappings,analysis:ai.analysis};
}
