import React, { useState } from 'react';
import { request } from '../api/client.js';

export default function Departments({ departments, reload, setNotice }) {
  const [form, setForm] = useState({
    plant_code: '3102',
    department_code: '',
    department_name: '',
  });

  async function submit(event) {
    event.preventDefault();
    try {
      await request('/departments', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ plant_code: '3102', department_code: '', department_name: '' });
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <h1>Departments</h1>
          <p>Add departments such as Carbon or Logistics. Areas and equipment are then added in SAP Hierarchy.</p>
        </div>
      </div>

      <form className="userForm" onSubmit={submit}>
        <input
          value={form.plant_code}
          onChange={(e) => setForm({ ...form, plant_code: e.target.value })}
          placeholder="Plant code"
        />
        <input
          value={form.department_code}
          onChange={(e) => setForm({ ...form, department_code: e.target.value })}
          placeholder="SAP department code"
          required
        />
        <input
          value={form.department_name}
          onChange={(e) => setForm({ ...form, department_name: e.target.value })}
          placeholder="Department name"
          required
        />
        <button type="submit">Add Department</button>
      </form>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Plant</th>
              <th>Department Code</th>
              <th>Department</th>
              <th>Areas</th>
            </tr>
          </thead>
          <tbody>
            {(departments || []).map((department) => (
              <tr key={department.department_code}>
                <td>{department.plant_code}</td>
                <td className="code">{department.department_code}</td>
                <td>{department.department_name}</td>
                <td>{(department.areas || []).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
