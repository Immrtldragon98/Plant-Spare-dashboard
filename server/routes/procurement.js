import {Router} from 'express';
import {auth} from '../auth.js';
import {providerConfig,callChatModel} from '../ai/provider.js';
import {procurementCandidates,procurementPage,deterministicScreen,cleanProcurementText} from '../services/procurementService.js';
import {getProcurementHistory,procurementEventsAvailable} from '../services/procurementEvents.js';

const r=Router();

r.get('/procurement',auth,async(req,res)=>{
  res.json(await procurementPage(req.query));
});

r.get('/procurement/history/:materialCode',auth,async(req,res)=>{
  res.json(await getProcurementHistory(req.params.materialCode,req.query.limit||50));
});

r.get('/procurement/status',auth,async(req,res)=>{
  res.json({eventStore:await procurementEventsAvailable(),snapshotStore:true});
});

r.post('/procurement/pr-eligible/screen',auth,async(req,res)=>{
  const {department_code='',area='',search=''}=req.body||{};
  const eligible=(await procurementCandidates({department_code,area,search})).filter(x=>x.pr_eligible).sort((a,b)=>b.ideal_pr_qty-a.ideal_pr_qty).slice(0,100);
  const fallback=deterministicScreen(eligible),cfg=providerConfig();
  if(!cfg.configured)return res.json({aiEnabled:false,source:'rule-screen',rows:eligible,screening:fallback,message:'AI provider is not configured. Deterministic PR eligibility and priority are shown.'});
  const payload=eligible.map(x=>({material_code:x.material_code,spare_name:x.spare_name,description:x.description,required_qty:x.required_qty,store_qty:x.store_qty,open_pr:x.pr_qty,open_po:x.po_qty,ideal_pr_qty:x.ideal_pr_qty,vendor:x.vendor,area:x.areas,equipment:x.equipment}));
  const prompt=`Review this already rule-qualified industrial spare PR list. Do NOT alter material codes, eligibility or ideal_pr_qty. Rank urgency only. Return only JSON {"rankings":[{"material_code":"...","priority":"Urgent|High|Medium|Low","reason":"..."}]}. Use only supplied facts; never invent consumption, lead time, price or history. Candidates: ${JSON.stringify(payload)}`;
  try{
    const body=await callChatModel(cfg,[{role:'system',content:'You are a cautious industrial spare procurement reviewer. Deterministic rules decide eligibility and quantity; you only rank urgency and explain.'},{role:'user',content:prompt}],{withTools:false,temperature:0.1});
    const raw=body?.choices?.[0]?.message?.content||'{}',parsed=JSON.parse(String(raw).replace(/^```json\s*/i,'').replace(/```$/,'').trim());
    const allowed=new Set(eligible.map(x=>x.material_code));
    const rankings=(parsed.rankings||[]).filter(x=>allowed.has(cleanProcurementText(x.material_code))).map(x=>({material_code:cleanProcurementText(x.material_code),priority:['Urgent','High','Medium','Low'].includes(x.priority)?x.priority:'Medium',reason:cleanProcurementText(x.reason).slice(0,300)}));
    const rankMap=new Map(rankings.map(x=>[x.material_code,x]));
    return res.json({aiEnabled:true,source:'ai-review',engine:cfg.provider,model:cfg.model,rows:eligible,screening:eligible.map(x=>rankMap.get(x.material_code)||{material_code:x.material_code,priority:x.rule_priority,reason:x.rule_reason}),message:'AI reviewed only the deterministic PR-eligible list. Quantities were not changed.'});
  }catch(error){
    return res.json({aiEnabled:false,source:'rule-screen',rows:eligible,screening:fallback,message:`AI review unavailable: ${error.message}. Deterministic result shown.`});
  }
});

export default r;
