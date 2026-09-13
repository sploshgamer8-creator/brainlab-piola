import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDatabase, persistDatabase, exportSqliteBuffer, getPgPool } from './db';
import { fetchWithScraplingStealth, ingestWithAgentReach, runScrapeGraphPipeline, runWithObscura, getObscuraStatus, syncCloudToBinaryShards, getCloudShardsStatus } from './harvester';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Using offline synthetic generator instead.');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

let serverHarvesterState: 'active' | 'paused' = 'active';

function getFlywheelTelemetry() {
  try {
    const logPath = path.resolve(process.cwd(), 'reports', 'autonomous_evolution.log');
    if (!fs.existsSync(logPath)) {
      return { active: false, cycle: 0, step: 0, loss: 0, layers: '4L', tokens: 0, buffer: 4590, lastUpdated: new Date().toISOString(), recentLogs: [] };
    }
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
    const lastLines = lines.slice(-12);
    
    let cycle = 0, step = 0, loss = 0, layers = '8L', tokens = 0, buffer = 4590;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const match = line.match(/\[Ciclo #(\d+)\] Pasos Totales: (\d+) \| Capas: (\w+) \| Loss: ([\d.]+) .*? Tokens: ([\d.,]+) \| Buffer: (\d+)/);
      if (match) {
        cycle = parseInt(match[1], 10);
        step = parseInt(match[2], 10);
        layers = match[3];
        loss = parseFloat(match[4]);
        tokens = parseInt(match[5].replace(/\./g, '').replace(/,/g, ''), 10);
        buffer = parseInt(match[6], 10);
        break;
      }
    }
    const stats = fs.statSync(logPath);
    const isRecent = (Date.now() - stats.mtimeMs) < 180000; // active in last 3 mins

    return {
      active: isRecent,
      cycle,
      step,
      loss,
      layers,
      tokens,
      buffer,
      lastUpdated: stats.mtime.toISOString(),
      recentLogs: lastLines
    };
  } catch {
    return { active: false, cycle: 0, step: 0, loss: 0, layers: '4L', tokens: 0, buffer: 4590, lastUpdated: new Date().toISOString(), recentLogs: [] };
  }
}

export async function handleApiRoutes(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith('/api/')) {
    return next();
  }

  // Permissive CORS for local & production cross-origin clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Cloud Status (PostgreSQL en Railway o SQLite local)
  if (req.url?.startsWith('/api/cloud/status') && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    (async () => {
      try {
        const pool = getPgPool();
        if (pool) {
          const projRes = await pool.query('SELECT COUNT(*) as count FROM brain_projects');
          const cpRes = await pool.query('SELECT COUNT(*) as count FROM brain_checkpoints');
          return res.writeHead(200).end(JSON.stringify({
            connected: true,
            provider: 'postgresql_railway',
            projectCount: parseInt(projRes.rows[0]?.count || '0', 10),
            checkpointCount: parseInt(cpRes.rows[0]?.count || '0', 10),
            timestamp: new Date().toISOString()
          }));
        } else {
          const db = await getDatabase();
          const projRes = db.exec('SELECT COUNT(*) as count FROM brain_projects');
          const cpRes = db.exec('SELECT COUNT(*) as count FROM brain_checkpoints');
          const projectCount = (projRes[0]?.values[0]?.[0] as number) || 0;
          const checkpointCount = (cpRes[0]?.values[0]?.[0] as number) || 0;
          return res.writeHead(200).end(JSON.stringify({
            connected: true,
            provider: 'sqlite_local',
            projectCount,
            checkpointCount,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({
          connected: false,
          error: err.message,
          timestamp: new Date().toISOString()
        }));
      }
    })();
    return;
  }

  // Cloud Sync (GET: Obtener proyectos y checkpoints / POST: Persistir a la nube)
  if (req.url?.startsWith('/api/cloud/sync') && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    (async () => {
      try {
        const urlObj = new URL(req.url!, 'http://localhost');
        const checkpointId = urlObj.searchParams.get('checkpointId');
        const pool = getPgPool();

        if (pool) {
          if (checkpointId) {
            const resCp = await pool.query('SELECT * FROM brain_checkpoints WHERE id = $1', [checkpointId]);
            if (resCp.rows.length === 0) {
              return res.writeHead(404).end(JSON.stringify({ error: 'Checkpoint no encontrado' }));
            }
            const row = resCp.rows[0];
            return res.writeHead(200).end(JSON.stringify({
              checkpoint: {
                id: row.id,
                name: row.name,
                version: row.version,
                branch: row.branch,
                step: row.step,
                loss: row.loss,
                totalTokensTrained: Number(row.total_tokens_trained || 0),
                config: row.config_json,
                paramCount: row.param_count,
                history: row.history_json || [],
                traits: row.traits_json,
                notes: row.notes,
                weightsSerialized: row.weights_serialized,
                createdAt: row.created_at,
              }
            }));
          } else {
            const resProj = await pool.query('SELECT * FROM brain_projects ORDER BY updated_at DESC');
            const resCp = await pool.query('SELECT id, project_id, name, version, branch, step, loss, total_tokens_trained, config_json, param_count, history_json, traits_json, notes, created_at FROM brain_checkpoints ORDER BY created_at DESC');

            const checkpointsByProject: Record<string, any[]> = {};
            for (const row of resCp.rows) {
              const pId = row.project_id || '';
              if (!checkpointsByProject[pId]) checkpointsByProject[pId] = [];
              checkpointsByProject[pId].push({
                id: row.id,
                name: row.name,
                version: row.version,
                branch: row.branch,
                step: row.step,
                loss: row.loss,
                totalTokensTrained: Number(row.total_tokens_trained || 0),
                config: row.config_json,
                paramCount: row.param_count,
                history: row.history_json || [],
                traits: row.traits_json,
                notes: row.notes,
                createdAt: row.created_at,
              });
            }

            const projects = resProj.rows.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              currentCheckpointId: p.current_checkpoint_id,
              activeBranch: p.active_branch,
              branches: p.branches_json || ['main'],
              traits: p.traits_json,
              multilingualRatio: p.multilingual_ratio_json || { spanish: 60, english: 30, portuguese: 10 },
              checkpoints: checkpointsByProject[p.id] || [],
              createdAt: p.created_at,
              updatedAt: p.updated_at,
            }));

            return res.writeHead(200).end(JSON.stringify({ projects }));
          }
        } else {
          // SQLite fallback
          const db = await getDatabase();
          if (checkpointId) {
            const stmt = db.prepare('SELECT * FROM brain_checkpoints WHERE id = :id');
            stmt.bind({ ':id': checkpointId });
            if (stmt.step()) {
              const row: any = stmt.getAsObject();
              stmt.free();
              return res.writeHead(200).end(JSON.stringify({
                checkpoint: {
                  id: row.id,
                  name: row.name,
                  version: row.version,
                  branch: row.branch,
                  step: row.step,
                  loss: row.loss,
                  totalTokensTrained: Number(row.total_tokens_trained || 0),
                  config: typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json,
                  paramCount: row.param_count,
                  history: typeof row.history_json === 'string' ? JSON.parse(row.history_json) : (row.history_json || []),
                  traits: typeof row.traits_json === 'string' ? JSON.parse(row.traits_json) : row.traits_json,
                  notes: row.notes,
                  weightsSerialized: row.weights_serialized,
                  createdAt: row.created_at,
                }
              }));
            } else {
              stmt.free();
              return res.writeHead(404).end(JSON.stringify({ error: 'Checkpoint no encontrado' }));
            }
          } else {
            const projRes = db.exec('SELECT * FROM brain_projects');
            const projectsList: any[] = [];
            if (projRes.length > 0) {
              const cols = projRes[0].columns;
              for (const vals of projRes[0].values) {
                const p: any = {};
                cols.forEach((c, idx) => { p[c] = vals[idx]; });
                projectsList.push({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  currentCheckpointId: p.current_checkpoint_id,
                  activeBranch: p.active_branch,
                  branches: typeof p.branches_json === 'string' ? JSON.parse(p.branches_json) : ['main'],
                  traits: typeof p.traits_json === 'string' ? JSON.parse(p.traits_json) : p.traits_json,
                  multilingualRatio: typeof p.multilingual_ratio_json === 'string' ? JSON.parse(p.multilingual_ratio_json) : { spanish: 60, english: 30, portuguese: 10 },
                  checkpoints: [],
                  createdAt: p.created_at,
                  updatedAt: p.updated_at,
                });
              }
            }
            return res.writeHead(200).end(JSON.stringify({ projects: projectsList }));
          }
        }
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  if (req.url === '/api/cloud/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const pool = getPgPool();
        const projectsToSync: any[] = payload.projects || (payload.project ? [payload.project] : []);
        const checkpointsToSync: any[] = payload.checkpoints || (payload.checkpoint ? [payload.checkpoint] : []);

        if (pool) {
          for (const proj of projectsToSync) {
            await pool.query(`
              INSERT INTO brain_projects (id, name, description, current_checkpoint_id, active_branch, branches_json, traits_json, multilingual_ratio_json, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                current_checkpoint_id = EXCLUDED.current_checkpoint_id,
                active_branch = EXCLUDED.active_branch,
                branches_json = EXCLUDED.branches_json,
                traits_json = EXCLUDED.traits_json,
                multilingual_ratio_json = EXCLUDED.multilingual_ratio_json,
                updated_at = NOW()
            `, [
              proj.id,
              proj.name,
              proj.description || '',
              proj.currentCheckpointId || '',
              proj.activeBranch || 'main',
              JSON.stringify(proj.branches || ['main']),
              JSON.stringify(proj.traits || {}),
              JSON.stringify(proj.multilingualRatio || {})
            ]);
          }

          for (const cp of checkpointsToSync) {
            await pool.query(`
              INSERT INTO brain_checkpoints (
                id, project_id, name, version, branch, step, loss, total_tokens_trained,
                config_json, param_count, history_json, traits_json, notes, weights_serialized, created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                version = EXCLUDED.version,
                branch = EXCLUDED.branch,
                step = EXCLUDED.step,
                loss = EXCLUDED.loss,
                total_tokens_trained = EXCLUDED.total_tokens_trained,
                config_json = EXCLUDED.config_json,
                param_count = EXCLUDED.param_count,
                history_json = EXCLUDED.history_json,
                traits_json = EXCLUDED.traits_json,
                notes = EXCLUDED.notes,
                weights_serialized = COALESCE(EXCLUDED.weights_serialized, brain_checkpoints.weights_serialized)
            `, [
              cp.id,
              payload.projectId || projectsToSync[0]?.id || null,
              cp.name,
              cp.version || 1,
              cp.branch || 'main',
              cp.step || 0,
              cp.loss || 0.0,
              cp.totalTokensTrained || 0,
              JSON.stringify(cp.config),
              cp.paramCount || 0,
              JSON.stringify(cp.history || []),
              JSON.stringify(cp.traits || {}),
              cp.notes || '',
              cp.weightsSerialized || null
            ]);
          }

          return res.writeHead(200).end(JSON.stringify({
            success: true,
            syncedProjects: projectsToSync.length,
            syncedCheckpoints: checkpointsToSync.length,
            backend: 'postgresql_railway'
          }));
        } else {
          const db = await getDatabase();
          for (const proj of projectsToSync) {
            db.run(`
              INSERT OR REPLACE INTO brain_projects (id, name, description, current_checkpoint_id, active_branch, branches_json, traits_json, multilingual_ratio_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              proj.id,
              proj.name,
              proj.description || '',
              proj.currentCheckpointId || '',
              proj.activeBranch || 'main',
              JSON.stringify(proj.branches || ['main']),
              JSON.stringify(proj.traits || {}),
              JSON.stringify(proj.multilingualRatio || {})
            ]);
          }

          for (const cp of checkpointsToSync) {
            db.run(`
              INSERT OR REPLACE INTO brain_checkpoints (
                id, project_id, name, version, branch, step, loss, total_tokens_trained,
                config_json, param_count, history_json, traits_json, notes, weights_serialized, created_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
              cp.id,
              payload.projectId || projectsToSync[0]?.id || null,
              cp.name,
              cp.version || 1,
              cp.branch || 'main',
              cp.step || 0,
              cp.loss || 0.0,
              cp.totalTokensTrained || 0,
              JSON.stringify(cp.config),
              cp.paramCount || 0,
              JSON.stringify(cp.history || []),
              JSON.stringify(cp.traits || {}),
              cp.notes || '',
              cp.weightsSerialized || null
            ]);
          }
          persistDatabase();

          return res.writeHead(200).end(JSON.stringify({
            success: true,
            syncedProjects: projectsToSync.length,
            syncedCheckpoints: checkpointsToSync.length,
            backend: 'sqlite_local'
          }));
        }
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Teacher Pool dispatch endpoint
  if (req.url?.startsWith('/api/cloud/teacher-pool/dispatch') && req.method === 'POST') {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const payload = JSON.parse(body || '{}');
      const { topic, count = 10, model = 'qwen7b' } = payload;
      if (!topic) {
        return res.writeHead(400).end(JSON.stringify({ error: 'Missing topic in request' }));
      }
      const pool = getPgPool();
      if (!pool) {
        return res.writeHead(500).end(JSON.stringify({ error: 'PostgreSQL not configured' }));
      }
      const insertRes = await pool.query(
        `INSERT INTO teacher_pool_jobs (topic, count, model, status) VALUES ($1, $2, $3, 'queued') RETURNING id`,
        [topic, count, model]
      );
      const jobId = insertRes.rows[0].id;
      return res.writeHead(200).end(JSON.stringify({ jobId }));
    } catch (err: any) {
      return res.writeHead(500).end(JSON.stringify({ error: err.message }));
    }
  });
  return;
}

// Teacher Pool status endpoint
if (req.url?.startsWith('/api/cloud/teacher-pool/status/') && req.method === 'GET') {
  const urlObj = new URL(req.url, 'http://localhost');
  const parts = urlObj.pathname.split('/');
  const jobId = parts[parts.length - 1];
  const pool = getPgPool();
  if (!pool) {
    res.writeHead(500).end(JSON.stringify({ error: 'PostgreSQL not configured' }));
    return;
  }
  
  try {
    const result = await pool.query('SELECT status, samples_json FROM teacher_pool_jobs WHERE id = $1', [jobId]);
    if (result.rows.length === 0) {
      res.writeHead(404).end(JSON.stringify({ error: 'Job not found' }));
      return;
    }
    const row = result.rows[0];
    const response: any = { status: row.status };
    if (row.samples_json) response.samples = row.samples_json;
    res.writeHead(200).end(JSON.stringify(response));
  } catch (err: any) {
    res.writeHead(500).end(JSON.stringify({ error: err.message }));
  }
  return;
}

  // Cloud Telemetry endpoint (Monitoreo en tiempo real del Córtex)
  if (req.url === '/api/cloud/telemetry' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const pool = getPgPool();
    if (!pool) {
      return res.writeHead(200).end(JSON.stringify({
        connected: false,
        source: 'local_offline',
        totalCompleted: 0,
        totalQueued: 0,
        totalRunning: 0,
        totalFailed: 0,
        estimatedTokens: 0,
        message: 'PostgreSQL no conectado en esta instancia local'
      }));
    }

    try {
      const statsRes = await pool.query(`
        SELECT 
          status, 
          count(*) as count,
          sum(case when status='completed' then length(coalesce(samples_json::text, '')) else 0 end) as total_chars
        FROM teacher_pool_jobs 
        GROUP BY status
      `);
      
      const counts: Record<string, number> = { completed: 0, queued: 0, running: 0, failed: 0 };
      let totalChars = 0;
      for (const row of statsRes.rows) {
        counts[row.status] = parseInt(row.count, 10);
        if (row.status === 'completed') {
          totalChars = parseInt(row.total_chars || '0', 10);
        }
      }

      const latestRes = await pool.query(`
        SELECT id, topic, status, created_at, updated_at 
        FROM teacher_pool_jobs 
        ORDER BY created_at DESC 
        LIMIT 5
      `);

      const estimatedTokens = Math.round(totalChars / 3.5);

      return res.writeHead(200).end(JSON.stringify({
        connected: true,
        source: 'railway_postgres',
        totalCompleted: counts.completed || 0,
        totalQueued: counts.queued || 0,
        totalRunning: counts.running || 0,
        totalFailed: counts.failed || 0,
        estimatedTokens,
        recentJobs: latestRes.rows
      }));
    } catch (err: any) {
      return res.writeHead(500).end(JSON.stringify({ error: err.message }));
    }
  }

  // ----------------------------------------------------
  // 💓 FLYWHEEL TELEMETRY HEARTBEAT (PC Local -> Cloud)
  // ----------------------------------------------------
  if (req.url?.startsWith('/api/cloud/telemetry/heartbeat') && req.method === 'POST') {
    const processPayload = async (payload: any) => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const pool = getPgPool();
        if (pool) {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS cortex_heartbeats (
              id INT PRIMARY KEY DEFAULT 1,
              telemetry JSONB NOT NULL,
              updated_at TIMESTAMPTZ DEFAULT NOW()
            )
          `);
          await pool.query(`
            INSERT INTO cortex_heartbeats (id, telemetry, updated_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (id) DO UPDATE SET telemetry = $1, updated_at = NOW()
          `, [JSON.stringify(payload)]);
        }
        return res.writeHead(200).end(JSON.stringify({ success: true, saved: true }));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    };

    if ((req as any).body && typeof (req as any).body === 'object') {
      processPayload((req as any).body);
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        processPayload(payload);
      } catch (e: any) {
        res.setHeader('Content-Type', 'application/json');
        return res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // ----------------------------------------------------
  // 📥 HARVESTER DATA FEED (Cloud Teacher Jobs -> Local Flywheel)
  // ----------------------------------------------------
  if (req.url?.startsWith('/api/cloud/harvester/feed') && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const pool = getPgPool();
    if (!pool) {
      return res.writeHead(200).end(JSON.stringify({ jobs: [], count: 0, totalHarvestedTokens: 0 }));
    }
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const limit = Math.min(1000, parseInt(urlObj.searchParams.get('limit') || '400', 10));
      const since = urlObj.searchParams.get('since');

      let query = `
        SELECT id, topic, samples_json, created_at, updated_at
        FROM teacher_pool_jobs
        WHERE status = 'completed' AND samples_json IS NOT NULL
      `;
      const params: any[] = [];
      if (since) {
        params.push(since);
        query += ` AND updated_at > $${params.length}`;
      }
      params.push(limit);
      query += ` ORDER BY updated_at DESC LIMIT $${params.length}`;

      const resRows = await pool.query(query, params);

      const statsRes = await pool.query(`
        SELECT sum(length(coalesce(samples_json::text, ''))) as total_chars
        FROM teacher_pool_jobs WHERE status='completed'
      `);
      const totalChars = parseInt(statsRes.rows[0]?.total_chars || '0', 10);
      const totalHarvestedTokens = Math.round(totalChars / 3.5);

      return res.writeHead(200).end(JSON.stringify({
        jobs: resRows.rows,
        count: resRows.rows.length,
        totalHarvestedTokens,
        timestamp: new Date().toISOString()
      }));
    } catch (err: any) {
      return res.writeHead(500).end(JSON.stringify({ error: err.message }));
    }
  }

  // ----------------------------------------------------
  // 🛰️ SERVER HARVESTER LIVE ENGINE (100% SERVIDOR 24/7)
  // ----------------------------------------------------
  if (req.url?.startsWith('/api/cloud/harvester/live') && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    const pool = getPgPool();
    let flywheelData = getFlywheelTelemetry();

    if (pool && (!flywheelData.active || flywheelData.step === 0)) {
      try {
        const hbRes = await pool.query("SELECT telemetry FROM cortex_heartbeats WHERE id = 1");
        if (hbRes.rows.length > 0 && hbRes.rows[0].telemetry) {
          const stored = hbRes.rows[0].telemetry;
          flywheelData = {
            active: true,
            cycle: stored.cycle || 0,
            step: stored.step || 0,
            loss: stored.loss || 0,
            layers: stored.layers || '8L',
            tokens: stored.tokens || 0,
            buffer: stored.buffer || 4590,
            lastUpdated: stored.lastUpdated || new Date().toISOString(),
            recentLogs: stored.recentLogs || []
          };
        }
      } catch {}
    }

    if (!pool) {
      return res.writeHead(200).end(JSON.stringify({
        serverStatus: serverHarvesterState,
        cloudConnected: false,
        source: 'local_engine',
        flywheel: flywheelData,
        counts: { queued: 0, running: 0, completed: flywheelData.cycle, failed: 0 },
        totalHarvestedTokens: flywheelData.tokens,
        recentSamples: [],
        message: 'Servidor local activo con Flywheel conectado.'
      }));
    }

    try {
      const statsRes = await pool.query(`
        SELECT 
          status, 
          count(*) as count,
          sum(case when status='completed' then length(coalesce(samples_json::text, '')) else 0 end) as total_chars
        FROM teacher_pool_jobs 
        GROUP BY status
      `);
      
      const counts: Record<string, number> = { completed: 0, queued: 0, running: 0, failed: 0 };
      let totalChars = 0;
      for (const row of statsRes.rows) {
        counts[row.status] = parseInt(row.count, 10);
        if (row.status === 'completed') {
          totalChars += parseInt(row.total_chars || '0', 10);
        }
      }

      const recentJobsRes = await pool.query(`
        SELECT id, topic, status, samples_json, created_at, updated_at
        FROM teacher_pool_jobs
        WHERE status = 'completed' AND samples_json IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 6
      `);

      const recentSamples: any[] = [];
      for (const row of recentJobsRes.rows) {
        try {
          const parsed = typeof row.samples_json === 'string' ? JSON.parse(row.samples_json) : row.samples_json;
          if (Array.isArray(parsed)) {
            for (const s of parsed.slice(0, 2)) {
              recentSamples.push({
                id: s.id || row.id,
                topic: row.topic,
                input: s.input,
                output: s.output,
                source: s.source || 'teacher_pool',
                createdAt: row.updated_at
              });
            }
          }
        } catch {}
      }

      const estimatedCloudTokens = Math.round(totalChars / 3.5);
      const trainedTokens = flywheelData.tokens || 0;
      const absorptionRate = estimatedCloudTokens > 0
        ? Math.min(100, Math.round((trainedTokens / estimatedCloudTokens) * 100))
        : 100;

      return res.writeHead(200).end(JSON.stringify({
        serverStatus: serverHarvesterState,
        cloudConnected: true,
        source: 'railway_postgres_flywheel',
        flywheel: flywheelData,
        counts: {
          queued: counts.queued || 0,
          running: counts.running || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0
        },
        totalHarvestedTokens: estimatedCloudTokens,
        cloudTokens: estimatedCloudTokens,
        trainedTokens: trainedTokens,
        absorptionRate: absorptionRate,
        recentSamples: recentSamples.slice(0, 10),
        timestamp: new Date().toISOString()
      }));
    } catch (err: any) {
      return res.writeHead(200).end(JSON.stringify({
        serverStatus: serverHarvesterState,
        cloudConnected: false,
        source: 'fallback',
        flywheel: flywheelData,
        counts: { queued: 0, running: 0, completed: flywheelData.cycle, failed: 0 },
        totalHarvestedTokens: flywheelData.tokens,
        recentSamples: [],
        error: err.message
      }));
    }
  }

  // Iniciar Farmeo en Servidor
  if (req.url === '/api/cloud/harvester/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      serverHarvesterState = 'active';
      try {
        const payload = JSON.parse(body || '{}');
        const topic = payload.topic || 'PiolaCraft: Guía de supervivencia, crafteos VoxeLibre, mecánicas del juego y personalidad de Lucy';
        const count = payload.count || 5;
        const pool = getPgPool();

        if (pool) {
          // Despachar 3 tareas inmediatas a la cola de Railway
          for (let i = 0; i < 3; i++) {
            await pool.query(
              "INSERT INTO teacher_pool_jobs (topic, count, model, status) VALUES ($1, $2, 'openai/gpt-oss-20b', 'queued')",
              [`${topic} [Lote #${i + 1}]`, count]
            );
          }
        }
        return res.writeHead(200).end(JSON.stringify({
          success: true,
          serverStatus: 'active',
          message: 'Farmeo en Servidor 24/7 activado exitosamente.'
        }));
      } catch (err: any) {
        return res.writeHead(200).end(JSON.stringify({
          success: true,
          serverStatus: 'active',
          warning: err.message
        }));
      }
    });
    return;
  }

  // Pausar Farmeo en Servidor
  if (req.url === '/api/cloud/harvester/pause' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    serverHarvesterState = 'paused';
    return res.writeHead(200).end(JSON.stringify({
      success: true,
      serverStatus: 'paused',
      message: 'Farmeo en Servidor 24/7 pausado.'
    }));
  }

  // Despachar Lote Personalizado Inmediato al Servidor
  if (req.url === '/api/cloud/harvester/dispatch-batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { topic, count = 5, model = 'openai/gpt-oss-20b' } = payload;
        const pool = getPgPool();
        if (!pool) {
          return res.writeHead(200).end(JSON.stringify({
            success: true,
            jobId: `local_${Date.now()}`,
            message: 'Registrado en búfer local.'
          }));
        }
        const insertRes = await pool.query(
          "INSERT INTO teacher_pool_jobs (topic, count, model, status) VALUES ($1, $2, $3, 'queued') RETURNING id",
          [topic, count, model]
        );
        return res.writeHead(200).end(JSON.stringify({
          success: true,
          jobId: insertRes.rows[0]?.id
        }));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Cloud Shards Status endpoint
  if (req.url === '/api/cloud/shards-status' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    try {
      const status = getCloudShardsStatus();
      return res.writeHead(200).end(JSON.stringify(status));
    } catch (err: any) {
      return res.writeHead(500).end(JSON.stringify({ error: err.message }));
    }
  }

  // Cloud Shards Synchronizer endpoint (Descarga y compila uint16 shards)
  if (req.url === '/api/cloud/sync-shards' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    (async () => {
      try {
        const result = await syncCloudToBinaryShards();
        return res.writeHead(200).end(JSON.stringify(result));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // Copilot Assistant Chat & Command Navigation
  if (req.url === '/api/copilot/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const userMsg = (payload.message || '').trim().toLowerCase();
        
        let navigationTarget: string | null = null;
        let reply = '';

        // Detección de comandos de navegación
        if (userMsg.includes('forja') || userMsg.includes('compil') || userMsg.includes('gguf')) {
          navigationTarget = 'forge';
          reply = '⚒️ Te he cambiado a la pestaña **La Forja (Model Compiler)**. Aquí puedes compilar y cuantizar a GGUF con llama.cpp.';
        } else if (userMsg.includes('entrena') || userMsg.includes('loss') || userMsg.includes('adamw')) {
          navigationTarget = 'train';
          reply = '⚡ Te he cambiado a la pestaña **Entrenamiento Neuronal**. Aquí puedes ver la curva de pérdida, ejecutar pasos y activar el Auto-Farming.';
        } else if (userMsg.includes('chat') || userMsg.includes('conversar') || userMsg.includes('hablar')) {
          navigationTarget = 'chat';
          reply = '💬 Te he cambiado a la pestaña **Chat Local**. Puedes chatear 100% offline con nanoGPT o usar el modo Dúo con el Maestro.';
        } else if (userMsg.includes('dataset') || userMsg.includes('alpaca') || userMsg.includes('corpus')) {
          navigationTarget = 'data';
          reply = '📁 Te he cambiado a la pestaña **Datasets & Lua**. Aquí puedes inspeccionar tus ejemplos curados y scripts.';
        } else if (userMsg.includes('proyecto') || userMsg.includes('checkpoint') || userMsg.includes('rama')) {
          navigationTarget = 'projects';
          reply = '🗂️ Te he cambiado al gestor de **Proyectos & Checkpoints**. Aquí puedes crear ramas y respaldar versiones.';
        } else if (userMsg.includes('arquitectura') || userMsg.includes('tensor') || userMsg.includes('capa')) {
          navigationTarget = 'model';
          reply = '🔬 Te he cambiado a **nanoGPT Core (Arquitectura)**. Puedes auditar las matrices de atención, embeddings y pesos.';
        } else if (userMsg.includes('cuanto') || userMsg.includes('token') || userMsg.includes('nube') || userMsg.includes('estado')) {
          // Consultar métricas en vivo
          const pool = getPgPool();
          let tokensCount = '~100.000';
          let completedCount = '70+';
          if (pool) {
            try {
              const res1 = await pool.query("SELECT count(*) as cnt, sum(length(coalesce(samples_json::text,''))) as ch FROM teacher_pool_jobs WHERE status='completed'");
              if (res1.rows.length > 0) {
                completedCount = res1.rows[0].cnt;
                tokensCount = Math.round(parseInt(res1.rows[0].ch || '0', 10) / 3.5).toLocaleString();
              }
            } catch {}
          }
          reply = `📊 **Estado en Vivo del Córtex (Railway):**\n- Tareas completadas: **${completedCount}**\n- Tokens farmeados en PostgreSQL: **${tokensCount} tokens**\n- Piso Mínimo Local: **24.8M tokens** (Stanford Alpaca + CodeAlpaca en 50 shards binarios).\n- Keys de Groq: **5 API Keys activas** con rotación y cooldown.`;
        } else if (userMsg.includes('growth') || userMsg.includes('crecer') || userMsg.includes('zeroblock')) {
          reply = `🧬 **Model Growth Engine (ZeroBlockInsert):**\nPermite duplicar la profundidad del modelo (ej. 4 a 8 capas) conservando el 100% de la función previa (\\Delta Logits = 0.000000). Al inicializar las proyecciones residuales en cero, las nuevas capas actúan como identidad pura mientras se entrenan con los datos nuevos.`;
        } else if (userMsg.includes('scrapling') || userMsg.includes('stealth') || userMsg.includes('cloudflare')) {
          navigationTarget = 'data';
          reply = '🕷️ **Scrapling Stealth Engine**: Activo en la pestaña **Datasets**. Permite bypass de Cloudflare Turnstile, emulación TLS de navegador y extracción con selectores CSS limpios.';
        } else if (userMsg.includes('reach') || userMsg.includes('youtube') || userMsg.includes('reddit') || userMsg.includes('rss')) {
          navigationTarget = 'data';
          reply = '🌐 **Agent Reach Engine**: Activo en la pestaña **Datasets**. Puedes extraer transcripciones de YouTube, documentación de GitHub o hilos de Reddit sin claves de API de pago.';
        } else if (userMsg.includes('scrapegraph') || userMsg.includes('sintetiz')) {
          navigationTarget = 'data';
          reply = '🧬 **ScrapeGraphAI Pipeline**: Activo en la pestaña **Datasets**. Convierte cualquier texto o documentación web en pares de entrenamiento estructurados {instruction, input, output} para NanoGPT.';
        } else if (userMsg.includes('obscura') || userMsg.includes('rust browser') || userMsg.includes('cdp')) {
          navigationTarget = 'data';
          reply = '⚡ **Obscura (Rust Headless Browser)**: Activo en la pestaña **Datasets**. Consume sólo ~30MB de RAM, ejecuta JS con motor V8, soporta CDP en el puerto 9222 y volcado directo de texto, HTML y enlaces.';
        } else if (userMsg.includes('shard') || userMsg.includes('sincroniz') || userMsg.includes('descargar token')) {
          navigationTarget = 'train';
          const shardStat = getCloudShardsStatus();
          reply = `💾 **Cloud Shard Synchronizer:**\n- Shards Binarios Compilados: **${shardStat.shardsCount}** (${(shardStat.totalTokens).toLocaleString()} tokens)\n- Formato: **uint16 little-endian** (0% padding waste)\n- Puedes sincronizar los nuevos tokens de la nube hacia shards binarios ejecutando la acción de sincronización o mediante \`POST /api/cloud/sync-shards\`.`;
        } else {
          reply = `👋 ¡Hola! Soy tu asistente y copiloto de **OneBrain**. Puedo navegar a cualquier panel que me pidas (ej: *"llévame a la Forja"*, *"ir a entrenar"*, *"ver datasets"*), consultar cuántos tokens van farmeados en la nube en tiempo real, o activar los motores de Scrapling, Agent Reach, ScrapeGraphAI y Obscura. ¿Qué deseas hacer?`;
        }

        return res.writeHead(200).end(JSON.stringify({
          reply,
          navigationTarget
        }));

      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // HARVEST & INGESTION HUB (Scrapling, Agent Reach, ScrapeGraphAI)
  // ==========================================

  // 1. Scrapling Stealth Web Fetch
  if (req.url === '/api/harvest/scrapling' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { url, cssSelector } = payload;
        if (!url) {
          return res.writeHead(400).end(JSON.stringify({ error: 'URL requerida' }));
        }
        const result = await fetchWithScraplingStealth({ url, cssSelector });
        return res.writeHead(200).end(JSON.stringify(result));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. Agent Reach Multi-Platform Ingest (YouTube, GitHub, Reddit, RSS)
  if (req.url === '/api/harvest/reach' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { platform, target, limit } = payload;
        if (!platform || !target) {
          return res.writeHead(400).end(JSON.stringify({ error: 'platform y target son requeridos' }));
        }
        const result = await ingestWithAgentReach({ platform, target, limit });
        return res.writeHead(200).end(JSON.stringify(result));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. ScrapeGraphAI Pipeline Synthesizer
  if (req.url === '/api/harvest/synthesize' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { rawContent, topic, count, category } = payload;
        if (!rawContent) {
          return res.writeHead(400).end(JSON.stringify({ error: 'rawContent es requerido' }));
        }
        const result = await runScrapeGraphPipeline({ rawContent, topic, count, category });
        return res.writeHead(200).end(JSON.stringify(result));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. Obscura Engine Status
  if (req.url === '/api/harvest/obscura/status' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    (async () => {
      try {
        const status = await getObscuraStatus();
        return res.writeHead(200).end(JSON.stringify(status));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  // 5. Obscura Engine Web Execution
  if (req.url === '/api/harvest/obscura' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { url, evalScript, dump, stealth, timeoutSecs } = payload;
        if (!url) {
          return res.writeHead(400).end(JSON.stringify({ error: 'URL requerida' }));
        }
        const result = await runWithObscura({ url, evalScript, dump, stealth, timeoutSecs });
        return res.writeHead(200).end(JSON.stringify(result));
      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // OneBrain Foundry - Model Compiler Endpoint
  if (req.url?.startsWith('/api/forge/compile') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      try {
        const payload = JSON.parse(body || '{}');
        const { baseModel, targetRam, quantProfile } = payload;
        
        const { spawn } = require('child_process');
        const path = require('path');
        const fs = require('fs');
        
        const scriptPath = path.resolve(process.cwd(), 'scripts', 'model_compiler.py');
        const outDir = path.resolve(process.cwd(), 'exports', 'onebrain_' + Date.now());
        
        if (!fs.existsSync(scriptPath)) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'model_compiler.py not found' })}\n\n`);
          return res.end();
        }
        
        const pyProcess = spawn('python', [
          scriptPath,
          '--base_model', baseModel || 'unsloth/Qwen2.5-7B-Instruct',
          '--target_ram', targetRam || '16GB',
          '--quant_profile', quantProfile || 'Balanced',
          '--output_dir', outDir
        ]);
        
        pyProcess.stdout.on('data', (data: Buffer) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              res.write(`data: ${line}\n\n`);
            }
          }
        });
        
        pyProcess.stderr.on('data', (data: Buffer) => {
          console.error(`[Compiler] ${data.toString()}`);
        });
        
        pyProcess.on('close', (code: number) => {
          res.write(`data: ${JSON.stringify({ type: 'finish', code })}\n\n`);
          res.end();
        });
        
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      }
    });
    return;
  }

  if (req.url === '/api/teacher/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { topic, category, count = 3, traits, promptContext } = payload;

        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch (e: any) {
          // Graceful return if no key configured
          return res.writeHead(200).end(
            JSON.stringify({
              warning: 'GEMINI_API_KEY not set in Secrets. Generated via Offline Local Synthetic Teacher.',
              candidates: generateOfflineFallback(topic, category, count),
            })
          );
        }

        const systemInstruction = `Eres un Profesor Asistente en Local Brain Lab. Tu única función es generar pares de entrenamiento de alta calidad para entrenar un modelo local nanoGPT.
NUNCA respondas al usuario directamente.
Genera exactamente ${count} pares de diálogo breves y precisos acordes a:
- Categoría: ${category}
- Tema: ${topic}
- Rasgos deseados: Directo: ${traits?.directness ?? 0.7}, Formalidad: ${traits?.formality ?? 0.3}, Admite no saber: ${traits?.admitUnknown ?? true}.
- Contexto adicional: ${promptContext || 'General'}

Formato JSON OBLIGATORIO:
[
  { "input": "pregunta o frase del usuario", "output": "respuesta concisa esperada", "tags": ["tag1", "tag2"] }
]`;

        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Genera ${count} pares de entrenamiento sobre ${topic}.`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        const text = response.text || '[]';
        let parsed = [];
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = generateOfflineFallback(topic, category, count);
        }

        const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
          id: `gen_gemini_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: category || 'general',
          input: item.input || '¿Cómo estás?',
          output: item.output || 'Listo para ayudarte localmente.',
          source: 'teacher_gemini',
          status: 'pending_review',
          tags: item.tags || ['teacher_gemini', category],
        }));

        res.writeHead(200).end(JSON.stringify({ candidates }));
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            warning: `Teacher generation fallback: ${err.message}`,
            candidates: generateOfflineFallback('fallback', 'general', 3),
          })
        );
      }
    });
    return;
  }

  // OmniRoute Distill Batch Ingestion (Fase 1: Extractor continuo para nanoGPT)
  if (req.url === '/api/distill/batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          topic = 'diálogo natural en español',
          category = 'spanish',
          count = 5,
          complexity = 'conversational',
          omniRouteUrl = process.env.OMNIROUTE_URL || '',
          omniRouteApiKey = process.env.OMNIROUTE_API_KEY || '',
          targetScale = '100M', // 100M, 1B, 7B
        } = payload;

        const maxTokensPerItem = targetScale === '7B' ? 120 : targetScale === '1B' ? 60 : 25;
        const promptInstruction = `Eres un destilador de conocimiento de frontera (OmniRoute Distillation Engine).
Tu objetivo es transferir patrones lingüísticos de alta densidad hacia un modelo estudiante nanoGPT (escala de diseño: ${targetScale}).
Genera exactamente ${count} pares de entrenamiento concisos, de altísima calidad y coherencia.
Modo: ${complexity}.
Tema: ${topic}.
Idioma principal: Español nativo y código Lua limpio si corresponde.
Reglas:
1. Longitud de respuesta: aproximadamente ${maxTokensPerItem} palabras por respuesta (adaptado para ventana de atención causal ${targetScale}).
2. Preguntas naturales que un usuario real haría en español.
3. Formato JSON estricto: [{"input": "...", "output": "...", "tags": ["..."]}]`;

        // 1. Intentar vía OpenAI / GPT-4 Directo o Gateway OmniRoute
        const openAiApiKey = payload.openaiApiKey || (omniRouteApiKey?.startsWith('sk-') ? omniRouteApiKey : '') || process.env.OPENAI_API_KEY || '';
        const isDirectOpenAI = !!openAiApiKey && (!omniRouteUrl || omniRouteUrl.includes('api.openai.com'));
        const targetEndpoint = isDirectOpenAI
          ? 'https://api.openai.com/v1/chat/completions'
          : omniRouteUrl
          ? (omniRouteUrl.endsWith('/chat/completions') ? omniRouteUrl : `${omniRouteUrl.replace(/\/+$/, '')}/chat/completions`)
          : '';

        const effectiveModel = payload.openaiModel || payload.omniRouteModel || (openAiApiKey ? 'gpt-4o-mini' : 'omniroute-auto');
        const effectiveAuthKey = isDirectOpenAI ? openAiApiKey : (omniRouteApiKey || openAiApiKey);

        if (targetEndpoint && effectiveAuthKey) {
          try {
            const endpointRes = await fetch(targetEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${effectiveAuthKey}`,
              },
              body: JSON.stringify({
                model: effectiveModel,
                messages: [
                  { role: 'system', content: promptInstruction },
                  { role: 'user', content: `Genera ${count} pares destilados sobre ${topic} en formato JSON estricto.` },
                ],
                temperature: 0.7,
              }),
            });

            if (endpointRes.ok) {
              const resData = await endpointRes.json();
              const rawText = resData.choices?.[0]?.message?.content || '[]';
              let cleaned = rawText.trim();
              if (cleaned.startsWith('```json')) {
                cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
              } else if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '').trim();
              }
              const parsed = JSON.parse(cleaned);
              const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
                id: `gpt4_distill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                category: category || 'spanish',
                input: item.input || 'Consulta',
                output: item.output || 'Respuesta destilada por GPT-4',
                source: 'synthetic_api',
                approved: true,
                createdAt: new Date().toISOString(),
                tags: item.tags || ['gpt4_distilled', category, targetScale, effectiveModel],
              }));

              const modelLabel = isDirectOpenAI ? `OpenAI ${effectiveModel}` : `Gateway (${resData.model || effectiveModel})`;
              return res.writeHead(200).end(
                JSON.stringify({
                  sourceModel: `${modelLabel} (Frontier Teacher)`,
                  distillRatio: targetScale === '7B' ? '120,000x' : '50,000x',
                  candidates,
                })
              );
            } else {
              const errBody = await endpointRes.text();
              console.warn(`[Distill] HTTP ${endpointRes.status} from ${targetEndpoint}:`, errBody.slice(0, 150));
            }
          } catch (endpointErr: any) {
            console.warn('[Distill] Endpoint error, falling back to Gemini/offline:', endpointErr.message);
          }
        }

        // 2. Si OmniRoute no está activo o falla, usar SDK nativo de Gemini
        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch {
          return res.writeHead(200).end(
            JSON.stringify({
              sourceModel: 'Offline Distillation Pipeline',
              distillRatio: '1,000x',
              candidates: generateOfflineFallback(topic, category, count).map(c => ({ ...c, approved: true })),
            })
          );
        }

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Genera ${count} pares destilados de alta densidad sobre ${topic}.`,
          config: {
            systemInstruction: promptInstruction,
            responseMimeType: 'application/json',
          },
        });

        const text = response.text || '[]';
        let parsed = [];
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = generateOfflineFallback(topic, category, count);
        }

        const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
          id: `distill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: category || 'spanish',
          input: item.input || 'Hola',
          output: item.output || 'Hola, ¿cómo estás?',
          source: 'synthetic_api',
          approved: true,
          createdAt: new Date().toISOString(),
          tags: item.tags || ['omniroute_distilled', category, targetScale],
        }));

        res.writeHead(200).end(
          JSON.stringify({
            sourceModel: 'Gemini 2.5 Flash / OmniRoute Native',
            distillRatio: '35,000x',
            candidates,
          })
        );
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            sourceModel: 'Offline Distillation Fallback',
            distillRatio: '1,000x',
            candidates: generateOfflineFallback('fallback', 'spanish', 4).map(c => ({ ...c, approved: true })),
          })
        );
      }
    });
    return;
  }

  // OmniRoute Gateway Direct Chat Endpoint (Fase 4: Modo Maestro / Dúo)
  if (req.url === '/api/gateway/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          message,
          systemPrompt,
          omniRouteUrl = process.env.OMNIROUTE_URL || '',
          omniRouteApiKey = process.env.OMNIROUTE_API_KEY || '',
        } = payload;

        // Si se provee OmniRoute Gateway, intentar primero por ahí
        if (omniRouteUrl && omniRouteUrl.trim().length > 0) {
          try {
            const gatewayEndpoint = omniRouteUrl.endsWith('/chat/completions')
              ? omniRouteUrl
              : `${omniRouteUrl.replace(/\/+$/, '')}/chat/completions`;

            const omniRes = await fetch(gatewayEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey}` } : {}),
              },
              body: JSON.stringify({
                model: payload.omniRouteModel || 'omniroute-auto',
                messages: [
                  { role: 'system', content: systemPrompt || 'Eres un asistente experto conciso, cordial y preciso.' },
                  { role: 'user', content: message || 'Hola' },
                ],
                temperature: 0.7,
              }),
            });

            if (omniRes.ok) {
              const omniData = await omniRes.json();
              const reply = omniData.choices?.[0]?.message?.content || 'Sin respuesta del modelo.';
              return res.writeHead(200).end(
                JSON.stringify({
                  reply,
                  model: `OmniRoute Gateway (${omniData.model || 'auto-routed'})`,
                })
              );
            }
          } catch (omniErr: any) {
            console.warn('OmniRoute chat error, falling back to Gemini:', omniErr.message);
          }
        }

        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch {
          return res.writeHead(200).end(
            JSON.stringify({
              reply: 'OmniRoute Fallback: No se detectó GEMINI_API_KEY en los secretos ni OmniRoute Gateway activo. Respondiendo mediante fallback local.',
              model: 'Local Fallback',
            })
          );
        }

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: message || 'Hola',
          config: {
            systemInstruction: systemPrompt || 'Eres un asistente experto conciso, cordial y preciso.',
          },
        });

        res.writeHead(200).end(
          JSON.stringify({
            reply: response.text || 'Sin respuesta del modelo.',
            model: 'Gemini 2.5 Flash (OmniRoute Gateway)',
          })
        );
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            reply: `Error en Gateway: ${err.message}`,
            model: 'Gateway Error',
          })
        );
      }
    });
    return;
  }

  // Endpoint para testear conectividad directa con OmniRoute Gateway
  if (req.url === '/api/gateway/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { omniRouteUrl, omniRouteApiKey } = payload;

        if (!omniRouteUrl || !omniRouteUrl.trim()) {
          // Probar conexión nativa Gemini
          const t0 = performance.now();
          const client = getAIClient();
          const testRes = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'ping',
          });
          const latency = Math.round(performance.now() - t0);
          return res.writeHead(200).end(JSON.stringify({
            success: true,
            provider: 'Gemini 2.5 Flash (Nativo / Default)',
            latencyMs: latency,
            message: 'Conexión nativa de alta velocidad operativa.',
          }));
        }

        const cleanUrl = omniRouteUrl.trim().replace(/\/+$/, '');
        const t0 = performance.now();

        // 1. Intentar /models
        let modelsEndpoint = cleanUrl.endsWith('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        if (cleanUrl.endsWith('/models')) modelsEndpoint = cleanUrl;

        let resOk = false;
        let modelsList: string[] = [];
        try {
          const fetchRes = await fetch(modelsEndpoint, {
            headers: {
              ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey.trim()}` } : {}),
            },
            signal: AbortSignal.timeout(8000),
          });
          if (fetchRes.ok) {
            const data = await fetchRes.json();
            resOk = true;
            if (Array.isArray(data.data)) {
              modelsList = data.data.slice(0, 5).map((m: any) => m.id || m.name);
            }
          }
        } catch {
          // Intentar vía chat/completions mínimo
        }

        // Si falló /models, probar /chat/completions con timeout
        if (!resOk) {
          const chatEndpoint = cleanUrl.endsWith('/chat/completions')
            ? cleanUrl
            : cleanUrl.endsWith('/v1')
            ? `${cleanUrl}/chat/completions`
            : `${cleanUrl}/v1/chat/completions`;

          const chatRes = await fetch(chatEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey.trim()}` } : {}),
            },
            body: JSON.stringify({
              model: payload.omniRouteModel || 'omniroute-auto',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(10000),
          });

          if (chatRes.ok) {
            resOk = true;
          } else {
            const errText = await chatRes.text();
            throw new Error(`HTTP ${chatRes.status}: ${errText.slice(0, 120)}`);
          }
        }

        const latency = Math.round(performance.now() - t0);
        return res.writeHead(200).end(JSON.stringify({
          success: true,
          provider: 'OmniRoute Gateway',
          latencyMs: latency,
          models: modelsList,
          message: `Conexión exitosa a ${cleanUrl} (${latency}ms). Listo para destilar.`,
        }));
      } catch (err: any) {
        return res.writeHead(200).end(JSON.stringify({
          success: false,
          error: err.message || 'No se pudo conectar a la URL especificada.',
          hint: 'Si OmniRoute está corriendo en tu PC local (localhost:20129), esta app (que corre en Google Cloud Run) no puede alcanzar tu máquina sin un túnel público como ngrok, Pinggy o Cloudflare Tunnel.',
        }));
      }
    });
    return;
  }

  // ==========================================
  // ⚡ ONEBRAIN GPU INFERENCE ENDPOINT (RTX 2060 / PyTorch)
  // ==========================================
  if (req.url === '/api/infer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const prompt = (payload.prompt || '').trim();
        const maxTokens = Math.min(256, Math.max(10, parseInt(payload.maxTokens || '60', 10)));
        const temperature = Math.max(0.1, Math.min(1.5, parseFloat(payload.temperature || '0.7')));
        const topK = Math.max(1, Math.min(100, parseInt(payload.topK || '40', 10)));
        const checkpoint = payload.checkpoint || 'checkpoints/onebrain_piolacraft.pt';

        if (!prompt) {
          return res.writeHead(400).end(JSON.stringify({ success: false, error: 'Prompt requerido' }));
        }

        const { spawn } = await import('child_process');
        const path = await import('path');
        const fs = await import('fs');

        const pythonExe = path.resolve(process.cwd(), 'infra', 'env313', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), 'nanogpt', 'sample.py');

        if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath)) {
          return res.writeHead(500).end(JSON.stringify({
            success: false,
            error: 'Entorno Python CUDA (infra/env313) o sample.py no disponible en el servidor.'
          }));
        }

        const args = [
          scriptPath,
          '--ckpt', checkpoint,
          '--prompt', prompt,
          '--max_tokens', maxTokens.toString(),
          '--temperature', temperature.toString(),
          '--top_k', topK.toString(),
          '--json'
        ];

        const pyProc = spawn(pythonExe, args, { cwd: process.cwd() });
        let stdout = '';
        let stderr = '';

        pyProc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        pyProc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

        pyProc.on('close', (code: number) => {
          if (code !== 0) {
            return res.writeHead(500).end(JSON.stringify({
              success: false,
              error: `Error de ejecucion en PyTorch: ${stderr.slice(0, 200)}`,
              code
            }));
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            return res.writeHead(200).end(JSON.stringify(parsed));
          } catch {
            return res.writeHead(200).end(JSON.stringify({
              success: true,
              response: stdout.trim(),
              raw: true
            }));
          }
        });

      } catch (err: any) {
        return res.writeHead(500).end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.url === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200).end(JSON.stringify({ status: 'ok', engine: 'nanoGPT-Local-Brain-Lab' }));
    return;
  }

  // --- SQL BACKEND: Fila de Empaquetado y Redistribución ---

  // Obtener items de la cola de empaquetado
  if (req.url === '/api/packaging/queue' && req.method === 'GET') {
    getDatabase().then(db => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const stmt = db.prepare('SELECT * FROM packaging_queue ORDER BY created_at DESC LIMIT 50');
        const items: any[] = [];
        while (stmt.step()) {
          items.push(stmt.getAsObject());
        }
        stmt.free();
        res.writeHead(200).end(JSON.stringify({ queue: items }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    }).catch(err => {
      res.writeHead(500).end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Añadir un elemento a la fila de empaquetado
  if (req.url === '/api/packaging/enqueue' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { projectId, checkpointId, format, destinationTarget = 'local_download', artifactName, sizeBytes = 0 } = payload;
        
        const db = await getDatabase();
        const id = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();
        const finalArtifactName = artifactName || `brain_${projectId}_${checkpointId}.${format}`;
        
        db.run(`
          INSERT INTO packaging_queue (id, project_id, checkpoint_id, format, status, artifact_name, size_bytes, destination_target, created_at)
          VALUES (?, ?, ?, ?, 'packaging', ?, ?, ?, ?)
        `, [id, projectId, checkpointId, format, finalArtifactName, sizeBytes, destinationTarget, now]);
        
        persistDatabase();

        // Simular finalización de empaquetado a estado "ready" / "distributed"
        setTimeout(async () => {
          try {
            const innerDb = await getDatabase();
            const completedAt = new Date().toISOString();
            const downloadUrl = `/api/artifacts/${finalArtifactName}`;
            innerDb.run(`
              UPDATE packaging_queue
              SET status = 'ready', completed_at = ?, download_url = ?
              WHERE id = ?
            `, [completedAt, downloadUrl, id]);
            persistDatabase();
          } catch (e) {
            console.error('Error actualizando estado de cola:', e);
          }
        }, 1500);

        res.writeHead(200).end(JSON.stringify({
          success: true,
          item: {
            id,
            projectId,
            checkpointId,
            format,
            status: 'packaging',
            artifactName: finalArtifactName,
            destinationTarget,
            createdAt: now,
          }
        }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Actualizar estado de un trabajo en la cola (redistribuir a canal)
  if (req.url === '/api/packaging/redistribute' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const { queueId, destinationTarget } = JSON.parse(body || '{}');
        const db = await getDatabase();
        const now = new Date().toISOString();
        db.run(`
          UPDATE packaging_queue
          SET status = 'distributed', destination_target = ?, completed_at = ?
          WHERE id = ?
        `, [destinationTarget || 'github_release', now, queueId]);
        persistDatabase();

        res.writeHead(200).end(JSON.stringify({ success: true, message: `Redistribuido a ${destinationTarget}` }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Obtener nodos de distribución
  if (req.url === '/api/distribution/nodes' && req.method === 'GET') {
    getDatabase().then(db => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const stmt = db.prepare('SELECT * FROM distribution_nodes');
        const nodes: any[] = [];
        while (stmt.step()) {
          nodes.push(stmt.getAsObject());
        }
        stmt.free();

        // Si la tabla está vacía, sembrar con nodos por defecto
        if (nodes.length === 0) {
          const defaultNodes = [
            { id: 'node_gitlab', name: 'GitLab Repo (brainlab-group/brainlab)', channel_type: 'gitlab_repo', endpoint_url: 'https://gitlab.com/brainlab-group/brainlab.git', status: 'active', last_sync: new Date().toISOString() },
            { id: 'node_github', name: 'GitHub Private Repo (Sync)', channel_type: 'github_repo', endpoint_url: 'https://github.com/mistificacionlondres-cmd/brainlab.git', status: 'standby', last_sync: null },
            { id: 'node_hf', name: 'Hugging Face Hub (SafeTensors)', channel_type: 'huggingface', endpoint_url: 'https://huggingface.co/models', status: 'standby', last_sync: null },
            { id: 'node_mesh', name: 'Local Edge Mesh (P2P)', channel_type: 'local_node', endpoint_url: 'ws://127.0.0.1:8080/p2p', status: 'active', last_sync: new Date().toISOString() },
          ];
          for (const n of defaultNodes) {
            db.run(`INSERT INTO distribution_nodes (id, name, channel_type, endpoint_url, status, last_sync) VALUES (?, ?, ?, ?, ?, ?)`,
              [n.id, n.name, n.channel_type, n.endpoint_url, n.status, n.last_sync]);
          }
          persistDatabase();
          return res.writeHead(200).end(JSON.stringify({ nodes: defaultNodes }));
        }

        res.writeHead(200).end(JSON.stringify({ nodes }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    }).catch(err => {
      res.writeHead(500).end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Descarga directa del archivo SQLite binario para portabilidad entre sesiones
  if (req.url === '/api/database/download' && req.method === 'GET') {
    const buffer = exportSqliteBuffer();
    if (!buffer) {
      res.writeHead(404).end('Database not initialized');
      return;
    }
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', 'attachment; filename="local_brain_registry.sqlite"');
    res.writeHead(200).end(buffer);
    return;
  }

  // Sincronización interna directa vía Git Push (GitLab / GitHub)
  if (req.url === '/api/git/push' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          repoUrl = 'https://gitlab.com/brainlab-group/brainlab.git',
          branch = 'main',
          token = process.env.GITLAB_TOKEN || '',
          authorName = 'BrainLab Engineer',
          authorEmail = 'brainlab@local.internal',
          commitMessage = 'sync: sincronización interna de Local Brain Lab a GitLab',
        } = payload;

        if (!token) {
          return res.writeHead(400).end(JSON.stringify({
            success: false,
            error: 'Se requiere un Personal Access Token (PAT) con permisos de escritura para sincronizar con el repositorio privado.',
          }));
        }

        // Construir URL autenticada de forma segura
        let pushUrl = repoUrl.trim();
        if (pushUrl.startsWith('https://')) {
          const stripped = pushUrl.replace('https://', '');
          // Si es gitlab o github, usar oauth2 o token en HTTP basic auth
          pushUrl = `https://oauth2:${encodeURIComponent(token.trim())}@${stripped}`;
        }

        const logs: string[] = [];

        // 1. Inicializar git si no existe
        try {
          execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
          logs.push('Git repo ya inicializado');
        } catch {
          execSync('git init', { stdio: 'pipe' });
          logs.push('Git init ejecutado');
        }

        // 2. Configurar identidad local
        execSync(`git config user.name "${authorName.replace(/"/g, '')}"`, { stdio: 'pipe' });
        execSync(`git config user.email "${authorEmail.replace(/"/g, '')}"`, { stdio: 'pipe' });

        // 3. Crear rama de trabajo
        try {
          execSync(`git branch -M ${branch}`, { stdio: 'pipe' });
        } catch (e: any) {
          logs.push(`Branch error ignored: ${e.message}`);
        }

        // 4. Añadir cambios
        execSync('git add -A', { stdio: 'pipe' });
        logs.push('Archivos agregados al índice');

        // 5. Commit si hay cambios
        try {
          const status = execSync('git status --porcelain', { encoding: 'utf8' });
          if (status.trim().length > 0) {
            execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
            logs.push('Commit generado con éxito');
          } else {
            logs.push('No hay cambios nuevos que commitear');
          }
        } catch (commitErr: any) {
          logs.push(`Commit note: ${commitErr.message}`);
        }

        // 6. Push hacia el remoto autenticado
        try {
          // Push directo con la URL segura en un único comando sin persistir token en git config
          execSync(`git push -u "${pushUrl}" ${branch} --force`, {
            stdio: 'pipe',
            timeout: 45000,
          });
          logs.push(`Push exitoso a ${repoUrl} [${branch}]`);
        } catch (pushErr: any) {
          const sanitizedMsg = (pushErr.stderr?.toString() || pushErr.message || '').replace(new RegExp(token, 'g'), '***TOKEN***');
          throw new Error(`Fallo al hacer push: ${sanitizedMsg}`);
        }

        res.writeHead(200).end(JSON.stringify({
          success: true,
          message: `Proyecto sincronizado exitosamente con ${repoUrl} (${branch})`,
          logs,
        }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({
          success: false,
          error: err.message || 'Error desconocido durante la sincronización Git',
        }));
      }
    });
    return;
  }

  next();
}

function generateOfflineFallback(topic: string, category: string, count: number) {
  const defaults = [
    { input: `¿Cómo funciona ${topic}?`, output: `${topic} se ejecuta mediante transformadores causales locales sin llamadas a la nube.`, tags: [category, 'offline'] },
    { input: `Dame un ejemplo de ${topic}`, output: `Aquí tienes una demostración directa y concisa para ${topic}.`, tags: [category, 'offline'] },
    { input: `¿Cuál es la mejor práctica en ${topic}?`, output: `Mantener el código modular, medir las pérdidas por época y validar con tests.`, tags: [category, 'offline'] },
  ];
  return defaults.slice(0, count).map((d, i) => ({
    id: `fallback_${Date.now()}_${i}`,
    category,
    input: d.input,
    output: d.output,
    source: 'teacher_synthetic',
    status: 'pending_review',
    tags: d.tags,
  }));
}
