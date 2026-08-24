import React, { useState } from 'react';
import { request } from '../api/client.js';

export default function Users({ users, reload, setNotice }) {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'viewer' });

  async function createUser(event) {
    event.preventDefault();
    try {
      await request('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', username: '', email: '', password: '', role: 'viewer' });
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function updateUser(id, patch) {
    try {
      await request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <>
      <div className="pageTitle">
        <div>
          <h1>Users</h1>
          <p>Admin can create users, set usernames, change roles, and disable access.</p>
        </div>
      </div>

      <form className="userForm" onSubmit={createUser}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="viewer">viewer</option>
          <option value="planner">planner</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit">Add User</button>
      </form>

      <div className="tableWrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(users || []).map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>
                  <input
                    value={user.username || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      user.username = value;
                    }}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== (user.username_original || user.username)) updateUser(user.id, { username: next });
                    }}
                  />
                </td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                    <option value="viewer">viewer</option>
                    <option value="planner">planner</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <button className="secondary" type="button" onClick={() => updateUser(user.id, { active: !user.active })}>
                    {user.active ? 'Active' : 'Disabled'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
