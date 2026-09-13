import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    console.log('[Migration] No DATABASE_URL or POSTGRES_URL provided. Skipping migration.');
    return;
  }

  console.log('[Migration] Connecting to PostgreSQL database...');
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('railway.internal') ? false : { rejectUnauthorized: false }
  });

  try {
    const sqlPath = path.join(__dirname, 'migrations', '001_create_proyectos.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      console.log(`[Migration] Executing: ${sqlPath}`);
      await pool.query(sql);
      console.log('[Migration] Database migration executed successfully!');
    } else {
      console.warn('[Migration] Migration SQL file not found at:', sqlPath);
    }
  } catch (err) {
    console.error('[Migration] Error running migration:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
