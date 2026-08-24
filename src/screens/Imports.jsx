import React from 'react';
import ImportBox from '../components/ImportBox.jsx';

export default function Imports({history,filters,reload,setNotice}){
  return <>
    <div className="pageTitle"><div><h1>Excel & SAP Updates</h1><p>Selected scope: {filters.department_code} → {filters.area||'choose an area'}. Always Preview before Confirm.</p></div></div>
    <div className="importGrid">
      <ImportBox title="Full Spare Master" text="Imports Material Code, Spare Name, Description, Area, Equipment, Sub-equipment, Discipline, Required Qty, Vendor and other master fields. Sheet names can identify equipment." preview="/import/master/preview" confirm="/import/master/confirm" departmentCode={filters.department_code} area={filters.area} showDiscipline reload={reload} setNotice={setNotice}/>
      <ImportBox title="SAP Status Update" text="Matches by Material Code. Updates Store, PR, PO and Vendor only when those cells are supplied; blank cells keep the current database value." preview="/import/sap/preview" confirm="/import/sap/confirm" departmentCode={filters.department_code} reload={reload} setNotice={setNotice}/>
    </div>
    <section><h2>Import history</h2><div className="tableWrap"><table><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Total</th><th>Added</th><th>Updated</th><th>Skipped</th><th>By</th></tr></thead><tbody>{history.map(h=><tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{h.import_type}</td><td>{h.file_name}</td><td>{h.total_rows}</td><td>{h.added_rows}</td><td>{h.updated_rows}</td><td>{h.skipped_rows}</td><td>{h.imported_by_name||'—'}</td></tr>)}</tbody></table></div></section>
  </>;
}
