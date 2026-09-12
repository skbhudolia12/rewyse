/**
 * Applies pending SQL migrations from supabase/migrations in filename order.
 *
 *   npm run db:migrate            apply pending
 *   npm run db:migrate -- --status  show state without changing anything
 *
 * Each migration runs inside a transaction, so a failure part-way leaves the
 * database exactly as it was rather than half-migrated. Applied files are
 * recorded with a checksum: if a migration that already ran is later edited,
 * this refuses to continue instead of silently drifting from what is deployed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

function loadEnv(file = '.env.local') {
  const env = {};
  const raw = readFileSync(file, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error('\nDATABASE_URL missing from .env.local.\n');
  process.exit(1);
}

const statusOnly = process.argv.includes('--status');
const checksum = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  console.error(`\nCannot connect: ${err.message}`);
  console.error('Check DATABASE_URL, and that you are using the session pooler (port 5432).\n');
  process.exit(1);
}

await client.query(`
  create table if not exists schema_migrations (
    filename    text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  );
`);

const { rows: appliedRows } = await client.query(
  'select filename, checksum from schema_migrations',
);
const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log('\nMigrations\n');

let drift = false;
const pending = [];
for (const file of files) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const sum = checksum(sql);
  const prior = applied.get(file);
  if (!prior) {
    pending.push({ file, sql, sum });
    console.log(`  pending   ${file}`);
  } else if (prior !== sum) {
    drift = true;
    console.log(`  \x1b[31mCHANGED\x1b[0m   ${file}  (applied as ${prior}, now ${sum})`);
  } else {
    console.log(`  applied   ${file}`);
  }
}

if (drift) {
  console.error(
    '\nA migration that already ran has been edited. Applied migrations are' +
      '\nimmutable -- add a new migration that alters the schema forward instead.\n',
  );
  await client.end();
  process.exit(1);
}

if (statusOnly) {
  console.log(`\n${pending.length} pending.\n`);
  await client.end();
  process.exit(0);
}

if (pending.length === 0) {
  console.log('\nNothing to apply.\n');
  await client.end();
  process.exit(0);
}

console.log('');
for (const { file, sql, sum } of pending) {
  process.stdout.write(`  applying ${file} ... `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (filename, checksum) values ($1, $2)', [
      file,
      sum,
    ]);
    await client.query('commit');
    console.log('\x1b[32mok\x1b[0m');
  } catch (err) {
    await client.query('rollback');
    console.log('\x1b[31mfailed\x1b[0m');
    console.error(`\n  ${err.message}`);
    if (err.position) {
      const upto = sql.slice(0, Number(err.position));
      console.error(`  at line ${upto.split('\n').length}`);
    }
    console.error('\nRolled back. Database is unchanged by this migration.\n');
    await client.end();
    process.exit(1);
  }
}

console.log('\nAll migrations applied.\n');
await client.end();
