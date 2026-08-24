import fs from 'fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { q, pool } from './db.js';
dotenv.config();
const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
await q(schema);
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await q(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin') ON CONFLICT(email) DO NOTHING`, [process.env.ADMIN_NAME || 'Admin', process.env.ADMIN_EMAIL.toLowerCase(), hash]);
  console.log('Database initialized; admin ensured.');
} else console.log('Database initialized. Set ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap an admin.');
await pool.end();
