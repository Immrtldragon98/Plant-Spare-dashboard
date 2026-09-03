import React,{useEffect,useState} from 'react';
import {request} from '../api/client.js';

const label=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export default function System({setNotice}){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);request('/system/status').then(setData).catch(e=>setNotice(e.message)).finally(()=>setLoading(false))};
  useEffect(load,[]);
  if(loading)return <div className="emptyState"><h3>Loading system health…</h3></div>;
  if(!data)return <div className="emptyState"><h3>System health unavailable</h3></div>;
  const keyCounts=['materials','material_usages','locations','raw_upload_batches','raw_upload_rows','ingestion_canonical_rows','knowledge_documents','knowledge_chunks','material_events','procurement_events','import_mapping_memory','equipment_components','component_material_links','component_knowledge_links'];
  const largest=(data.tables||[]).slice(0,8);
  return <>
    <div className="pageTitle"><div><span className="eyebrow">ADMIN HEALTH</span><h1>System & Storage</h1><p>Watch database growth, ingestion evidence and storage readiness without touching production data.</p></div><button className="secondary" onClick={load}>Refresh</button></div>
    <div className="systemKpis"><div><span>Database size</span><strong>{data.database.megabytes} MB</strong><small>{data.database.name}</small></div><div><span>Object storage</span><strong>{data.object_storage.configured?'Ready':'Not configured'}</strong><small>{data.object_storage.provider}</small></div><div><span>Raw uploads</span><strong>{data.counts.raw_upload_batches??'—'}</strong><small>{data.counts.raw_upload_rows??'—'} raw rows</small></div><div><span>Knowledge</span><strong>{data.counts.knowledge_documents??'—'}</strong><small>{data.counts.knowledge_chunks??'—'} indexed chunks</small></div></div>
    {!data.object_storage.configured&&<div className="plannerAdvisory"><strong>Storage watch</strong><span>{data.object_storage.note}</span></div>}
    <section><div className="sectionHead"><div><h2>Largest database tables</h2><p>Use this to see what is actually consuming PostgreSQL storage as imports and knowledge grow.</p></div></div>{largest.length?<div className="tableWrap"><table><thead><tr><th>Table</th><th>Size</th><th>Approx. rows</th></tr></thead><tbody>{largest.map(x=><tr key={x.name}><td><strong>{label(x.name)}</strong></td><td>{x.megabytes} MB</td><td>{Number(x.estimated_rows||0).toLocaleString()}</td></tr>)}</tbody></table></div>:<div className="emptyState"><h3>Table size details unavailable</h3></div>}</section>
    <section><div className="sectionHead"><div><h2>Data footprint</h2><p>Exact counts from the production database. “—” means that optional migration/table is not active.</p></div></div><div className="systemCountGrid">{keyCounts.map(k=><div key={k}><span>{label(k)}</span><strong>{data.counts[k]??'—'}</strong></div>)}</div></section>
    <section><div className="sectionHead"><div><h2>Storage policy</h2><p>The rules that keep the app auditable without turning PostgreSQL into a file server.</p></div></div><div className="systemPolicy"><article><strong>Excel evidence</strong><p>{data.policy.raw_excel}</p></article><article><strong>Documents</strong><p>{data.policy.documents}</p></article><article><strong>Scale</strong><p>{data.policy.scale}</p></article></div></section>
  </>;
}
