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

const canonical={
  material_code:['material','material code','material no','material number','matnr','code'],
  alternate_material_code:['alternate mat code','alternate mat. code','alternate material code','alternate code'],
  spare_name:['spare name','item name','part name','short text'],
  description:['description','material description','material desc','short description','item description'],
  tracking_id:['tracking id','tracking no','tracking number'],
  uom:['uom','unit','base unit of measure','order unit'],
  qty:['quantity','qty','open quantity','open qty'],
  safety_stock:['safety stock to maintain','safety stock','minimum stock','min stock'],
  stock_p1:['stock in p1','p1 stock'],
  stock_p2:['stock in p2','p2 stock'],
  total_stock:['total stock','available total stock'],
  consumption_p2:['consumption p2','consumption (p2)','p2 consumption'],
  consumption_fy24:['fy24 consumption','consumption fy24','fy 24 consumption','fy24'],
  consumption_fy25:['fy25 consumption','consumption fy25','fy 25 consumption','fy25'],
  consumption_fy26:['fy26 consumption','consumption fy26','fy 26 consumption','fy26'],
  consumption_fy27:['fy27 consumption','consumption fy27','fy 27 consumption','fy27'],
  last_issue_date:['last issue date','last issued date','last consumption date'],
  ideal_pr_qty:['ideal pr qty for p2','ideal pr qty','recommended pr qty'],
  vendor_name:['name of supplier','supplier name','vendor name','supplier','vendor'],
  vendor_code:['vendor code','supplier code','vendor no','supplier no'],
  po_number:['purchasing document','po number','purchase order','po no'],
  pr_number:['purchase requisition','pr number','pr no'],
  po_raised_date:['po raised date','document date','po date','created on'],
  pr_raised_date:['pr raised date','pr date','requisition date'],
  rate:['rate','net price','unit price','price','unit price '],
  allowed_qty:['allowed qty by subhendu','allowed qty','approved qty'],
  total_price:['total price','total value'],
  lead_time_years:['delivery lead time years','delivery lead time (years)','lead time years','lead time'],
  consumption_plan_months:['consumption plan months','consumption plan (months)','plan months'],
  justification:['justification','reason','remarks'],
  expected_date:['expected date','delivery date','expected delivery','expected return','expected return date'],
  out_date:['out date','outward date','gate out date'],
  in_date:['in date','return date','actual return','actual return date'],
  store_qty:['unrestricted stock','unrestricted use stock','available stock','store qty','stock'],
  po_qty:['still to be delivered qty','still to be delivered','open po qty','po qty'],
  pr_qty:['order quantity','open pr qty','pr qty','requisition quantity','remaining quantity']
};

function guessMappings(summary){
  const headers=[];
  for(const s of summary.sheets){
    for(const row of s.rows.slice(0,8))for(const v of row){const t=clean(v);if(t&&!headers.includes(t))headers.push(t)}
  }
  const mappings={};
  for(const [key,aliases] of Object.entries(canonical)){
    let best=null;
    for(const h of headers){const n=norm(h);if(aliases.includes(n)){best=h;break}}
    if(best)mappings[key]=best;
  }
  for(const h of headers){const n=norm(h);if(n.includes('still to be delivered'))mappings.po_qty=h;if(n.includes('order quantity'))mappings.pr_qty=h}
  return mappings;
}

function localGuess(summary){
  const text=summary.sheets.flatMap(s=>s.rows.flat()).map(norm).join(' | ');
  let fileType='master';
  if(text.includes('safety stock to maintain')&&text.includes('ideal pr qty'))fileType='pr_planning';
  else if(text.includes('nrgp')||text.includes('non returnable gate pass')||text.includes('non returnable'))fileType='nrgp';
  else if(text.includes('rgp')||text.includes('returnable gate pass')||text.includes('expected return')||text.includes('outward date'))fileType='rgp';
  else if(text.includes('still to be delivered')||text.includes('purchasing document'))fileType='open_po';
  else if(text.includes('order quantity')||text.includes('purchase requisition')&&(text.includes('open pr')||text.includes('requisition quantity')||text.includes('remaining quantity')))fileType='open_pr';
  else if(text.includes('unrestricted stock')||text.includes('unrestricted use')||text.includes('available stock'))fileType='stock';
  return {fileType,confidence:'medium',source:'deterministic',mappings:guessMappings(summary),note:'Local structure detection. Review the proposed mapping before import.'};
}

function parseJson(text){
  const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw)}catch{return null}
}

export async function analyzeImport(buffer){
  const summary=workbookSummary(buffer),fallback=localGuess(summary);
  const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
  if(!base||!key||!model)return {aiEnabled:false,analysis:fallback,summary};
  const prompt=`You analyze plant spare/procurement Excel layouts. Return JSON only. Determine fileType from: master, stock, open_pr, open_po, rgp, nrgp, pr_planning. Business rule for this app: Order Quantity maps to PR Qty; Still to be delivered (qty) maps to PO Qty. A PR/FY planning sheet may contain Safety Stock to Maintain, Total Stock, FY24/FY25/FY26/FY27 consumption, P2 Consumption, Last Issue Date, Ideal PR Qty, current PR Qty, Unit Price, Lead Time, Consumption Plan and Justification. Propose column mappings using only columns actually visible. Allowed mapping keys: ${Object.keys(canonical).join(', ')}, plant, sap_location_code. Material Code values must match exactly 3 uppercase letters followed by 12 digits; never infer or invent a code. Do not modify data. Include confidence 0..1 and warnings. Workbook sample: ${JSON.stringify(summary)}`;
  try{
    const resp=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious schema-mapping assistant for industrial SAP/Excel data. Never invent data.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);
    const body=await resp.json(),content=body?.choices?.[0]?.message?.content,parsed=parseJson(content);
    if(!parsed)throw new Error('AI response was not valid JSON');
    return {aiEnabled:true,analysis:{...fallback,...parsed,source:'ai'},fallback,summary};
  }catch(error){return {aiEnabled:false,analysis:fallback,summary,warning:`AI provider unavailable: ${error.message}`}}
}
