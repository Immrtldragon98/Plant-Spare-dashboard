import {Router} from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import {auth,allow} from '../auth.js';
import {q} from '../db.js';
import {canonicalMaterialCode} from '../excel.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const clean=v=>String(v??'').trim();
const norm=v=>clean(v).toLowerCase().replace(/[._\-/()]+/g,' ').replace(/\s+/g,' ');
const num=v=>{if(v===null||v===undefined||clean(v)==='')return 0;const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0};

const fields={
 material_code:['material code','material'],alternate_material_code:['alternate mat code','alternate mat. code','alternate material code'],spare_name:['short text','spare name'],tracking_id:['tracking id'],uom:['uom'],safety_stock:['safety stock to maintain','safety stock'],stock_p1:['stock in p1'],stock_p2:['stock in p2'],total_stock:['total stock'],consumption_p2:['consumption p2','consumption (p2)'],last_issue_date:['last issue date'],file_ideal_pr_qty:['ideal pr qty for p2','ideal pr qty'],pr_qty:['pr qty'],allowed_qty:['allowed qty by subhendu','allowed qty'],unit_price:['unit price','rate','net price'],total_price:['total price'],lead_time_years:['delivery lead time years','delivery lead time (years)','lead time years'],consumption_plan_months:['consumption plan months','consumption plan (months)'],justification:['justification']
};
function headerMap(row){const map={};row.forEach((h,i)=>{const n=norm(h);for(const[k,a]of Object.entries(fields))if(map[k]===undefined&&a.includes(n))map[k]=i});return map}
function findHeader(rows){let best={i:0,map:{},score:-1};for(let i=0;i<Math.min(rows.length,50);i++){const map=headerMap(rows[i]);const score=Object.keys(map).length;if(score>best.score)best={i,map,score}}return best}
const pick=(row,map,key)=>map[key]===undefined?null:row[map[key]];

