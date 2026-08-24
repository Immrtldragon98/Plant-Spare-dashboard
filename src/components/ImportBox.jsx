import React,{useState} from 'react';
import { request } from '../api/client.js';

const disciplines=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];

export default function ImportBox({title,text,preview,confirm,departmentCode,area,showDiscipline=false,requireArea=false,reload,setNotice}){
  const[file,setFile]=useState(null),[data,setData]=useState(null),[busy,setBusy]=useState(false),[discipline,setDiscipline]=useState('');
  const send=async(url)=>{
    if(!file)return;
    if(!departmentCode){setNotice('Select a Department before importing');return}
    if(requireArea&&!area){setNotice('Select an Area / Sub-area before importing the spare master');return}
    setBusy(true);
    try{
      const f=new FormData();f.append('file',file);f.append('department_code',departmentCode);if(area)f.append('area',area);if(showDiscipline&&discipline)f.append('discipline',discipline);
      const x=await request(url,{method:'POST',body:f});setData(x);
      if(url===confirm){setNotice(`${title}: ${x.updated||0} updated, ${x.added||0} added, ${x.skipped||0} skipped`);await reload();}
    }catch(e){setNotice(e.message)}finally{setBusy(false)}
  };
  return <div className="importBox">
    <h2>{title}</h2><p>{text}</p>
    <div className="importDestination"><span>Destination</span><strong>{departmentCode||'No department'}{area?` → ${area}`:''}</strong></div>
    {showDiscipline&&<label>Default discipline<select value={discipline} onChange={e=>setDiscipline(e.target.value)}><option value="">Use Excel value / leave blank</option>{disciplines.map(d=><option key={d}>{d}</option>)}</select></label>}
    <input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files[0]);setData(null)}}/>
    <div><button disabled={!file||busy||!departmentCode||(requireArea&&!area)} onClick={()=>send(preview)}>Preview</button>{data&&<button disabled={busy} onClick={()=>send(confirm)}>Confirm Import</button>}</div>
    {data&&<div className="preview"><strong>{data.totalRows??data.total??0} rows found</strong>{data.disciplineCounts&&<span>Discipline: {Object.entries(data.disciplineCounts).map(([k,v])=>`${k} ${v}`).join(' · ')}</span>}{data.unmappedLocations?.length>0&&<span>⚠ {data.unmappedLocations.length} locations need SAP mapping</span>}{data.outsideDepartment?.length>0&&<span>⚠ {data.outsideDepartment.length} rows outside selected department</span>}{data.issues?.length>0&&<span>⚠ {data.issues.length} import issues</span>}<small>{data.message}</small></div>}
  </div>;
}
