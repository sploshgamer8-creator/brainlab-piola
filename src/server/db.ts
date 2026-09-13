import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

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
