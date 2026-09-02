import React,{useEffect,useState} from 'react';
import {request} from '../api/client.js';

const types=['Manual','OEM Catalogue','Datasheet','Drawing Notes','Repair Report','Failure / RCA','Other'];
const qty=v=>Number(v||0);

export default function Knowledge({filters,canEdit,setNotice}){
  const[overview,setOverview]=useState(null),[loadingOverview,setLoadingOverview]=useState(false),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[hits,setHits]=useState([]),[searching,setSearching]=useState(false);
  const[form,setForm]=useState({title:'',document_type:'Manual',material_code:''});

  const loadOverview=async()=>{
    setLoadingOverview(true);
    try{
      const qs=new URLSearchParams();
      if(filters.department_code)qs.set('department_code',filters.department_code);
      if(filters.equipment)qs.set('equipment',filters.equipment);
      if(filters.sub_equipment)qs.set('sub_equipment',filters.sub_equipment);
      if(filters.discipline)qs.set('discipline',filters.discipline);
      setOverview(await request('/knowledge/equipment?'+qs));
    }catch(e){setNotice(e.message)}finally{setLoadingOverview(false)}
  };
  useEffect(()=>{loadOverview()},[filters.department_code,filters.equipment,filters.sub_equipment,filters.discipline]);

  const upload=async()=>{if(!file||busy)return;setBusy(true);try{const fd=new FormData();fd.append('file',file);fd.append('department_code',filters.department_code||'');fd.append('equipment',filters.equipment||'');fd.append('sub_equipment',filters.sub_equipment||'');fd.append('discipline',filters.discipline||'');fd.append('title',form.title||file.name.replace(/\.[^.]+$/,''));fd.append('document_type',form.document_type);fd.append('material_code',form.material_code||'');const x=await request('/knowledge/upload',{method:'POST',body:fd});setNotice(`${x.title} added to this equipment knowledge.`);setFile(null);setForm({title:'',document_type:'Manual',material_code:''});await loadOverview()}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const search=async(searchText=query)=>{const text=String(searchText||'').trim();if(!text)return;setQuery(text);setSearching(true);try{const x=await request('/knowledge/search',{method:'POST',body:JSON.stringify({query:text,context:{department_code:filters.department_code,equipment:filters.equipment,sub_equipment:filters.sub_equipment,discipline:filters.discipline},limit:8})});setHits(x.hits||[])}catch(e){setNotice(e.message)}finally{setSearching(false)}};

  const summary=overview?.summary||{},materials=overview?.materials||[],critical=overview?.critical||[],documents=overview?.documents||[],components=overview?.components||[];
  const equipmentName=filters.sub_equipment||filters.equipment||'Current equipment';
  const hierarchy=overview?.hierarchy?.[0];

  return <>
    <div className="pageTitle"><div><span className="eyebrow">EQUIPMENT KNOWLEDGE</span><h1>{equipmentName}</h1><p>Learn the equipment, its spares, drawings, manuals and current material position before planning maintenance.</p></div></div>

    {!filters.equipment&&!filters.sub_equipment&&<div className="emptyState"><h3>Select an equipment</h3><p>Choose Equipment or Sub-equipment from the planner filters. Plant Knowledge will then build a focused learning workspace for it.</p></div>}

    {(filters.equipment||filters.sub_equipment)&&<>
      <section className="equipmentKnowledgeHero">
        <div className="equipmentKnowledgeTitle"><span>YOU ARE WORKING ON</span><strong>{equipmentName}</strong><p>{hierarchy?[hierarchy.department,hierarchy.sub_department,hierarchy.equipment,hierarchy.sub_equipment].filter(Boolean).join(' → '):'Loading plant hierarchy…'}</p></div>
        <div className="equipmentKnowledgeStats"><div><strong>{summary.materials||0}</strong><span>Linked spares</span></div><div><strong>{summary.critical||0}</strong><span>Below required</span></div><div><strong>{summary.uncovered||0}</strong><span>Uncovered</span></div><div><strong>{summary.documents||0}</strong><span>Documents</span></div></div>
      </section>

      <section className="plannerLearning"><div className="sectionHead"><div><h2>What a planner should understand</h2><p>Use these as a learning checklist before planning work on {equipmentName}.</p></div></div><div className="learningGrid">
        <button onClick={()=>search(`Explain how ${equipmentName} works and its major assemblies`)}><strong>How it works</strong><span>Function, process flow and major assemblies.</span></button>
        <button onClick={()=>search(`What lubrication, bearings and maintenance precautions are specified for ${equipmentName}`)}><strong>Maintenance basics</strong><span>Lubrication, bearings, inspections and precautions.</span></button>
        <button onClick={()=>search(`What are common failure modes and repair lessons for ${equipmentName}`)}><strong>Failure & repair lessons</strong><span>Use manuals, repair reports and RCA evidence.</span></button>
        <button onClick={()=>search(`Which drawings, manuals and OEM documents are available for ${equipmentName}`)}><strong>Drawings & manuals</strong><span>Find the engineering evidence before deciding a spare.</span></button>
      </div></section>

      <section className="knowledgeSearch simpleKnowledgeSearch"><div className="sectionHead"><div><h2>Ask the equipment knowledge</h2><p>Search indexed drawings, manuals, OEM catalogues, repair reports and plant evidence scoped to this equipment.</p></div></div><div className="knowledgeSearchBar"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')search()}} placeholder={`Ask about ${equipmentName}…`}/><button disabled={!query.trim()||searching} onClick={()=>search()}>{searching?'Searching…':'Search'}</button></div>{hits.length>0&&<div className="knowledgeHits">{hits.map((h,i)=><article key={`${h.document_id}-${h.chunk_index}-${i}`}><strong>{h.metadata?.title||h.file_name}</strong><p>{h.text}</p><small>{[h.metadata?.document_type,h.metadata?.equipment,h.metadata?.sub_equipment].filter(Boolean).join(' · ')}</small></article>)}</div>}</section>

      <section><div className="sectionHead"><div><h2>Spare position</h2><p>Current material master and procurement position for {equipmentName}. Use Spare Assistant when you need help choosing the correct Material Code.</p></div></div>{loadingOverview?<div className="emptyState"><p>Loading equipment data…</p></div>:materials.length?<div className="tableWrap"><table><thead><tr><th>Material Code</th><th>Spare</th><th>Required</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Gap</th></tr></thead><tbody>{materials.slice(0,20).map(m=><tr key={m.material_code}><td className="code">{m.material_code}</td><td><strong>{m.spare_name||m.description||'Unnamed spare'}</strong><small className="muted block">{m.part_number||m.locations||''}</small></td><td>{qty(m.required_qty)}</td><td>{qty(m.store_qty)}</td><td>{qty(m.pr_qty)}</td><td>{qty(m.po_qty)}</td><td>{qty(m.uncovered_gap)}</td></tr>)}</tbody></table></div>:<div className="emptyState"><p>No linked material usages were found for this equipment yet.</p></div>}</section>

      {critical.length>0&&<section><div className="sectionHead"><div><h2>Planner attention</h2><p>Materials currently below their recorded requirement.</p></div></div><div className="knowledgeAttentionGrid">{critical.slice(0,6).map(m=><article key={m.material_code}><code>{m.material_code}</code><strong>{m.spare_name||m.description||'Spare'}</strong><span>Required {qty(m.required_qty)} · Store {qty(m.store_qty)} · PR {qty(m.pr_qty)} · PO {qty(m.po_qty)}</span></article>)}</div></section>}

      <section><div className="sectionHead"><div><h2>{overview?.graphEnabled?'Assemblies & components':'Assemblies & components · activation pending'}</h2><p>{overview?.graphEnabled?'Approved equipment structure linking drawings and Material Codes.':'Migration 009 will enable explicit assembly → spare → drawing relationships. Existing equipment/material/document knowledge already works.'}</p></div></div>{components.length?<div className="componentGrid">{components.map(c=><article key={c.id}><span>{c.component_type}</span><strong>{c.component_name}</strong><p>{c.description||c.notes||'No planner note yet.'}</p><small>{c.material_count} spares · {c.document_count} documents{c.drawing_number?` · Drawing ${c.drawing_number}`:''}</small></article>)}</div>:<div className="emptyState"><p>No explicit component structure has been approved yet. This does not block equipment learning from existing material usages and documents.</p></div>}</section>

      <section><div className="sectionHead"><div><h2>Drawings & engineering documents</h2><p>Evidence currently associated with {equipmentName}.</p></div></div>{documents.length?<div className="knowledgeDocGrid">{documents.slice(0,12).map(d=><article key={d.id}><span>{d.document_type||'Document'}</span><strong>{d.title||d.file_name}</strong><p>{[d.manufacturer,d.discipline,d.material_code].filter(Boolean).join(' · ')||'Equipment reference'}</p>{d.material_code&&<code>{d.material_code}</code>}</article>)}</div>:<div className="emptyState"><p>No drawings or manuals are linked to this equipment yet.</p></div>}</section>

      {canEdit&&<section className="simpleKnowledgeUpload"><div><h2>Add drawing or document</h2><p>The current equipment context is attached automatically. Add a Material Code only when the document clearly supports that material.</p></div><div className="knowledgeUploadRow"><label className="simpleFile"><span>{file?file.name:'Choose PDF or text file'}</span><input type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!form.title)setForm(x=>({...x,title:f.name.replace(/\.[^.]+$/,'')}))}}/></label><input placeholder="Title (optional)" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><select value={form.document_type} onChange={e=>setForm({...form,document_type:e.target.value})}>{types.map(x=><option key={x}>{x}</option>)}</select><input className="code" placeholder="Related Material Code (optional)" value={form.material_code} onChange={e=>setForm({...form,material_code:e.target.value.toUpperCase()})}/><button disabled={!file||busy} onClick={upload}>{busy?'Adding…':'Add to Equipment Knowledge'}</button></div></section>}
    </>}
  </>;
}
