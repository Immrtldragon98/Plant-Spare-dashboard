import React from 'react';
export default function Filters({ options, search, setSearch, filters, setFilters }) {
  const change = (key, value) => {
    const next = { ...filters, [key]: value };
    if (key === 'department_code') { next.area = ''; next.equipment = ''; next.sub_equipment = ''; }
    if (key === 'area') { next.equipment = ''; next.sub_equipment = ''; }
    if (key === 'equipment') next.sub_equipment = '';
    setFilters(next);
  };
  return <div className="filters">
    <input className="search" placeholder="Search code, description, equipment, SAP code, vendor…" value={search} onChange={e=>setSearch(e.target.value)} />
    <select value={filters.department_code} onChange={e=>change('department_code', e.target.value)}>
      {(options.departments || []).map(d => <option value={d.department_code} key={d.department_code}>{d.department_name}</option>)}
    </select>
    {[['area','Area','areas'],['equipment','Equipment','equipment'],['sub_equipment','Sub-equipment','sub_equipment'],['vendor','Vendor','vendors']].map(([k,l,o])=><select key={k} value={filters[k]} onChange={e=>change(k,e.target.value)}><option value="">All {l}</option>{(options[o]||[]).map(v=><option key={v}>{v}</option>)}</select>)}
  </div>;
}
