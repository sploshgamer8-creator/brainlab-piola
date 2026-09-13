import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

/**
 * Inicializa PostgreSQL en Railway si está configurado
 */
export async function initPostgres(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.log('[PostgreSQL] No DATABASE_URL or POSTGRES_URL configured.');
    return;
  }
  console.log('[PostgreSQL] Connecting and verifying tables...');
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('railway.internal') ? false : { rejectUnauthorized: false }
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proyectos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('[PostgreSQL] Table "proyectos" verified and ready on Railway!');
  } catch (err) {
    console.error('[PostgreSQL] Error initializing table:', err);
  } finally {
    await pool.end();
  }
}

let dbInstance: Database | null = null;
const DB_FILE_PATH = path.resolve(process.cwd(), 'local_brain_registry.sqlite');

/**
 * Inicializa la base de datos SQLite en el backend
 */
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.warn('No se pudo cargar el archivo SQLite existente, creando nuevo:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  // Crear tablas si no existen
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active_branch TEXT,
      branches_json TEXT,
      traits_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS packaging_queue (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL, -- pending, packaging, ready, distributed, failed
      artifact_name TEXT,
      size_bytes INTEGER DEFAULT 0,
      download_url TEXT,
      destination_target TEXT, -- 'github_release', 'local_download', 'huggingface_hub', 'peer_mesh'
      created_at TEXT,
      completed_at TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS distribution_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_type TEXT NOT NULL, -- 'github_repo', 'huggingface', 'local_node', 's3_compatible'
      endpoint_url TEXT,
      status TEXT NOT NULL, -- 'active', 'standby', 'offline'
      last_sync TEXT
    );

    CREATE TABLE IF NOT EXISTS git_sync_profiles (
      id TEXT PRIMARY KEY,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      sync_mode TEXT NOT NULL, -- 'checkpoints_only', 'full_weights', 'metadata_bundle'
      last_commit_hash TEXT,
      last_sync_at TEXT,
      status TEXT NOT NULL
    );
  `);

  persistDatabase();
  return dbInstance;
}

/**
 * Guarda el estado binario de la base de datos en disco
 */
export function persistDatabase(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.error('Error al persistir SQLite a disco:', err);
  }
}

/**
 * Exporta el archivo SQLite crudo como Buffer
 */
export function exportSqliteBuffer(): Buffer | null {
  if (!dbInstance) return null;
  const data = dbInstance.export();
  return Buffer.from(data);
}
