import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function jwtSecret(){
  const value=process.env.JWT_SECRET;
  if(value)return value;
  if(process.env.NODE_ENV==='production')throw new Error('JWT_SECRET is required in production');
  return 'dev-change-me';
}

function safeEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&left.length>0&&crypto.timingSafeEqual(left,right);
}

export function plantApiAuth(req,res,next){
  const configuredKey=process.env.PLANT_API_KEY||'';
  const suppliedKey=req.headers['x-plant-api-key'];
  if(configuredKey&&suppliedKey&&safeEqual(configuredKey,suppliedKey)){
    req.user={id:null,name:'Plant API Service',email:null,role:'service'};
    req.apiPrincipal={type:'service',name:'Plant API Service'};
    return next();
  }
  const token=req.headers.authorization?.replace(/^Bearer\s+/,'');
  if(!token)return res.status(401).json({error:'Plant API authentication required'});
  try{
    req.user=jwt.verify(token,jwtSecret());
    req.apiPrincipal={type:'user',name:req.user.name||req.user.email||'user'};
    return next();
  }catch{
    return res.status(401).json({error:'Invalid Plant API credential'});
  }
}

export function plantApiWrite(req,res,next){
  if(req.apiPrincipal?.type==='service')return next();
  if(['planner','admin'].includes(req.user?.role))return next();
  return res.status(403).json({error:'Planner/admin or Plant API service credential required'});
}

export function plantHumanReview(req,res,next){
  if(req.apiPrincipal?.type!=='user')return res.status(403).json({error:'Human review requires a signed-in planner or admin user'});
  if(['planner','admin'].includes(req.user?.role))return next();
  return res.status(403).json({error:'Planner/admin permission required for ingestion approval'});
}
