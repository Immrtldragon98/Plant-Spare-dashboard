import React from 'react';
const Card=({n,t,onClick})=><div className="card" role={onClick?'button':undefined} tabIndex={onClick?0:undefined} onClick={onClick} onKeyDown={e=>{if(onClick&&(e.key==='Enter'||e.key===' '))onClick()}} style={onClick?{cursor:'pointer'}:undefined}><strong>{n??0}</strong><span>{t}</span></div>;
const disciplines=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];
export default function Dashboard({stats,setTab,department,filters,setFilters,options}){
  const setEquipment=value=>setFilters(f=>({...f,area:'',equipment:value,sub_equipment:''}));
  const setDiscipline=value=>setFilters(f=>({...f,discipline:value}));
  const openProcurement=type=>{setFilters(f=>({...f,procurement_type:type}));setTab('Procurement')};
  const equipment=options.equipment_hierarchy?.length?options.equipment_hierarchy:(options.equipment||[]).map(name=>({name,code:''}));
  return <>
    <div className="pageTitle"><div><h1>{department?.department_code||''} — {department?.department_name||'Dashboard'}</h1><p>Spare status for Cast House 2. Equipment is sourced from SAP Hierarchy; Discipline remains a separate filter.</p></div></div>
    <div className="filterSection"><strong>Equipment</strong><div className="chipRow"><button className={!filters.equipment?'chip activeChip':'chip'} onClick={()=>setEquipment('')}>All</button>{equipment.map(e=><button key={e.code||e.name} title={e.code||e.name} className={filters.equipment===e.name?'chip activeChip':'chip'} onClick={()=>setEquipment(e.name)}>{e.name}</button>)}</div></div>
    <div className="filterSection"><strong>Discipline</strong><div className="chipRow"><button className={!filters.discipline?'chip activeChip':'chip'} onClick={()=>setDiscipline('')}>All</button>{disciplines.map(d=><button key={d} className={filters.discipline===d?'chip activeChip':'chip'} onClick={()=>setDiscipline(d)}>{d}</button>)}</div></div>
    <div className="cards"><Card n={stats.total} t="Unique Materials"/><Card n={stats.available} t="Available in Store"/><Card n={stats.in_pr} t="In PR" onClick={()=>openProcurement('pr')}/><Card n={stats.in_po} t="In PO" onClick={()=>openProcurement('po')}/><Card n={stats.critical} t="Critical Spares" onClick={()=>setTab('Spare Intelligence')}/><Card n={stats.pr_eligible} t="PR Eligible" onClick={()=>setTab('Spare Intelligence')}/></div>
    <section><h2>Quick access</h2><div className="quick"><button onClick={()=>setTab('Spares')}>Search spare materials</button><button onClick={()=>setTab('Equipment')}>Browse sub-equipment</button><button onClick={()=>setTab('Vendors')}>Browse vendors</button><button onClick={()=>setTab('Spare Intelligence')}>Spare Intelligence</button><button onClick={()=>openProcurement('pr')}>Open PR</button><button onClick={()=>openProcurement('rgp')}>RGP</button><button onClick={()=>openProcurement('nrgp')}>NRGP</button></div></section>
  </>;
}
