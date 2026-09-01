import {Router} from 'express';
import {plantApiAuth,plantApiWrite} from '../plantApiAuth.js';
import {plantApiStatus,plantMaterials,plantEquipment,plantHierarchy,plantProcurement,ingestPlantSnapshots} from '../services/plantDataApi.js';

const r=Router();
r.use(plantApiAuth);

r.get('/status',async(req,res)=>res.json({...await plantApiStatus(),principal:req.apiPrincipal}));
r.get('/materials',async(req,res)=>res.json(await plantMaterials(req.query)));
r.get('/equipment',async(req,res)=>res.json({rows:await plantEquipment(req.query)}));
r.get('/hierarchy',async(req,res)=>res.json(await plantHierarchy(req.query)));
r.get('/procurement',async(req,res)=>res.json(await plantProcurement(req.query)));

r.post('/snapshots',plantApiWrite,async(req,res)=>{
  const body=req.body||{};
  const out=await ingestPlantSnapshots({type:String(body.type||'').trim(),rows:body.rows,source:String(body.source||req.headers['x-source-system']||'plant-api').trim().slice(0,180),principal:req.apiPrincipal?.name||'unknown',userId:req.user?.id||null});
  res.json(out);
});

export default r;
