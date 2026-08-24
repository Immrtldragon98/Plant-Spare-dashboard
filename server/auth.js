import jwt from 'jsonwebtoken';
function secret(){
  const value=process.env.JWT_SECRET;
  if(value) return value;
  if(process.env.NODE_ENV==='production') throw new Error('JWT_SECRET is required in production');
  return 'dev-change-me';
}
export function signUser(user){ return jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role}, secret(), {expiresIn:'12h'}); }
export function auth(req,res,next){
  const token=req.headers.authorization?.replace(/^Bearer\s+/,'');
  if(!token) return res.status(401).json({error:'Login required'});
  try{req.user=jwt.verify(token,secret()); next();}catch{return res.status(401).json({error:'Invalid or expired login'});}
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'You do not have permission for this action'});
