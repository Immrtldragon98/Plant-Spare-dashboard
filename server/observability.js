import crypto from 'crypto';

export function requestContext(req,res,next){
  const requestId=String(req.headers['x-request-id']||crypto.randomUUID());
  req.requestId=requestId;
  res.setHeader('X-Request-Id',requestId);
  const started=Date.now();
  res.on('finish',()=>console.log(JSON.stringify({type:'http_request',request_id:requestId,method:req.method,path:String(req.originalUrl||req.url||'').split('?')[0],status:res.statusCode,duration_ms:Date.now()-started,user_id:req.user?.id||null})));
  next();
}

export function logError(err,req){
  console.error(JSON.stringify({type:'http_error',request_id:req?.requestId||null,method:req?.method||null,path:req?String(req.originalUrl||req.url||'').split('?')[0]:null,code:err?.code||null,message:err?.message||'Server error'}));
}
