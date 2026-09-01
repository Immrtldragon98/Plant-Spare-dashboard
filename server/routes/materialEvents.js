import {Router} from 'express';
import {auth} from '../auth.js';
import {getMaterialEvents,materialEventsAvailable} from '../services/materialEvents.js';

const r=Router();
const codeRe=/^[A-Z]{3}\d{12}$/;

r.get('/material-events/status',auth,async(req,res)=>{
  res.json({enabled:await materialEventsAvailable()});
});

r.get('/material-events/:materialCode',auth,async(req,res)=>{
  const code=String(req.params.materialCode||'').trim().toUpperCase();
  if(!codeRe.test(code))return res.status(400).json({error:'Material Code must be exactly 3 letters + 12 digits'});
  res.json(await getMaterialEvents(code,req.query.limit));
});

export default r;
