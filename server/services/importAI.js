import XLSX from 'xlsx';

const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');

function providerConfig(){
  const openRouterKey=process.env.OPENROUTER_API_KEY||'';
  const base=(process.env.AI_IMPORT_BASE_URL||process.env.AI_BASE_URL||(openRouterKey?'https://openrouter.ai/api/v1':'')).replace(/\/$/,'');
  const key=process.env.AI_IMPORT_API_KEY||process.env.AI_API_KEY||openRouterKey;
  const model=process.env.AI_IMPORT_MODEL||process.env.AI_MODEL||(openRouterKey?'openrouter/free':'');
  return {base,key,model,configured:Boolean(base&&key&&model),openrouter:base.includes('openrouter.ai')};
}

function workbookSummary(buffer){
  const wb=XLSX.read(buffer,{type:'buffer'}),sheets=[];
  for(const name of wb.SheetNames.slice(0,20)){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:false}).slice(0,35);
    const useful=rows.filter(r=>r.some(v=>clean(v))).slice(0,16).map(r=>r.slice(0,50).map(clean));
    sheets.push({name,rows:useful});
  }
  return {sheets};
}

const canonical={
  plant:['plant'],material_code:['material','material code','material no','material number','matnr','code'],alternate_material_code:['alternate mat code','alternate mat. code','alternate material code','alternate code','old code'],spare_name:['spare name','item name','item','part name','part name sparename','part name spare name','short text','material short text'],description:['description','material description','material desc','short description','item description'],part_number:['part number','part no','p art number','part no.'],required_qty:['tiq','required qty','required quantity','qty','inst quantity'],assembly_name:['assembly name','assembly'],notes:['notes','note','remarks'],tracking_id:['tracking id','tracking no','tracking number','pr tracking no'],pr_number:['purchase requisition','purchase req','purchase req.','pr number','pr no'],pr_item:['requisn item','requisition item','pr item'],uom:['uom','unit','base unit of measure','order unit'],qty:['quantity','qty','open quantity','open qty'],planned_pr_qty:['pr quantity','requested pr qty','planned pr qty'],delivery_qty_lot1:['delivery qty lot 1','delivery quantity lot 1'],delivery_qty_lot2:['delivery qty lot 2','delivery quantity lot 2'],safety_stock:['safety stock to maintain','safety stock','minimum stock','min stock'],stock_p1:['stock in p1','p1 stock'],stock_p2:['stock in p2','p2 stock'],total_stock:['total stock','available total stock'],store_qty:['unrestricted','unrestricted stock','unrestricted use stock','available stock','store qty','stock'],pr_qty:['open pr qty','open pr','requisition quantity','remaining pr quantity'],po_qty:['open po qty','open po','still to be delivered qty','still to be delivered','po qty'],consumption_p2:['consumption p2','consumption (p2)','p2 consumption'],consumption_fy24:['fy24 consumption','consumption fy24','fy 24 consumption','fy24','cons 2024','consumption 2024'],consumption_fy25:['fy25 consumption','consumption fy25','fy 25 consumption','fy25','cons 2025','consumption 2025'],consumption_fy26:['fy26 consumption','consumption fy26','fy 26 consumption','fy26','cons 2026','consumption 2026'],consumption_fy27:['fy27 consumption','consumption fy27','fy 27 consumption','fy27','cons 2027','consumption 2027'],consumption_text:['consumption text'],last_issue_date:['last issue date','last issued date','last consumption date'],ideal_pr_qty:['ideal pr qty for p2','ideal pr qty','recommended pr qty'],vendor_name:['name of supplier','supplier name','vendor name','supplier','vendor','manufacturer'],vendor_code:['vendor code','supplier code','vendor no','supplier no'],po_number:['purchasing document','po number','purchase order','po no'],po_raised_date:['po raised date','document date','po date','created on'],pr_raised_date:['pr raised date','pr date','requisition date'],rate:['rate','net price','unit price','price','unit price '],total_price:['total price','total value','total'],lead_time_years:['delivery lead time years','delivery lead time (years)','lead time years','lead time'],consumption_plan_months:['consumption plan months','consumption plan (months)','plan months'],justification:['justification','justification for procurement','reason','remarks'],equipment_description:['equipment description','equipment'],oem_recommended_life:['oem recommended life','recommended life'],failure_root_cause:['root cause for failure','failure root cause','root cause'],installed_qty:['installed qty','installed quantity'],cmp_remarks:['cmp remarks'],ved_new:['new ved'],ved:['ved'],indigenous_imported:['indigenous imported','indigenous/imported'],additional_details:['additional details'],local_repair:['local & repair','local and repair','repair/local'],allowed_qty:['allowed qty by subhendu','allowed qty','approved qty'],expected_date:['expected date','delivery date','expected delivery','expected return','expected return date'],out_date:['out date','outward date','gate out date'],in_date:['in date','return date','actual return','actual return date']
};

