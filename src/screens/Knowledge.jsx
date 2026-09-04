import React,{useEffect,useMemo,useState} from 'react';
import {request} from '../api/client.js';
import {maintenanceTopics,plannerWorkflow} from '../domain/maintenanceKnowledge.js';

const types=['Manual','OEM Catalogue','Datasheet','Drawing Notes','Repair Report','Failure / RCA','Other'];
const qty=v=>Number(v||0);
const text=v=>String(v??'').trim();

export default function Knowledge({filters,options={},canEdit,setNotice}){
  const[equipment,setEquipment]=useState(filters.area||filters.equipment||'');
  const[subEquipment,setSubEquipment]=useState(filters.sub_equipment||'');
  const[subOptions,setSubOptions]=useState(options.sub_equipment||[]);
  const[discipline,setDiscipline]=useState(filters.discipline||'');
  const[overview,setOverview]=useState(null),[loadingOverview,setLoadingOverview]=useState(false),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[hits,setHits]=useState([]),[searching,setSearching]=useState(false);
  const[form,setForm]=useState({title:'',document_type:'Manual',material_code:''});
  const[guideDiscipline,setGuideDiscipline]=useState('All');

  const equipmentOptions=options.equipment||options.areas||[];
  useEffect(()=>{if(!equipment){setSubOptions(options.sub_equipment||[]);return}request('/options?'+new URLSearchParams({department_code:filters.department_code||'',area:equipment})).then(x=>{const next=x.sub_equipment||[];setSubOptions(next);if(subEquipment&&!next.includes(subEquipment))setSubEquipment('')}).catch(e=>setNotice(e.message))},[equipment,filters.department_code]);
  useEffect(()=>{if(filters.area||filters.equipment)setEquipment(filters.area||filters.equipment)},[filters.area,filters.equipment]);
  useEffect(()=>{if(filters.sub_equipment)setSubEquipment(filters.sub_equipment)},[filters.sub_equipment]);

  const loadOverview=async()=>{
    setLoadingOverview(true);
    try{
      const qs=new URLSearchParams();
      if(filters.department_code)qs.set('department_code',filters.department_code);
      if(equipment)qs.set('equipment',equipment);
      if(subEquipment)qs.set('sub_equipment',subEquipment);
      if(discipline)qs.set('discipline',discipline);
      setOverview(await request('/knowledge/equipment?'+qs));
    }catch(e){setNotice(e.message)}finally{setLoadingOverview(false)}
  };
  useEffect(()=>{loadOverview()},[filters.department_code,equipment,subEquipment,discipline]);

  const upload=async()=>{if(!file||busy)return;setBusy(true);try{const fd=new FormData();fd.append('file',file);fd.append('department_code',filters.department_code||'');fd.append('equipment',equipment);fd.append('sub_equipment',subEquipment);fd.append('discipline',discipline);fd.append('title',form.title||file.name.replace(/\.[^.]+$/,''));fd.append('document_type',form.document_type);fd.append('material_code',form.material_code||'');const x=await request('/knowledge/upload',{method:'POST',body:fd});setNotice(`${x.title} added to Plant Knowledge.`);setFile(null);setForm({title:'',document_type:'Manual',material_code:''});await loadOverview()}catch(e){setNotice(e.message)}finally{setBusy(false)}};
  const search=async(searchText=query)=>{const value=text(searchText);if(!value)return;setQuery(value);setSearching(true);try{const x=await request('/knowledge/search',{method:'POST',body:JSON.stringify({query:value,context:{department_code:filters.department_code,equipment,sub_equipment:subEquipment,discipline},limit:8})});setHits(x.hits||[])}catch(e){setNotice(e.message)}finally{setSearching(false)}};

  const guideHits=useMemo(()=>{const words=query.toLowerCase().split(/\W+/).filter(w=>w.length>2);if(!words.length)return[];return maintenanceTopics.filter(t=>words.some(w=>JSON.stringify(t).toLowerCase().includes(w))).slice(0,6)},[query]);
  const visibleTopics=maintenanceTopics.filter(t=>guideDiscipline==='All'||t.discipline===guideDiscipline);
  const summary=overview?.summary||{},materials=overview?.materials||[],critical=overview?.critical||[],documents=overview?.documents||[],components=overview?.components||[];
  const equipmentName=subEquipment||equipment||'Cast House 2';
  const hierarchy=overview?.hierarchy?.[0];

  return <>
    <div className="pageTitle"><div><span className="eyebrow">PLANT KNOWLEDGE</span><h1>Maintenance engineering workspace</h1><p>Understand equipment, failure modes, inspection points, spares and job-planning requirements before maintenance.</p></div></div>

    <section className="knowledgeScope">
      <div><strong>Choose plant context</strong><span>Plant Knowledge works without a selection; choose equipment when you need its live spare position.</span></div>
      <div className="knowledgeScopeFields">
        <label>Equipment<select value={equipment} onChange={e=>{setEquipment(e.target.value);setSubEquipment('')}}><option value="">All CH2 equipment</option>{equipmentOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>Sub-equipment<select value={subEquipment} onChange={e=>setSubEquipment(e.target.value)}><option value="">All sub-equipment</option>{subOptions.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>Discipline<select value={discipline} onChange={e=>setDiscipline(e.target.value)}><option value="">All disciplines</option><option>Mechanical</option><option>Electrical</option><option>Instrumentation</option><option>Operation</option><option>Process</option></select></label>
      </div>
    </section>

    <section className="equipmentKnowledgeHero">
      <div className="equipmentKnowledgeTitle"><span>YOU ARE WORKING ON</span><strong>{equipmentName}</strong><p>{hierarchy?[hierarchy.department,hierarchy.equipment,hierarchy.sub_equipment].filter(Boolean).join(' → '):equipment?'Loading plant hierarchy…':'Plant-wide maintenance and planning knowledge'}</p></div>
      <div className="equipmentKnowledgeStats"><div><strong>{summary.materials||0}</strong><span>Linked spares shown</span></div><div><strong>{summary.critical||0}</strong><span>Below required</span></div><div><strong>{summary.uncovered||0}</strong><span>Uncovered</span></div><div><strong>{summary.documents||0}</strong><span>Plant documents</span></div></div>
    </section>

    <section className="plannerLearning"><div className="sectionHead"><div><h2>Senior planner method</h2><p>Use this sequence for preventive work, breakdown preparation and spare planning.</p></div></div><div className="plannerWorkflow">{plannerWorkflow.map(([title,body])=><article key={title}><strong>{title}</strong><p>{body}</p></article>)}</div></section>

    <section className="maintenanceLibrary"><div className="sectionHead"><div><h2>Equipment & spare knowledge</h2><p>Practical checks, failure modes and planning requirements for common mechanical and electrical assets.</p></div><div className="guideTabs">{['All','Mechanical','Electrical'].map(v=><button className={guideDiscipline===v?'active':''} onClick={()=>setGuideDiscipline(v)} key={v}>{v}</button>)}</div></div><div className="maintenanceTopicGrid">{visibleTopics.map(t=><details key={t.id}><summary><span>{t.discipline}</span><strong>{t.title}</strong><small>{t.purpose}</small></summary><div><h4>Inspect</h4><ul>{t.inspect.map(x=><li key={x}>{x}</li>)}</ul><h4>Common failures</h4><ul>{t.failures.map(x=><li key={x}>{x}</li>)}</ul><h4>Planner preparation</h4><ul>{t.plan.map(x=><li key={x}>{x}</li>)}</ul></div></details>)}</div></section>

    <section className="knowledgeSearch simpleKnowledgeSearch"><div className="sectionHead"><div><h2>Ask Plant Knowledge</h2><p>Search the built-in maintenance guide and your indexed drawings, manuals, OEM catalogues, repair reports and RCA records.</p></div></div><div className="knowledgeSearchBar"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')search()}} placeholder="Example: bearing failure checks or motor spare planning"/><button disabled={!query.trim()||searching} onClick={()=>search()}>{searching?'Searching…':'Search'}</button></div>{query&&guideHits.length===0&&hits.length===0&&!searching&&<p className="muted">No matching plant guide or uploaded document found.</p>}{(guideHits.length>0||hits.length>0)&&<div className="knowledgeHits">{guideHits.map(t=><article key={t.id}><strong>{t.title}</strong><p>{t.purpose} Inspect: {t.inspect.join('; ')}. Plan: {t.plan.join('; ')}.</p><small>Built-in {t.discipline} maintenance guide</small></article>)}{hits.map((h,i)=><article key={`${h.document_id}-${h.chunk_index}-${i}`}><strong>{h.metadata?.title||h.file_name}</strong><p>{h.text}</p><small>{[h.metadata?.document_type,h.metadata?.equipment,h.metadata?.sub_equipment].filter(Boolean).join(' · ')}</small></article>)}</div>}</section>

    <section><div className="sectionHead"><div><h2>Live spare position · {equipmentName}</h2><p>Spare Name is shown only when known; Description remains a separate technical field.</p></div></div>{loadingOverview?<div className="emptyState"><p>Loading equipment data…</p></div>:materials.length?<div className="tableWrap"><table><thead><tr><th>Material Code</th><th>Spare Name</th><th>Description</th><th>Required</th><th>Store</th><th>Open PR</th><th>Open PO</th><th>Gap</th></tr></thead><tbody>{materials.slice(0,30).map((m,i)=><tr key={m.material_code||i}><td className="code">{m.material_code||'—'}</td><td>{m.spare_name||'—'}</td><td>{m.description||'—'}</td><td>{qty(m.required_qty)}</td><td>{qty(m.store_qty)}</td><td>{qty(m.pr_qty)}</td><td>{qty(m.po_qty)}</td><td>{qty(m.uncovered_gap)}</td></tr>)}</tbody></table></div>:<div className="emptyState"><p>No linked material usages were found for this context yet.</p></div>}</section>

    {critical.length>0&&<section><div className="sectionHead"><div><h2>Planner attention</h2><p>Materials currently below their recorded requirement.</p></div></div><div className="knowledgeAttentionGrid">{critical.slice(0,6).map((m,i)=><article key={m.material_code||i}><code>{m.material_code||'No code'}</code><strong>{m.spare_name||m.description||'Unnamed spare'}</strong><span>Required {qty(m.required_qty)} · Store {qty(m.store_qty)} · PR {qty(m.pr_qty)} · PO {qty(m.po_qty)}</span></article>)}</div></section>}

    {(equipment||subEquipment)&&<section><div className="sectionHead"><div><h2>Assemblies & components</h2><p>Approved equipment structure linking drawings and Material Codes.</p></div></div>{components.length?<div className="componentGrid">{components.map(c=><article key={c.id}><span>{c.component_type}</span><strong>{c.component_name}</strong><p>{c.description||c.notes||'No planner note yet.'}</p><small>{c.material_count} spares · {c.document_count} documents{c.drawing_number?` · Drawing ${c.drawing_number}`:''}</small></article>)}</div>:<div className="emptyState"><p>No explicit component structure has been approved for this equipment yet.</p></div>}</section>}

    <section><div className="sectionHead"><div><h2>Drawings & engineering documents</h2><p>Evidence associated with the selected context.</p></div></div>{documents.length?<div className="knowledgeDocGrid">{documents.slice(0,12).map(d=><article key={d.id}><span>{d.document_type||'Document'}</span><strong>{d.title||d.file_name}</strong><p>{[d.manufacturer,d.discipline,d.material_code].filter(Boolean).join(' · ')||'Equipment reference'}</p>{d.material_code&&<code>{d.material_code}</code>}</article>)}</div>:<div className="emptyState"><p>No plant drawings or manuals are uploaded for this context yet. The built-in maintenance guide remains available above.</p></div>}</section>

    {canEdit&&<section className="simpleKnowledgeUpload"><div><h2>Add drawing or document</h2><p>The selected context is attached automatically. Add a Material Code only when the document clearly supports it.</p></div><div className="knowledgeUploadRow"><label className="simpleFile"><span>{file?file.name:'Choose PDF or text file'}</span><input type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={e=>{const selected=e.target.files?.[0]||null;setFile(selected);if(selected&&!form.title)setForm(x=>({...x,title:selected.name.replace(/\.[^.]+$/,'')}))}}/></label><input placeholder="Title (optional)" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><select value={form.document_type} onChange={e=>setForm({...form,document_type:e.target.value})}>{types.map(x=><option key={x}>{x}</option>)}</select><input className="code" placeholder="Related Material Code (optional)" value={form.material_code} onChange={e=>setForm({...form,material_code:e.target.value.toUpperCase()})}/><button disabled={!file||busy} onClick={upload}>{busy?'Adding…':'Add to Plant Knowledge'}</button></div></section>}
  </>;
}
