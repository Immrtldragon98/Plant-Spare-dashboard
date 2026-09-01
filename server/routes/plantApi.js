import {Router} from 'express';
import multer from 'multer';
import {plantApiAuth,plantApiWrite,plantHumanReview} from '../plantApiAuth.js';
import {plantApiStatus,plantMaterials,plantEquipment,plantHierarchy,plantProcurement,ingestPlantSnapshots} from '../services/plantDataApi.js';
import {processPlantExcel} from '../services/plantExcelGateway.js';
import {getRawBatch} from '../services/rawWorkbookStore.js';
import {listReviewQueue,reviewQueueStatus,commitReviewedBatch,decideIngestionBatch} from '../services/ingestionReviewQueue.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
r.use(plantApiAuth);

r.get('/status',async(req,res)=>res.json({...await plantApiStatus(),reviewQueue:await reviewQueueStatus(),principal:req.apiPrincipal}));
r.get('/materials',async(req,res)=>res.json(await plantMaterials(req.query)));
r.get('/equipment',async(req,res)=>res.json({rows:await plantEquipment(req.query)}));
r.get('/hierarchy',async(req,res)=>res.json(await plantHierarchy(req.query)));
r.get('/procurement',async(req,res)=>res.json(await plantProcurement(req.query)));
r.get('/raw/:batchId',async(req,res)=>res.json(await getRawBatch(req.params.batchId,{page:req.query.page,pageSize:req.query.page_size})));
r.get('/reviews',plantHumanReview,async(req,res)=>res.json(await listReviewQueue(req.query)));

r.post('/snapshots',plantApiWrite,async(req,res)=>{
  const body=req.body||{};
  const out=await ingestPlantSnapshots({type:String(body.type||'').trim(),rows:body.rows,source:String(body.source||req.headers['x-source-system']||'plant-api').trim().slice(0,180),principal:req.apiPrincipal?.name||'unknown',userId:req.user?.id||null});
  res.json(out);
});

r.post('/excel',plantApiWrite,upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file is required'});
  const out=await processPlantExcel({file:req.file,mode:req.body.mode||'review',defaultDiscipline:req.body.discipline||'',departmentCode:req.body.department_code||'',equipment:req.body.equipment||'',principal:req.apiPrincipal?.name||'unknown',userId:req.user?.id||null});
  res.json(out);
});

r.post('/reviews/:batchId/commit',plantApiWrite,async(req,res)=>{
  const out=await commitReviewedBatch({batchId:req.params.batchId,principal:req.apiPrincipal?.name||'unknown',userId:req.user?.id||null});
  res.json(out);
});

r.post('/reviews/:batchId/decision',plantHumanReview,async(req,res)=>{
  const out=await decideIngestionBatch({batchId:req.params.batchId,decision:req.body?.decision,note:req.body?.note||'',user:req.user});
  res.json(out);
});

export default r;