async function maybeAi(rows){
 const fallback=rows.map(x=>({material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason}));
 const base=(process.env.AI_IMPORT_BASE_URL||'').replace(/\/$/,''),key=process.env.AI_IMPORT_API_KEY||'',model=process.env.AI_IMPORT_MODEL||'';
 if(!base||!key||!model)return {aiEnabled:false,source:'rule-screen',screening:fallback};
 const sample=rows.slice(0,100).map(x=>({material_code:x.material_code,spare_name:x.spare_name,safety_stock:x.safety_stock,total_stock:x.total_stock,consumption_p2:x.consumption_p2,last_issue_date:x.last_issue_date,current_pr_qty:x.pr_qty,current_po_qty:x.po_qty,ideal_pr_qty:x.system_ideal_pr_qty,allowed_qty:x.allowed_qty,unit_price:x.unit_price,lead_time_years:x.lead_time_years,consumption_plan_months:x.consumption_plan_months,justification:x.justification}));
 const prompt=`Rank urgency for these already deterministic PR-eligible industrial spares. Never alter material_code or ideal_pr_qty and never add/remove eligibility. Use only supplied values. Higher consumption, zero stock, older/meaningful issue history, longer lead time, and operational justification can raise urgency. Return JSON {rankings:[{material_code,priority,reason}]}, priority one of Urgent, High, Medium, Low. Data: ${JSON.stringify(sample)}`;
 try{const resp=await fetch(`${base}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are a cautious industrial spare procurement reviewer. Rules determine eligibility and quantity; you only rank urgency.'},{role:'user',content:prompt}],temperature:0.1,response_format:{type:'json_object'}})});if(!resp.ok)throw new Error(`AI provider returned ${resp.status}`);const body=await resp.json();const parsed=JSON.parse(String(body?.choices?.[0]?.message?.content||'{}').replace(/^```json\s*/i,'').replace(/```$/,'').trim());const allowed=new Set(rows.map(x=>x.material_code));const ranks=(parsed.rankings||[]).filter(x=>allowed.has(clean(x.material_code)));const map=new Map(ranks.map(x=>[clean(x.material_code),x]));return {aiEnabled:true,source:'ai-review',screening:rows.map(x=>map.get(x.material_code)||{material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason})}}
 catch{return {aiEnabled:false,source:'rule-screen',screening:fallback}}
}

r.post('/pr-planning/preview',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:'PR planning Excel required'});
 let wb;try{wb=XLSX.read(req.file.buffer,{type:'buffer'})}catch(e){return res.status(400).json({error:/password|encrypt|protected/i.test(String(e.message))?'Password-protected Excel is not supported. Save an unprotected .xlsx copy first.':`Could not read Excel: ${e.message}`})}
 const parsed=[],issues=[];
 for(const sheet of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null,raw:false});const h=findHeader(rows);if(h.map.material_code===undefined||h.map.safety_stock===undefined||h.map.total_stock===undefined){issues.push({sheet,reason:'Need Material Code, Safety Stock to Maintain and Total Stock columns'});continue}for(let i=h.i+1;i<rows.length;i++){const row=rows[i],code=canonicalMaterialCode(pick(row,h.map,'material_code'));if(!code)continue;parsed.push({material_code:code,alternate_material_code:clean(pick(row,h.map,'alternate_material_code'))||null,spare_name:clean(pick(row,h.map,'spare_name'))||null,tracking_id:clean(pick(row,h.map,'tracking_id'))||null,uom:clean(pick(row,h.map,'uom'))||null,safety_stock:num(pick(row,h.map,'safety_stock')),stock_p1:num(pick(row,h.map,'stock_p1')),stock_p2:num(pick(row,h.map,'stock_p2')),total_stock:num(pick(row,h.map,'total_stock')),consumption_p2:num(pick(row,h.map,'consumption_p2')),last_issue_date:clean(pick(row,h.map,'last_issue_date'))||null,file_ideal_pr_qty:num(pick(row,h.map,'file_ideal_pr_qty')),pr_qty:num(pick(row,h.map,'pr_qty')),allowed_qty:num(pick(row,h.map,'allowed_qty')),unit_price:num(pick(row,h.map,'unit_price')),total_price:num(pick(row,h.map,'total_price')),lead_time_years:num(pick(row,h.map,'lead_time_years')),consumption_plan_months:num(pick(row,h.map,'consumption_plan_months')),justification:clean(pick(row,h.map,'justification'))||null,source_sheet:sheet,source_row:i+1})}}
 const codes=[...new Set(parsed.map(x=>x.material_code))];let db=[];if(codes.length)db=(await q('SELECT material_code,COALESCE(po_qty,0) po_qty FROM materials WHERE material_code=ANY($1)',[codes])).rows;const dbMap=new Map(db.map(x=>[x.material_code,Number(x.po_qty||0)]));
 const rows=parsed.map(x=>{const po=dbMap.get(x.material_code)||0;const critical=x.safety_stock>0&&x.total_stock<x.safety_stock;const gap=Math.max(x.safety_stock-x.total_stock-x.pr_qty-po,0);const eligible=critical&&gap>0;const ratio=x.safety_stock?gap/x.safety_stock:0;const rule_priority=!eligible?'Covered':x.total_stock<=0?'Urgent':x.lead_time_years>=1||ratio>=.5?'High':'Medium';return {...x,po_qty:po,critical,pr_eligible:eligible,system_ideal_pr_qty:gap,rule_priority,rule_reason:eligible?`Safety stock gap ${gap} after Total Stock + PR + PO`:(critical?'Low stock, but incoming PR/PO covers the gap':'Total stock meets safety stock')}});
 const eligible=rows.filter(x=>x.pr_eligible);const ai=await maybeAi(eligible);const screenMap=new Map(ai.screening.map(x=>[x.material_code,x]));const candidates=eligible.map(x=>({...x,priority:screenMap.get(x.material_code)?.priority||x.rule_priority,screen_reason:screenMap.get(x.material_code)?.reason||x.rule_reason})).sort((a,b)=>({Urgent:4,High:3,Medium:2,Low:1}[b.priority]||0)-({Urgent:4,High:3,Medium:2,Low:1}[a.priority]||0)||b.system_ideal_pr_qty-a.system_ideal_pr_qty);
 res.json({fileName:req.file.originalname,totalRows:rows.length,exactMatches:db.length,criticalRows:rows.filter(x=>x.critical).length,prEligibleRows:candidates.length,aiEnabled:ai.aiEnabled,screenSource:ai.source,candidates:candidates.slice(0,100),issues,message:`${rows.filter(x=>x.critical).length} critical spares; ${candidates.length} PR eligible after existing PR/PO coverage.`});
});

export default r;
