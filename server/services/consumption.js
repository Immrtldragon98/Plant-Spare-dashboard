import crypto from 'crypto';
import * as XLSX from 'xlsx';
import {q,pool} from '../db.js';

const codeRe=/^[A-Z]{3}\\d{12}$/;
const movementSigns={'201':1,'202':-1,'261':1,'262':-1,'551':1};
const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const first=(row,names)=>{const keys=Object.keys(row);const key=keys.find(k=>names.includes(norm(k)));return key===undefined?null:row[key]};
const toNumber=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null};
const toDate=v=>{if(v instanceof Date&&!Number.isNaN(v.valueOf()))return v;if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);if(d)return new Date(Date.UTC(d.y,d.m-1,d.d,d.H||0,d.M||0,d.S||0))}const d=new Date(v);return Number.isNaN(d.valueOf())?null:d};

export function normalizeMovementRow(row){
  const materialCode=String(first(row,['material','materialcode','materialnumber','materialno','matnr'])||'').trim().toUpperCase();
  const movementType=String(first(row,['movementtype','movement','movetype','mvt'])||'').trim();
  const rawQty=toNumber(first(row,['quantity','qty','quantityinunitofentry','quantityinbaseunit','issuedquantity']));
  const date=toDate(first(row,['postingdate','documentdate','entrydate','date']));
  const documentNumber=String(first(row,['materialdocument','materialdocumentnumber','documentnumber','documentno'])||'').trim()||null;
  const item=String(first(row,['materialdocitem','item','itemnumber'])||'').trim()||null;
  const uom=String(first(row,['baseunitofmeasure','unitofentry','uom','unit'])||'').trim()||null;
  if(!codeRe.test(materialCode))return {valid:false,reason:'invalid_material_code'};
  if(!(movementType in movementSigns))return {valid:false,reason:'unsupported_movement_type',materialCode,movementType};
  if(rawQty===null||rawQty<0)return {valid:false,reason:'invalid_quantity',materialCode,movementType};
  if(!date)return {valid:false,reason:'invalid_posting_date',materialCode,movementType};
  return {valid:true,materialCode,movementType,quantity:rawQty*movementSigns[movementType],date,documentNumber,item,uom};
}

export async function importConsumptionMovements(file,userId){
  const workbook=XLSX.read(file.buffer,{type:'buffer',cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:true});
  const hash=crypto.createHash('sha256').update(file.buffer).digest('hex').slice(0,20);
  const parsed=rows.map(normalizeMovementRow),valid=parsed.filter(x=>x.valid);
  const codes=[...new Set(valid.map(x=>x.materialCode))];
  const materials=codes.length?(await q(`SELECT id,material_code FROM materials WHERE active=true AND material_code=ANY($1::text[])`,[codes])).rows:[];
  const byCode=new Map(materials.map(x=>[x.material_code,x.id]));
  let recorded=0,duplicate=0,unmatched=0;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(let i=0;i<valid.length;i++){
      const x=valid[i],materialId=byCode.get(x.materialCode);
      if(!materialId){unmatched++;continue}
      const ref=[hash,i+2,x.documentNumber||'',x.item||''].join(':');
      const out=await client.query(`INSERT INTO material_events(material_id,material_code,event_type,event_at,quantity,uom,source_type,source_ref,metadata,created_by)
        VALUES($1,$2,'GOODS_ISSUE',$3,$4,$5,'sap_movement_upload',$6,$7,$8)
        ON CONFLICT(source_type,source_ref,event_type) WHERE source_ref IS NOT NULL DO NOTHING RETURNING id`,
        [materialId,x.materialCode,x.date,x.quantity,x.uom,ref,JSON.stringify({movement_type:x.movementType,document_number:x.documentNumber,item:x.item,confirmed_consumption:true}),userId]);
      if(out.rowCount)recorded++;else duplicate++;
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  const reasons=parsed.filter(x=>!x.valid).reduce((a,x)=>(a[x.reason]=(a[x.reason]||0)+1,a),{});
  return {file_name:file.originalname,total_rows:rows.length,confirmed_rows:valid.length,recorded,duplicates_skipped:duplicate,unmatched_materials:unmatched,invalid_rows:parsed.length-valid.length,issues:reasons,movement_types:['201','202','261','262','551'],note:'201, 261 and 551 count as consumption. 202 and 262 reverse consumption. Inventory snapshots are excluded.'};
}

const periodSql=period=>period==='week'?'week':'month';
export async function getConsumptionStudy(materialCode,{period='month',months=24}={}){
  const code=String(materialCode||'').trim().toUpperCase();if(!codeRe.test(code))throw new Error('Valid Material Code required');
  const bucket=periodSql(period),window=Math.min(Math.max(Number(months)||24,1),120);
  const material=(await q(`SELECT id,material_code,spare_name,description,uom,store_qty,pr_qty,po_qty FROM materials WHERE active=true AND material_code=$1`,[code])).rows[0];
  if(!material)return {enabled:true,material_code:code,found:false,period:bucket,series:[]};
  const sql="SELECT date_trunc('"+bucket+"',event_at)::date period, SUM(quantity)::numeric confirmed_consumption, SUM(quantity) FILTER(WHERE quantity>0)::numeric gross_issue, ABS(SUM(quantity) FILTER(WHERE quantity<0))::numeric reversals, COUNT(*)::int movement_rows FROM material_events WHERE material_id=$1 AND event_type='GOODS_ISSUE' AND event_at>=date_trunc('month',CURRENT_DATE)-($2::int||' months')::interval GROUP BY 1 ORDER BY 1";
  const series=(await q(sql,[material.id,window])).rows;
  const values=series.map(x=>Number(x.confirmed_consumption||0)),total=values.reduce((a,b)=>a+b,0);
  const recent=values.slice(-3),previous=values.slice(-6,-3);
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0,recentAvg=avg(recent),previousAvg=avg(previous);
  const trend=recent.length<2?'insufficient_history':previous.length&&recentAvg>previousAvg*1.15?'increasing':previous.length&&recentAvg<previousAvg*.85?'decreasing':'stable';
  const first=series[0]?.period||null,last=series.at(-1)?.period||null,coverage=series.length;
  const confidence=coverage>=12?'high':coverage>=6?'medium':coverage>=3?'low':'insufficient';
  const avgPerPeriod=avg(values),periodsPerYear=bucket==='week'?52:12;
  const lastIssue=(await q(`SELECT MAX(event_at) last_issue_date FROM material_events WHERE material_id=$1 AND event_type='GOODS_ISSUE'`,[material.id])).rows[0]?.last_issue_date||null;
  return {enabled:true,found:true,material,period:bucket,window_months:window,source:'confirmed_sap_movements',included_movement_types:['201','202','261','262','551'],series,
    summary:{total_consumption:total,average_per_period:avgPerPeriod,annualized_run_rate:avgPerPeriod*periodsPerYear,active_periods:coverage,first_period:first,last_period:last,last_issue_date:lastIssue,trend,confidence},
    inventory:{store_qty:material.store_qty,open_pr_qty:material.pr_qty,open_po_qty:material.po_qty},
    warning:coverage?'Consumption is calculated only from uploaded SAP goods movements; inventory snapshots are not counted as consumption.':'No confirmed SAP goods-issue history has been uploaded for this material.'};
}
