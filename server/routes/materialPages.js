import {Router} from 'express';
import {auth} from '../auth.js';
import {getMaterialPage} from '../services/materialCatalog.js';

const r=Router();

r.get('/materials/page',auth,async(req,res)=>{
  res.json(await getMaterialPage(req.query));
});

export default r;
