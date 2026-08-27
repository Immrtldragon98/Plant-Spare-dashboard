import {Router} from 'express';
import multer from 'multer';
import {auth,allow} from '../auth.js';
import {analyzeImport} from '../services/importAI.js';

const r=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});

r.post('/import/ai/analyze',auth,allow('planner','admin'),upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Excel file required'});
  const out=await analyzeImport(req.file.buffer);
  res.json({fileName:req.file.originalname,...out});
});

export default r;
