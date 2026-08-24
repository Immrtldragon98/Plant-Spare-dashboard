import React,{useEffect} from 'react';

const disciplineDefaults=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];

export default function Equipment({materials,options,filters,setFilters,setTab}){
  useEffect(()=>{if(filters.equipment||filters.sub_equipment)setFilters(f=>({...f,equipment:'',sub_equipment:''}))},[]);
  const groups=Object.values(materials.reduce((a,m)=>{const k=m.equipment||'(Area level)';a[k]??={name:k,count:0,sap:m.sap_location_code,disciplines:new Set()};a[k].count++;if(m.discipline)a[k].disciplines.add(m.discipline);return a},{})).sort((a,b)=>b.count-a.count);
  const areas=options.areas||[];
  const disciplines=[...new Set([...(options.disciplines||[]),...disciplineDefaults])];
  const choose=(key,value)=>setFilters(f=>({...f,[key]:value,equipment:'',sub_equipment:''}));
  return <>
    <div className="pageTitle"><div><h1>Equipment</h1><p>{filters.department_code} → {filters.area||'All Areas'} → equipment. Discipline is a filter, not a hierarchy level.</p></div></div>
    <div className="filterSection"><strong>Area</strong><div className="chipRow"><button className={!filters.area?'chip activeChip':'chip'} onClick={()=>choose('area','')}>All</button>{areas.map(a=><button key={a} className={filters.area===a?'chip activeChip':'chip'} onClick={()=>choose('area',a)}>{a}</button>)}</div></div>
    <div className="filterSection"><strong>Discipline</strong><div className="chipRow"><button className={!filters.discipline?'chip activeChip':'chip'} onClick={()=>choose('discipline','')}>All</button>{disciplines.map(d=><button key={d} className={filters.discipline===d?'chip activeChip':'chip'} onClick={()=>choose('discipline',d)}>{d}</button>)}</div></div>
    <div className="listCards">{groups.map(g=><button key={g.name} onClick={()=>{setFilters(f=>({...f,equipment:g.name==='(Area level)'?'':g.name,sub_equipment:''}));setTab('Spares')}}><strong>{g.name}</strong><span>{g.count} spare usages</span>{g.disciplines.size>0&&<small>{[...g.disciplines].join(' · ')}</small>}{g.sap&&<small>{g.sap}</small>}</button>)}</div>
  </>;
}
