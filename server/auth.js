import jwt from 'jsonwebtoken';
import {q} from './db.js';

function secret(){
  const value=process.env.JWT_SECRET;
  if(value) return value;
  if(process.env.NODE_ENV==='production') throw new Error('JWT_SECRET is required in production');
  return 'dev-change-me';
}
export function signUser(user){ return jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role}, secret(), {expiresIn:'12h'}); }
export async function auth(req,res,next){
  const token=req.headers.authorization?.replace(/^Bearer\s+/,'');
  if(!token) return res.status(401).json({error:'Login required'});
  try{
    const claims=jwt.verify(token,secret());
    const user=(await q('SELECT id,name,email,username,role,active FROM users WHERE id=$1 AND active=true',[claims.id])).rows[0];
    if(!user)return res.status(401).json({error:'Invalid or expired login'});
    req.user=user;
    next();
  }catch{return res.status(401).json({error:'Invalid or expired login'});}
}
export const allow=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'You do not have permission for this action'});
