import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

let pgPoolInstance: pg.Pool | null = null;

export function getPgPool(): pg.Pool | null {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) return null;
  if (!pgPoolInstance) {
    pgPoolInstance = new pg.Pool({
      connectionString,
      ssl: connectionString.includes('railway.internal') ? false : { rejectUnauthorized: false }
    });
  }
  return pgPoolInstance;
}

/**
 * Inicializa PostgreSQL en Railway si está configurado
 */
export async function initPostgres(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('[PostgreSQL] No DATABASE_URL or POSTGRES_URL configured.');
    return;
  }
  console.log('[PostgreSQL] Connecting and verifying tables on Railway...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proyectos (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS brain_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        current_checkpoint_id TEXT,
        active_branch TEXT DEFAULT 'main',
        branches_json JSONB DEFAULT '["main"]'::jsonb,
        traits_json JSONB,
        multilingual_ratio_json JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS brain_checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        branch TEXT DEFAULT 'main',
        step INTEGER DEFAULT 0,
        loss REAL DEFAULT 0.0,
        total_tokens_trained BIGINT DEFAULT 0,
        config_json JSONB NOT NULL,
        param_count INTEGER DEFAULT 0,
        history_json JSONB,
        traits_json JSONB,
        notes TEXT,
        weights_serialized TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_brain_checkpoints_project ON brain_checkpoints(project_id);
    `);
    console.log('[PostgreSQL] Tables "proyectos", "brain_projects", "brain_checkpoints" verified and ready on Railway!');
    // Create teacher pool jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_pool_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic TEXT NOT NULL,
        count INT NOT NULL,
        model TEXT NOT NULL DEFAULT 'qwen7b',
        status TEXT NOT NULL DEFAULT 'queued',
        samples_json JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

  } catch (err) {
    console.error('[PostgreSQL] Error initializing tables:', err);
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

    CREATE TABLE IF NOT EXISTS brain_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      current_checkpoint_id TEXT,
      active_branch TEXT,
      branches_json TEXT,
      traits_json TEXT,
      multilingual_ratio_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS brain_checkpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      version INTEGER,
      branch TEXT,
      step INTEGER,
      loss REAL,
      total_tokens_trained INTEGER,
      config_json TEXT,
      param_count INTEGER,
      history_json TEXT,
      traits_json TEXT,
      notes TEXT,
      weights_serialized TEXT,
      created_at TEXT
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
