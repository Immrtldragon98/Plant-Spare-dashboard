import {Router} from 'express';
import {auth,allow} from '../auth.js';
import {getImportHistoryPage} from '../services/importHistory.js';

const r=Router();
r.get('/import-history/page',auth,allow('planner','admin'),async(req,res)=>res.json(await getImportHistoryPage(req.query)));
export default r;
