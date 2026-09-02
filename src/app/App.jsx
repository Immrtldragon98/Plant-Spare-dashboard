import React,{useEffect,useState} from 'react';
import { request } from '../api/client.js';
import { canEdit as canEditRole, isAdmin } from '../domain/roles.js';
import Login from '../screens/Login.jsx';
import Dashboard from '../screens/Dashboard.jsx';
import Spares from '../screens/Spares.jsx';
import Equipment from '../screens/Equipment.jsx';
import Vendors from '../screens/Vendors.jsx';
import Procurement from '../screens/Procurement.jsx';
import SpareIntelligence from '../screens/SpareIntelligence.jsx';
import Knowledge from '../screens/Knowledge.jsx';
import Imports from '../screens/Imports.jsx';
import Hierarchy from '../screens/Hierarchy.jsx';
import Users from '../screens/Users.jsx';
import Departments from '../screens/Departments.jsx';
import System from '../screens/System.jsx';
import MaterialModal from '../components/MaterialModal.jsx';
import SpareCopilot from '../components/SpareCopilot.jsx';

const navLabel={Dashboard:'Overview',Spares:'Spares',Equipment:'Equipment',Vendors:'Vendors',Procurement:'Procurement','Spare Intelligence':'Intelligence',Knowledge:'Plant Knowledge',Imports:'Imports',Departments:'Departments','SAP Hierarchy':'SAP Hierarchy',Users:'Users',System:'System'};
export default function App(){
 const[user,setUser]=useState(null),[tab,setTab]=useState('Dashboard'),[options,setOptions]=useState({departments:[],areas:[],equipment:[],sub_equipment:[],vendors:[],disciplines:[]}),[stats,setStats]=useState({}),[vendors,setVendors]=useState([]),[users,setUsers]=useState([]),[hierarchy,setHierarchy]=useState([]),[search,setSearch]=useState(''),[filters,setFilters]=useState({department_code:'',area:'',equipment:'',sub_equipment:'',discipline:'',vendor:'',procurement_type:''}),[editing,setEditing]=useState(null),[notice,setNotice]=useState(''),[refreshToken,setRefreshToken]=useState(0);
 useEffect(()=>{if(localStorage.getItem('token'))request('/me').then(setUser).catch(()=>localStorage.removeItem('token'))},[]);
 const reload=async()=>{if(!user)return;const qs=new URLSearchParams({...filters,search});const [s,o]=await Promise.all([request('/dashboard?'+qs),request('/options?'+qs)]);setStats(s);setOptions(o);if(tab==='Vendors')setVendors(await request('/vendors?'+qs));if(tab==='Users'&&isAdmin(user.role))setUsers(await request('/users'));if(tab==='SAP Hierarchy'&&isAdmin(user.role))setHierarchy(await request('/hierarchy?'+new URLSearchParams({department_code:filters.department_code})));setRefreshToken(x=>x+1)};
 useEffect(()=>{if(user&&filters.department_code)reload().catch(e=>setNotice(e.message))},[user,tab,search,JSON.stringify(filters)]);
 useEffect(()=>{if(!user)return;if(!filters.department_code){request('/departments').then(ds=>{setOptions(o=>({...o,departments:ds}));if(ds?.length)setFilters(f=>({...f,department_code:ds[0].department_code}))}).catch(e=>setNotice(e.message));return;}if(options.departments?.length&&!options.departments.some(d=>d.department_code===filters.department_code)){setFilters(f=>({...f,department_code:options.departments[0].department_code}))}},[user,filters.department_code,JSON.stringify(options.departments)]);
 if(!user)return <Login onLogin={setUser}/>;
 const canEdit=canEditRole(user.role),admin=isAdmin(user.role);const tabs=['Dashboard','Spares','Equipment','Vendors','Procurement','Spare Intelligence','Knowledge',...(canEdit?['Imports']:[]),...(admin?['Departments','SAP Hierarchy','Users','System']:[])];
 const selectedDepartment=options.departments?.find(d=>d.department_code===filters.department_code);
 return <div><header className="appHeader"><div className="brandBlock"><span className="brandDot">S</span><div><strong>Plant Spare Intelligence</strong><span>{selectedDepartment?.department_code||filters.department_code} · {selectedDepartment?.department_name||''}</span></div></div><div className="user">{user.name}<small>{user.role}</small><button className="ghost" onClick={()=>{localStorage.removeItem('token');setUser(null)}}>Logout</button></div></header><nav className="appNav">{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{navLabel[x]||x}</button>)}</nav><main>{notice&&<div className="notice" onClick={()=>setNotice('')}>{notice}</div>}{tab==='Dashboard'&&<Dashboard stats={stats} setTab={setTab} department={selectedDepartment} filters={filters} setFilters={setFilters} options={options}/>} {tab==='Spares'&&<Spares {...{options,search,setSearch,filters,setFilters,canEdit,setEditing,reload,setNotice,refreshToken}}/>}{tab==='Equipment'&&<Equipment {...{options,filters,setFilters,setTab,setNotice}}/>} {tab==='Vendors'&&<Vendors vendors={vendors} setFilters={setFilters} setTab={setTab}/>} {tab==='Procurement'&&<Procurement filters={filters} setFilters={setFilters} setNotice={setNotice}/>} {tab==='Spare Intelligence'&&<SpareIntelligence filters={filters} options={options} setNotice={setNotice}/>} {tab==='Knowledge'&&<Knowledge filters={filters} options={options} canEdit={canEdit} setNotice={setNotice}/>} {tab==='Imports'&&canEdit&&<Imports filters={filters} options={options} reload={reload} setNotice={setNotice} refreshToken={refreshToken}/>} {tab==='Departments'&&admin&&<Departments departments={options.departments} reload={reload} setNotice={setNotice}/>} {tab==='SAP Hierarchy'&&admin&&<Hierarchy rows={hierarchy} departments={options.departments} reload={reload} setNotice={setNotice}/>} {tab==='Users'&&admin&&<Users users={users} reload={reload} setNotice={setNotice}/>} {tab==='System'&&admin&&<System setNotice={setNotice}/>}</main><SpareCopilot departmentCode={filters.department_code} tab={tab} filters={filters} setNotice={setNotice}/>{editing&&<MaterialModal material={editing===true?{department_code:filters.department_code,area:filters.area,discipline:filters.discipline}:editing} departments={options.departments} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}} setNotice={setNotice}/>}</div>
}
