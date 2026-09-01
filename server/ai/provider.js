export function providerConfig(){
  const openRouterKey=process.env.OPENROUTER_API_KEY||'';
  const explicitBase=process.env.AI_BASE_URL||process.env.AI_IMPORT_BASE_URL||'';
  const explicitKey=process.env.AI_API_KEY||process.env.AI_IMPORT_API_KEY||'';
  const explicitModel=process.env.AI_MODEL||process.env.AI_IMPORT_MODEL||'';
  const base=(explicitBase||(openRouterKey?'https://openrouter.ai/api/v1':'')).replace(/\/$/,'');
  const key=explicitKey||openRouterKey;
  const model=explicitModel||(openRouterKey?'openrouter/free':'');
  let provider='Rule Engine';
  if(base&&key&&model){
    const b=base.toLowerCase(),m=model.toLowerCase();
    provider=b.includes('openrouter.ai')?'OpenRouter':b.includes('openai.com')?'OpenAI':b.includes('generativelanguage.googleapis.com')||m.includes('gemini')?'Gemini':b.includes('localhost')||b.includes('127.0.0.1')||b.includes('ollama')?'Local / Ollama':'OpenAI-compatible AI';
  }
  return {base,key,model,provider,configured:Boolean(base&&key&&model)};
}

export async function callChatModel(cfg,messages,{tools=[],withTools=true,temperature=0.1}={}){
  const headers={'Content-Type':'application/json','Authorization':`Bearer ${cfg.key}`};
  if(cfg.provider==='OpenRouter'){
    headers['HTTP-Referer']=process.env.APP_PUBLIC_URL||'https://plant-spare-dashboard.onrender.com';
    headers['X-Title']='Plant Spare Dashboard - Spare Copilot';
  }
  const body={model:cfg.model,messages,temperature};
  if(withTools&&tools.length){body.tools=tools;body.tool_choice='auto'}
  const resp=await fetch(`${cfg.base}/chat/completions`,{method:'POST',headers,body:JSON.stringify(body)});
  if(!resp.ok){
    const detail=await resp.text().catch(()=> '');
    throw new Error(`AI provider returned ${resp.status}${detail?`: ${detail.slice(0,180)}`:''}`);
  }
  return resp.json();
}
