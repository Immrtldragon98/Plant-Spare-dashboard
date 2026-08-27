import React,{useEffect} from 'react';

const disciplineDefaults=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
const cleanParent=v=>['CH2_WRM','WRM','CH2_ICM','ICM','CH2_PFA','PFA','CH2_UTILITY','UTILITY'].includes(String(v||'').toUpperCase())?null:v;

export default function Equipment({materials,options,filters,setFilters,setTab}){
  useEffect(()=>{if(filters.equipment||filters.sub_equipment)setFilters(f=>({...f,equipment:'',sub_equipment:''}))},[]);
  const groups=Object.values(materials.reduce((a,m)=>{
    const child=m.sub_equipment||cleanParent(m.equipment)||'(Area level)';
    const k=child||'(Area level)';
    a[k]??={name:k,count:0,sap:m.sap_location_code,disciplines:new Set(),equipment:m.equipment||'',subEquipment:m.sub_equipment||''};
    a[k].count++;
    if(m.discipline)a[k].disciplines.add(m.discipline);
    if(!a[k].sap&&m.sap_location_code)a[k].sap=m.sap_location_code;
    return a;
  },{})).sort((a,b)=>b.count-a.count);
  const areas=options.areas||[];
  const disciplines=[...new Set([...(options.disciplines||[]),...disciplineDefaults])];
  const choose=(key,value)=>setFilters(f=>({...f,[key]:value,equipment:'',sub_equipment:''}));
  const openGroup=g=>{
    setFilters(f=>({...f,equipment:g.equipment||'',sub_equipment:g.subEquipment||''}));
    setTab('Spares');
  };
  return <>
    <div className="pageTitle"><div><h1>Sub-equipment</h1><p>3102 → {filters.department_code||'3102_CH2'} → {filters.area||'All equipment'} → sub-equipment. Discipline is a filter, not a hierarchy level.</p></div></div>
    <div className="filterSection"><strong>Equipment / Area</strong><div className="chipRow"><button className={!filters.area?'chip activeChip':'chip'} onClick={()=>choose('area','')}>All</button>{areas.map(a=><button key={a} className={filters.area===a?'chip activeChip':'chip'} onClick={()=>choose('area',a)}>{a}</button>)}</div></div>
    <div className="filterSection"><strong>Discipline</strong><div className="chipRow"><button className={!filters.discipline?'chip activeChip':'chip'} onClick={()=>choose('discipline','')}>All</button>{disciplines.map(d=><button key={d} className={filters.discipline===d?'chip activeChip':'chip'} onClick={()=>choose('discipline',d)}>{d}</button>)}</div></div>
    <div className="listCards">{groups.map(g=><button key={g.name} onClick={()=>openGroup(g)}><strong>{g.name}</strong><span>{g.count} spare usages</span>{g.disciplines.size>0&&<small>{[...g.disciplines].join(' · ')}</small>}{g.sap&&<small>{g.sap}</small>}</button>)}</div>
  </>;
}
