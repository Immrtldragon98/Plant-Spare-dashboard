import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { auth, signUser } from '../auth.js';

const r = Router();

r.post('/auth/login', async (req, res) => {
  const { identifier, email, password } = req.body;
  const login = (identifier ?? email ?? '').trim();

  const u = (
    await q(
      `SELECT *
       FROM users
       WHERE active = true
         AND (
           lower(email) = lower($1)
           OR (username IS NOT NULL AND lower(username) = lower($1))
         )
       LIMIT 1`,
      [login]
    )
  ).rows[0];

  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
    return res.status(401).json({ error: 'Invalid username/email or password' });
  }

  res.json({
    token: signUser(u),
    user: {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
    },
  });
});

r.get('/me', auth, (req, res) => res.json(req.user));

export default r;
