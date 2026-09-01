import {Router} from 'express';
import {auth} from '../auth.js';
import {getAgentStatus,askSpareAgent} from '../agents/orchestrator.js';
import {safeText} from '../services/materialQuery.js';

const r=Router();

r.get('/spare-assistant/status',auth,(req,res)=>res.json(getAgentStatus()));

r.post('/spare-assistant/ask',auth,async(req,res,next)=>{
  try{
    const context=req.body?.context&&typeof req.body.context==='object'?{...req.body.context}:{};
    context.department_code=safeText(req.body?.department_code||context.department_code,80);
    const result=await askSpareAgent({
      question:req.body?.question,
      mode:req.body?.mode,
      context,
      history:Array.isArray(req.body?.history)?req.body.history:[]
    });
    res.json(result);
  }catch(e){
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }
});

export default r;
