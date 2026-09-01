export const DISCIPLINES=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
export const WRITABLE_IMPORT_TYPES=['master','stock','open_pr','open_po'];

export const CANONICAL_IMPORT_FIELDS={
  identity:['material_code','alternate_material_code','spare_name','description','part_number','uom','manufacturer','vendor','vendor_code'],
  hierarchy:['discipline','assembly_name','equipment_description'],
  inventory:['required_qty','store_qty','safety_stock','installed_qty'],
  procurement:['pr_qty','po_qty','planned_pr_qty','ideal_pr_qty','tracking_id','pr_number','pr_item','po_number','po_item','pr_raised_date','po_raised_date','rate','total_price','lead_time_years','justification'],
  consumption:['consumption_fy24','consumption_fy25','consumption_fy26','consumption_fy27','last_issue_date'],
  reliability:['failure_root_cause','oem_recommended_life','ved','ved_new','indigenous_imported','local_repair'],
  transaction:['expected_date','out_date','in_date','notes'],
  provenance:['source_sheet','source_row','file_type']
};

const disciplineAliases=new Map([
  ['mechanical','Mechanical'],['mech','Mechanical'],['m','Mechanical'],
  ['electrical','Electrical'],['elec','Electrical'],['elect','Electrical'],['e','Electrical'],
  ['instrumentation','Instrumentation'],['instrument','Instrumentation'],['inst','Instrumentation'],
  ['operation','Operation'],['operations','Operation'],['opn','Operation'],
  ['process','Process'],
  ['common / other','Common / Other'],['common','Common / Other'],['other','Common / Other']
]);

export const cleanText=v=>String(v??'').trim();
export const normalizeHeader=v=>cleanText(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');

export function parseImportNumber(v){
  if(v===null||v===undefined||cleanText(v)==='')return null;
  const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}

export function normalizeDiscipline(v){
  const raw=cleanText(v);
  if(!raw)return null;
  return disciplineAliases.get(raw.toLowerCase())||null;
}

export function validateCanonicalRow(row,{requiresMaterialCode=true}={}){
  const issues=[];
  if(requiresMaterialCode&&!row.material_code)issues.push('Missing or invalid Material Code');
  if(row.raw_discipline)issues.push(`Unknown Discipline: ${row.raw_discipline}`);
  for(const field of [...CANONICAL_IMPORT_FIELDS.inventory,...CANONICAL_IMPORT_FIELDS.procurement.filter(x=>!['tracking_id','pr_number','pr_item','po_number','po_item','pr_raised_date','po_raised_date','justification'].includes(x)),...CANONICAL_IMPORT_FIELDS.consumption.filter(x=>x!=='last_issue_date')]){
    const v=row[field];if(v!==null&&v!==undefined&&!Number.isFinite(Number(v)))issues.push(`Invalid numeric value for ${field}`);
  }
  return issues;
}
