import React, { useState } from 'react';
import { request } from '../api/client.js';

export default function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const x = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      localStorage.setItem('token', x.token);
      onLogin(x.user);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brandmark">SP</div>
        <h1>Spare Materials</h1>
        <p className="muted">Plant spare dashboard</p>

        <label>
          Username or Email
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            placeholder="Enter username or email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {err && <p className="error">{err}</p>}
        <button>Login</button>
      </form>
    </div>
  );
}
