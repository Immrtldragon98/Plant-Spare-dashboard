import {Router} from 'express';
import multer from 'multer';
import {auth,allow} from '../auth.js';
import {getMaterialEvents,materialEventsAvailable} from '../services/materialEvents.js';
import {getConsumptionStudy,importConsumptionMovements} from '../services/consumption.js';

const r=Router();
const codeRe=/^[A-Z]{3}\d{12}$/;

r.get('/material-events/status',auth,async(req,res)=>{
  res.json({enabled:await materialEventsAvailable()});
});

r.post('/material-consumption/import',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'SAP movement Excel or CSV file required'});
  res.json({ok:true,...await importConsumptionMovements(req.file,req.user.id)});
});

r.get('/material-consumption/:materialCode',auth,async(req,res)=>{
  const code=String(req.params.materialCode||'').trim().toUpperCase();
  if(!codeRe.test(code))return res.status(400).json({error:'Material Code must be exactly 3 letters + 12 digits'});
  res.json(await getConsumptionStudy(code,{period:req.query.period,months:req.query.months}));
});

r.get('/material-events/:materialCode',auth,async(req,res)=>{
  const code=String(req.params.materialCode||'').trim().toUpperCase();
  if(!codeRe.test(code))return res.status(400).json({error:'Material Code must be exactly 3 letters + 12 digits'});
  res.json(await getMaterialEvents(code,req.query.limit));
});

export default r;
