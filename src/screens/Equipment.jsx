import React,{useEffect,useState} from 'react';
import {request} from '../api/client.js';

const disciplineDefaults=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
const cleanParent=v=>['CH2_WRM','WRM','CH2_ICM','ICM','CH2_PFA','PFA','CH2_UTILITY','UTILITY'].includes(String(v||'').toUpperCase())?null:v;

export default function Equipment({options,filters,setFilters,setTab,setNotice}){
  const[groups,setGroups]=useState([]),[loading,setLoading]=useState(false);
  useEffect(()=>{if(!filters.department_code)return;const qs=new URLSearchParams({department_code:filters.department_code,area:filters.area||'',equipment:filters.equipment||'',discipline:filters.discipline||''});setLoading(true);request('/equipment/summary?'+qs).then(rows=>setGroups((rows||[]).map(r=>({name:r.sub_equipment||cleanParent(r.equipment)||'(Equipment level)',count:Number(r.usage_count||0),sap:r.sap_location_code,disciplines:new Set(String(r.disciplines||'').split(' · ').filter(Boolean)),equipment:r.equipment||'',subEquipment:r.sub_equipment||''})))).catch(e=>setNotice?.(e.message)).finally(()=>setLoading(false))},[filters.department_code,filters.area,filters.equipment,filters.discipline]);
  const equipment=options.equipment_hierarchy?.length?options.equipment_hierarchy:(options.equipment||[]).map(name=>({name,code:''}));
  const disciplines=[...new Set([...(options.disciplines||[]),...disciplineDefaults])];
  const chooseEquipment=value=>setFilters(f=>({...f,area:'',equipment:value,sub_equipment:''}));
  const chooseDiscipline=value=>setFilters(f=>({...f,discipline:value}));
  const openGroup=g=>{setFilters(f=>({...f,equipment:g.equipment||f.equipment||'',sub_equipment:g.subEquipment||''}));setTab('Spares')};
  return <>
    <div className="pageTitle"><div><h1>Sub-equipment</h1><p>Aggregated directly in the database — no full spare catalogue download required.</p></div></div>
    <div className="filterSection"><strong>Equipment</strong><div className="chipRow"><button className={!filters.equipment?'chip activeChip':'chip'} onClick={()=>chooseEquipment('')}>All</button>{equipment.map(e=><button key={e.code||e.name} title={e.code||e.name} className={filters.equipment===e.name?'chip activeChip':'chip'} onClick={()=>chooseEquipment(e.name)}>{e.name}</button>)}</div></div>
    <div className="filterSection"><strong>Discipline</strong><div className="chipRow"><button className={!filters.discipline?'chip activeChip':'chip'} onClick={()=>chooseDiscipline('')}>All</button>{disciplines.map(d=><button key={d} className={filters.discipline===d?'chip activeChip':'chip'} onClick={()=>chooseDiscipline(d)}>{d}</button>)}</div></div>
    {loading?<p className="muted">Loading equipment summary…</p>:<div className="listCards">{groups.map(g=><button key={`${g.equipment}-${g.subEquipment||g.name}`} onClick={()=>openGroup(g)}><strong>{g.name}</strong><span>{g.count} spare usages</span>{g.disciplines.size>0&&<small>{[...g.disciplines].join(' · ')}</small>}{g.sap&&<small>{g.sap}</small>}</button>)}</div>}
  </>;
}
