import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { auth, allow } from '../auth.js';

const r = Router();

r.get('/users', auth, allow('admin'), async (req, res) => {
  res.json((await q('SELECT id,name,username,email,role,active,created_at FROM users ORDER BY name')).rows);
});

r.post('/users', auth, allow('admin'), async (req, res) => {
  const { name, username, email, password, role } = req.body;
  if (!name || !username || !email || !password) return res.status(400).json({ error: 'Name, username, email and password are required' });
  if (!['viewer', 'planner', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanUsername) return res.status(400).json({ error: 'Username is required' });

  const exists = await q(
    'SELECT 1 FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($2) LIMIT 1',
    [cleanUsername, cleanEmail]
  );
  if (exists.rowCount) return res.status(409).json({ error: 'Username or email already exists' });

  const hash = await bcrypt.hash(password, 12);
  res.json((await q(
    `INSERT INTO users(name,username,email,password_hash,role)
     VALUES($1,$2,$3,$4,$5)
     RETURNING id,name,username,email,role,active`,
    [name.trim(), cleanUsername, cleanEmail, hash, role]
  )).rows[0]);
});

r.patch('/users/:id', auth, allow('admin'), async (req, res) => {
  const { username, role, active } = req.body;
  if (role != null && !['viewer', 'planner', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  if (username != null) {
    const cleanUsername = String(username).trim();
    if (!cleanUsername) return res.status(400).json({ error: 'Username cannot be blank' });
    const exists = await q('SELECT 1 FROM users WHERE lower(username)=lower($1) AND id<>$2 LIMIT 1', [cleanUsername, req.params.id]);
    if (exists.rowCount) return res.status(409).json({ error: 'Username already exists' });
  }

  res.json((await q(
    `UPDATE users
     SET username=COALESCE($1,username), role=COALESCE($2,role), active=COALESCE($3,active)
     WHERE id=$4
     RETURNING id,name,username,email,role,active`,
    [username?.trim() ?? null, role ?? null, active ?? null, req.params.id]
  )).rows[0]);
});

export default r;
