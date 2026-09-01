import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import dotenv from 'dotenv';
import {q,pool} from './db.js';

dotenv.config();
const here=path.dirname(fileURLToPath(import.meta.url));
const dir=path.join(here,'migrations');

await q('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
const applied=new Set((await q('SELECT version FROM schema_migrations')).rows.map(x=>x.version));
const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>/^\d+_.+\.sql$/.test(x)).sort():[];

for(const file of files){
  const version=file.replace(/\.sql$/,'');
  if(applied.has(version)){console.log(`skip ${version}`);continue}
  console.log(`apply ${version}`);
  const sql=fs.readFileSync(path.join(dir,file),'utf8');
  await q(sql);
  await q('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
  console.log(`done ${version}`);
}

console.log(`Migrations complete (${files.length} discovered).`);
await pool.end();
