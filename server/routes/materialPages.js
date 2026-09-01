import {Router} from 'express';
import {auth} from '../auth.js';
import {getMaterialPage} from '../services/materialCatalog.js';
import {getEquipmentSummary} from '../services/equipmentSummary.js';

const r=Router();

r.get('/materials/page',auth,async(req,res)=>{
  res.json(await getMaterialPage(req.query));
});

r.get('/equipment/summary',auth,async(req,res)=>{
  res.json(await getEquipmentSummary(req.query));
});

export default r;
