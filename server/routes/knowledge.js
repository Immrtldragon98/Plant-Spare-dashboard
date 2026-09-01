import {Router} from 'express';
import multer from 'multer';
import {auth,allow} from '../auth.js';
import {listKnowledgeDocuments,saveKnowledgeDocument,searchKnowledge,knowledgeStatus} from '../services/knowledge.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});

r.get('/knowledge/status',auth,async(req,res)=>res.json(await knowledgeStatus()));

r.get('/knowledge',auth,async(req,res)=>{
  res.json(await listKnowledgeDocuments(req.query.limit));
});

r.post('/knowledge/upload',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'PDF or text file required'});
  const metadata={title:req.body.title,document_type:req.body.document_type,manufacturer:req.body.manufacturer,department_code:req.body.department_code,equipment:req.body.equipment,sub_equipment:req.body.sub_equipment,discipline:req.body.discipline,material_code:req.body.material_code,notes:req.body.notes};
  const out=await saveKnowledgeDocument({file:req.file,metadata,userId:req.user.id});
  res.json({ok:true,...out,message:out.originalArchived?'Document indexed for RAG and original file archived in object storage.':'Document indexed for RAG. Original binary is not archived because object storage is not configured.'});
});

r.post('/knowledge/search',auth,async(req,res)=>{
  const query=String(req.body?.query||'').trim();
  if(!query)return res.status(400).json({error:'Search query required'});
  const context=req.body?.context&&typeof req.body.context==='object'?req.body.context:{};
  const hits=await searchKnowledge(query,context,req.body?.limit||8);
  res.json({query,hits});
});

export default r;
