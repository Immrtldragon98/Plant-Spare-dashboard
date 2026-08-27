import XLSX from 'xlsx';

const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');

function workbookSummary(buffer){
  const wb=XLSX.read(buffer,{type:'buffer'}),sheets=[];
  for(const name of wb.SheetNames.slice(0,12)){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:false}).slice(0,25);
    const useful=rows.filter(r=>r.some(v=>clean(v))).slice(0,10).map(r=>r.slice(0,25).map(clean));
    sheets.push({name,rows:useful});
  }
  return {sheets};
}

function localGuess(summary){
  const text=summary.sheets.flatMap(s=>s.rows.flat()).map(norm).join(' | ');
  let fileType='master';
  if(text.includes('still to be delivered')||text.includes('purchasing document'))fileType='open_po';
  else if(text.includes('purchase requisition')&&(text.includes('open pr')||text.includes('requisition quantity')||text.includes('remaining quantity')))fileType='open_pr';
  else if(text.includes('unrestricted stock')||text.includes('unrestricted use')||text.includes('available stock'))fileType='stock';
  return {fileType,confidence:'medium',source:'deterministic',note:'Local structure detection only. AI provider can improve ambiguous mappings.'};
}

function parseJson(text){
  const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw)}catch{return null}
}

export async function analyzeImport(buffer){
  const summary=workbookSummary(buffer),fallback=localGuess(summary);
  const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
  if(!base||!key||!model)return {aiEnabled:false,analysis:fallback,summary};
  const prompt=`You analyze plant spare/procurement Excel layouts. Return JSON only. Determine fileType from: master, stock, open_pr, open_po. Propose column mappings using only columns actually visible. Allowed mapping keys: material_code, spare_name, description, part_number, required_qty, discipline, vendor_code, vendor_name, manufacturer, uom, store_qty, pr_qty, po_qty, pr_number, po_number, plant, sap_location_code. Material Code values must match exactly 3 uppercase letters followed by 12 digits; never infer or invent a code. Do not modify data. Include confidence 0..1 and warnings. Workbook sample: ${JSON.stringify(summary)}`;
  try{
    const resp=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious schema-mapping assistant for industrial SAP/Excel data. Never invent data.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);
    const body=await resp.json(),content=body?.choices?.[0]?.message?.content,parsed=parseJson(content);
    if(!parsed)throw new Error('AI response was not valid JSON');
    return {aiEnabled:true,analysis:{...parsed,source:'ai'},fallback,summary};
  }catch(error){return {aiEnabled:false,analysis:fallback,summary,warning:`AI provider unavailable: ${error.message}`}}
}
