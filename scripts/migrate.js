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
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');
        console.log(`[Migration] Executing: ${file}`);
        await pool.query(sql);
      }
      console.log('[Migration] All database migrations executed successfully!');
    } else {
      console.warn('[Migration] Migrations directory not found at:', migrationsDir);
    }
  } catch (err) {
    console.error('[Migration] Error running migration:', err);
  } finally {
    await pool.end();
  }
}

runMigration();
