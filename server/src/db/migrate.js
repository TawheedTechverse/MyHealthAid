import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DROP_SQL = `
  DROP TABLE IF EXISTS tasks CASCADE;
  DROP TABLE IF EXISTS treatment_plans CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
`;

async function main() {
  const drop = process.argv.includes('--drop');
  try {
    if (drop) {
      console.log('Dropping existing tables...');
      await pool.query(DROP_SQL);
    }
    const schema = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