function masterSemanticOverrides(summary,mappings){
  const out={...mappings};
  for(const sheet of summary.sheets){for(const row of sheet.rows.slice(0,6)){const headers=row.filter(Boolean),byNorm=new Map(headers.map(h=>[norm(h),h])),has=k=>byNorm.has(k),get=k=>byNorm.get(k);
    if(has('item')&&has('manufacturer')&&has('tiq')){out.spare_name=get('item');out.vendor_name=get('manufacturer');out.required_qty=get('tiq')}
    if(has('part name sparename')||has('part name spare name')){out.spare_name=get('part name sparename')||get('part name spare name');if(has('qty'))out.required_qty=get('qty')}
    if(has('short text')&&has('description')&&has('assembly name')){out.spare_name=get('description');out.description=get('short text');out.assembly_name=get('assembly name');if(has('tiq'))out.required_qty=get('tiq')}
    if(has('description')&&has('inst quantity')&&has('short description')){out.spare_name=get('description');out.description=get('short description');out.required_qty=get('inst quantity')}
  }}return out;
}

function mappingsForSheet(sheet){
  const headers=sheet.rows.flatMap(r=>r).map(clean).filter(Boolean),m={};
  for(const[key,aliases]of Object.entries(canonical)){const hit=headers.find(h=>aliases.some(a=>norm(h)===norm(a)));if(hit)m[key]=hit}
  return masterSemanticOverrides({sheets:[sheet]},m);
}
function guessMappings(summary){const out={};for(const s of summary.sheets)Object.assign(out,mappingsForSheet(s));return masterSemanticOverrides(summary,out)}
function localGuess(summary){
  const text=summary.sheets.flatMap(s=>s.rows.flat()).map(norm).join(' | ');let fileType='master';const planningSignals=['safety stock','open pr','open po','cons 2024','cons 2025','cons 2026','justification for procurement','pr tracking no'];const planningScore=planningSignals.filter(x=>text.includes(x)).length;
  if(planningScore>=3)fileType='pr_planning';else if(text.includes('nrgp')||text.includes('non returnable'))fileType='nrgp';else if(text.includes('rgp')||text.includes('returnable gate pass')||text.includes('expected return')||text.includes('outward date'))fileType='rgp';else if(text.includes('still to be delivered')||text.includes('purchasing document'))fileType='open_po';else if(text.includes('order quantity')||text.includes('purchase requisition')&&(text.includes('open pr')||text.includes('requisition quantity')))fileType='open_pr';else if(text.includes('unrestricted stock')||text.includes('unrestricted use')||text.includes('available stock'))fileType='stock';
  const sheetMappings=Object.fromEntries(summary.sheets.map(s=>[s.name,mappingsForSheet(s)]));return {fileType,confidence:planningScore>=5?'high':'medium',source:'deterministic',mappings:guessMappings(summary),sheetMappings,note:'Local structure detection. Review the proposed mapping before import.'};
}
function parseJson(text){const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch{return null}}

export async function analyzeImport(buffer){
  const summary=workbookSummary(buffer),fallback=localGuess(summary),cfg=providerConfig();if(!cfg.configured)return {aiEnabled:false,analysis:fallback,summary};
  const prompt=`You analyze industrial SAP/spare Excel workbooks. Return JSON only with {fileType,confidence,mappings,sheetMappings,warnings}. Detect fileType from master, stock, open_pr, open_po, rgp, nrgp, pr_planning. IMPORTANT: each sheet can have a different schema, so return sheetMappings keyed by exact sheet name. Use headers AND sample cell values. Plant conventions: ITEM often means Spare Name; MANUFACTURER is Vendor/source; Part name/sparename is Spare Name; TIQ and INST QUANTITY are Required Qty. Assembly Name is hierarchy context. If Short Text + Description + Assembly Name coexist, Description is Spare Name and Short Text is Description. If DESCRIPTION + Short DESCRIPTION + INST QUANTITY coexist, DESCRIPTION is Spare Name and Short DESCRIPTION is Description. PR Quantity is planned_pr_qty; Open PR is pr_qty; Open PO is po_qty; Unrestricted is store_qty. Material Code must map only when values match 3 uppercase letters + 12 digits. Never invent data. Allowed keys: ${Object.keys(canonical).join(', ')}. Workbook: ${JSON.stringify(summary)}`;
  try{
    const headers={'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}`};if(cfg.openrouter){headers['HTTP-Referer']=process.env.APP_PUBLIC_URL||'https://plant-spare-dashboard.onrender.com';headers['X-Title']='Plant Spare Dashboard - AI Import'}
    const resp=await fetch(`${cfg.base}/chat/completions`,{method:'POST',headers,body:JSON.stringify({model:cfg.model,messages:[{role:'system',content:'You are a cautious industrial schema-mapping agent. Return JSON only. Never invent values.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});
    if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);const body=await resp.json(),parsed=parseJson(body?.choices?.[0]?.message?.content);if(!parsed)throw new Error('AI response was not valid JSON');
    return {aiEnabled:true,analysis:{...fallback,...parsed,source:'ai',sheetMappings:{...fallback.sheetMappings,...(parsed.sheetMappings||{})}},fallback,summary};
  }catch(error){return {aiEnabled:false,analysis:fallback,summary,warning:`AI provider unavailable: ${error.message}`}}
}
