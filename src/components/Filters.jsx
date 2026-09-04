import React from 'react';

const disciplineDefaults=['Mechanical','Electrical','Instrumentation','Operation','Process','Common / Other'];

export default function Filters({options,search,setSearch,filters,setFilters}){
  const change=(key,value)=>{
    const next={...filters,[key]:value};
    if(key==='department_code'){next.area='';next.equipment='';next.sub_equipment=''}
    if(key==='area'){next.equipment='';next.sub_equipment=''}
    setFilters(next);
  };
  const disciplines=[...new Set([...(options.disciplines||[]),...disciplineDefaults])];
  return <div className="filters">
    <input className="search" placeholder="Search Material Code, spare, description or vendor…" value={search} onChange={e=>setSearch(e.target.value)}/>
    <select aria-label="Sub-department" title="Sub-department" value={filters.department_code} onChange={e=>change('department_code',e.target.value)}>
      {(options.departments||[]).map(d=><option value={d.department_code} key={d.department_code}>{d.department_code} — {d.department_name}</option>)}
    </select>
    <select aria-label="Equipment" title="Equipment" value={filters.area} onChange={e=>change('area',e.target.value)}>
      <option value="">All Equipment</option>
      {(options.equipment||[]).map(v=><option value={v} key={v}>{v}</option>)}
    </select>
    <select aria-label="Sub-equipment" title="Sub-equipment" value={filters.sub_equipment} onChange={e=>change('sub_equipment',e.target.value)}>
      <option value="">All Sub-equipment</option>
      {(options.sub_equipment||[]).map(v=><option value={v} key={v}>{v}</option>)}
    </select>
    <select aria-label="Discipline" value={filters.discipline||''} onChange={e=>change('discipline',e.target.value)}><option value="">All Discipline</option>{disciplines.map(v=><option key={v}>{v}</option>)}</select>
    <select aria-label="Vendor" value={filters.vendor||''} onChange={e=>change('vendor',e.target.value)}><option value="">All Vendor</option>{(options.vendors||[]).map(v=><option key={v}>{v}</option>)}</select>
  </div>;
}
