import React,{useEffect,useState} from 'react';
import { request } from '../api/client.js';
import { canEdit as canEditRole, isAdmin } from '../domain/roles.js';
import Login from '../screens/Login.jsx';
import Dashboard from '../screens/Dashboard.jsx';
import Spares from '../screens/Spares.jsx';
import Equipment from '../screens/Equipment.jsx';
import Vendors from '../screens/Vendors.jsx';
import Imports from '../screens/Imports.jsx';
import Hierarchy from '../screens/Hierarchy.jsx';
import Users from '../screens/Users.jsx';
import Departments from '../screens/Departments.jsx';
import MaterialModal from '../components/MaterialModal.jsx';

export default function App(){
 const[user,setUser]=useState(null),[tab,setTab]=useState('Dashboard'),[materials,setMaterials]=useState([]),[options,setOptions]=useState({departments:[],areas:[],equipment:[],sub_equipment:[],vendors:[]}),[stats,setStats]=useState({}),[vendors,setVendors]=useState([]),[history,setHistory]=useState([]),[users,setUsers]=useState([]),[hierarchy,setHierarchy]=useState([]),[search,setSearch]=useState(''),[filters,setFilters]=useState({department_code:'',area:'',equipment:'',sub_equipment:'',vendor:''}),[editing,setEditing]=useState(null),[notice,setNotice]=useState('');
 useEffect(()=>{if(localStorage.getItem('token'))request('/me').then(setUser).catch(()=>localStorage.removeItem('token'))},[]);
 const reload=async()=>{if(!user)return;const qs=new URLSearchParams({...filters,search});const [s,o,m]=await Promise.all([request('/dashboard?'+qs),request('/options?'+qs),request('/materials?'+qs)]);setStats(s);setOptions(o);setMaterials(m);if(tab==='Vendors')setVendors(await request('/vendors?'+qs));if(tab==='Imports'&&user.role!=='viewer')setHistory(await request('/import-history'));if(tab==='Users'&&isAdmin(user.role))setUsers(await request('/users'));if(tab==='SAP Hierarchy'&&isAdmin(user.role))setHierarchy(await request('/hierarchy?'+new URLSearchParams({department_code:filters.department_code})))};
 useEffect(()=>{if(user&&filters.department_code)reload().catch(e=>setNotice(e.message))},[user,tab,search,JSON.stringify(filters)]);
 useEffect(()=>{if(!user)return;if(!filters.department_code){request('/departments').then(ds=>{setOptions(o=>({...o,departments:ds}));if(ds?.length)setFilters(f=>({...f,department_code:ds[0].department_code}))}).catch(e=>setNotice(e.message));return;}if(options.departments?.length&&!options.departments.some(d=>d.department_code===filters.department_code)){setFilters(f=>({...f,department_code:options.departments[0].department_code}))}},[user,filters.department_code,JSON.stringify(options.departments)]);
 if(!user)return <Login onLogin={setUser}/>;
 const canEdit=canEditRole(user.role), admin=isAdmin(user.role);const tabs=['Dashboard','Spares','Equipment','Vendors',...(canEdit?['Imports']:[]),...(admin?['Departments','SAP Hierarchy','Users']:[])];
 const selectedDepartment=options.departments?.find(d=>d.department_code===filters.department_code);
 return <div><header><div><strong>SPARE MATERIALS</strong><span>Plant {selectedDepartment?.plant_code||'—'} · {selectedDepartment?.department_name||filters.department_code}</span></div><div className="user">{user.name}<small>{user.role}</small><button className="ghost" onClick={()=>{localStorage.removeItem('token');setUser(null)}}>Logout</button></div></header><nav>{tabs.map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x}</button>)}</nav><main>{notice&&<div className="notice" onClick={()=>setNotice('')}>{notice}</div>}{tab==='Dashboard'&&<Dashboard stats={stats} setTab={setTab} department={selectedDepartment}/>} {tab==='Spares'&&<Spares {...{materials,options,search,setSearch,filters,setFilters,canEdit,setEditing,reload,setNotice}}/>}{tab==='Equipment'&&<Equipment materials={materials} setFilters={setFilters} setTab={setTab}/>} {tab==='Vendors'&&<Vendors vendors={vendors} setFilters={setFilters} setTab={setTab}/>} {tab==='Imports'&&canEdit&&<Imports history={history} filters={filters} reload={reload} setNotice={setNotice}/>} {tab==='Departments'&&admin&&<Departments departments={options.departments} reload={reload} setNotice={setNotice}/>} {tab==='SAP Hierarchy'&&admin&&<Hierarchy rows={hierarchy} departments={options.departments} reload={reload} setNotice={setNotice}/>} {tab==='Users'&&admin&&<Users users={users} reload={reload} setNotice={setNotice}/>}</main>{editing&&<MaterialModal material={editing===true?{department_code:filters.department_code,area:filters.area}:editing} departments={options.departments} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}} setNotice={setNotice}/>}</div>
}
