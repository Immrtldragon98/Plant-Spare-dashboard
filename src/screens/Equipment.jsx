import React,{useEffect,useState} from 'react';
import {request} from '../api/client.js';

const disciplineDefaults=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
const cleanParent=v=>['CH2_WRM','WRM','CH2_ICM','ICM','CH2_PFA','PFA','CH2_UTILITY','UTILITY'].includes(String(v||'').toUpperCase())?null:v;

export default function Equipment({options,filters,setFilters,setTab,setNotice}){
  const[groups,setGroups]=useState([]),[loading,setLoading]=useState(false);
  useEffect(()=>{if(!filters.department_code)return;const qs=new URLSearchParams({department_code:filters.department_code,area:filters.area||'',equipment:'',discipline:filters.discipline||''});setLoading(true);request('/equipment/summary?'+qs).then(rows=>setGroups((rows||[]).map(r=>({name:r.sub_equipment||cleanParent(r.equipment)||'(Equipment level)',count:Number(r.usage_count||0),sap:r.sap_location_code,disciplines:new Set(String(r.disciplines||'').split(' · ').filter(Boolean)),equipment:filters.area||cleanParent(r.equipment)||'',subEquipment:r.sub_equipment||''})))).catch(e=>setNotice?.(e.message)).finally(()=>setLoading(false))},[filters.department_code,filters.area,filters.discipline]);
  const equipment=(options.equipment_hierarchy||[]).map(item=>({name:item.name,code:item.code}));
  const disciplines=[...new Set([...(options.disciplines||[]),...disciplineDefaults])];
  const chooseEquipment=value=>setFilters(f=>({...f,area:value,equipment:'',sub_equipment:''}));
  const chooseDiscipline=value=>setFilters(f=>({...f,discipline:value}));
  const openGroup=g=>{setFilters(f=>({...f,area:g.equipment||f.area||'',equipment:'',sub_equipment:g.subEquipment||''}));setTab('Spares')};
  return <>
    <div className="pageTitle"><div><span className="eyebrow">EQUIPMENT COVERAGE</span><h1>Sub-equipment</h1><p>Database-aggregated spare usage by equipment. Open a card to filter the Spares catalogue.</p></div><div className="pageMeta"><strong>{groups.reduce((n,g)=>n+g.count,0)}</strong><span>visible spare usages</span></div></div>
    <div className="equipmentToolbar"><div><span>Equipment</span><div className="segmented"><button className={!filters.area?'active':''} onClick={()=>chooseEquipment('')}>All</button>{equipment.map(e=><button key={e.code||e.name} className={filters.area===e.name?'active':''} onClick={()=>chooseEquipment(e.name)}>{e.name}</button>)}</div></div><div><span>Discipline</span><div className="segmented"><button className={!filters.discipline?'active':''} onClick={()=>chooseDiscipline('')}>All</button>{disciplines.map(d=><button key={d} className={filters.discipline===d?'active':''} onClick={()=>chooseDiscipline(d)}>{d}</button>)}</div></div></div>
    {loading?<div className="emptyState"><h3>Loading equipment summary…</h3><p>Reading aggregated usage counts from the database.</p></div>:groups.length?<div className="equipmentGrid">{groups.map(g=><button className="equipmentCard" key={`${g.equipment}-${g.subEquipment||g.name}`} onClick={()=>openGroup(g)}><div><span>{g.equipment||'Equipment'}</span><strong>{g.name}</strong></div><strong className="equipmentCount">{g.count}</strong><small>spare usages</small>{g.disciplines.size>0&&<p>{[...g.disciplines].join(' · ')}</p>}{g.sap&&<code>{g.sap}</code>}</button>)}</div>:<div className="emptyState"><h3>No sub-equipment found</h3><p>Try changing Equipment or Discipline filters.</p></div>}
  </>;
}
