/**
 * 🔄 ONEBRAIN CONTINUOUS AUTONOMOUS FLYWHEEL
 * 
 * Bucle infinito desatendido (24/7) que:
 * 1. Sincroniza continuamente los tokens cosechados en Railway (PostgreSQL).
 * 2. Purifica los datos con STM Sanitizer (0% padding waste / fluff).
 * 3. Compila shards binarios uint16 en datasets/cloud_harvested/.
 * 4. Entrena el modelo local nanoGPT (Karpathy Core Float32) con AdamW y SFT masking.
 * 5. Protege la memoria con 25% Anchor Replay Buffer (anti-olvido de Lua y español).
 * 6. Guarda checkpoints evolucionados automáticamente en local_brain_registry.sqlite.
 * 7. Nunca se detiene: tolera desconexiones de red, rate limits y reintenta perpetuamente.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { NanoGPTModel } from '../src/core/nanogpt_engine';
import { NanoTokenizer } from '../src/core/tokenizer';
import { BrainTrainer } from '../src/training/trainer';
import { STARTER_DATASETS } from '../src/training/datasets_store';
import { syncCloudToBinaryShards } from '../src/server/harvester/shard_synchronizer';
import { sanitizeTeacherOutput } from '../src/core/stm_sanitizer';
import { getDatabase, persistDatabase } from '../src/server/db';
import { DatasetItem, GPTConfig, TrainingHyperparameters } from '../src/core/types';

dotenv.config();

const { Pool } = pg;
const PROJECT_ROOT = process.cwd();
const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
const LOG_FILE = path.join(REPORTS_DIR, 'autonomous_evolution.log');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function logEvolution(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch {}
}

const DEFAULT_CONFIG: GPTConfig = {
  vocab_size: 50257,
  block_size: 64,
  n_layer: 4,
  n_head: 4,
  n_embd: 64,
  dropout: 0.05,
  bias: true,
};

const HYPERPARAMS: TrainingHyperparameters = {
  learningRate: 3e-4,
  batchSize: 1,
  gradientAccumulation: 4,
  maxIters: 10000,
  weightDecay: 0.01,
  gradClip: 1.0,
  replayRatio: 0.25,
  useCosineDecay: true,
};

export async function startAutonomousFlywheel() {
  console.log('='.repeat(70));
  console.log(' 🧬 ONEBRAIN AUTONOMOUS CONTINUOUS EVOLUTION FLYWHEEL (24/7)');
  console.log('='.repeat(70));
  logEvolution('🚀 Iniciando Flywheel Autónomo de Entrenamiento Continuo...');

  // 1. Inicializar modelo y tokenizer
  const tokenizer = new NanoTokenizer();
  const model = new NanoGPTModel(DEFAULT_CONFIG);

  const activeDataset: DatasetItem[] = [...STARTER_DATASETS];
  const processedJobIds = new Set<number>();

  const trainer = new BrainTrainer(model, tokenizer, activeDataset, HYPERPARAMS);
  trainer.setAnchorDatasets(STARTER_DATASETS, 0.25);

  let cycleCount = 0;
  let totalStepsCompleted = 0;
  let initialLoss: number | null = null;
  let currentLoss = 2.5;

  const connectionString = process.env.DATABASE_URL;
  let pool: pg.Pool | null = null;
  if (connectionString) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
    });
  }

  while (true) {
    cycleCount++;
    try {
      // ----------------------------------------------------
      // PASO 1: SINCRONIZAR COSECHA DE LA NUBE (RAILWAY)
      // ----------------------------------------------------
      let newPairsFound = 0;

      if (pool) {
        try {
          const res = await pool.query(`
            SELECT id, topic, samples_json 
            FROM teacher_pool_jobs 
            WHERE status='completed' AND samples_json IS NOT NULL
            ORDER BY created_at DESC 
            LIMIT 50
          `);

          for (const row of res.rows) {
            if (processedJobIds.has(row.id)) continue;
            processedJobIds.add(row.id);

            let samples: any = row.samples_json;
            if (typeof samples === 'string') {
              try { samples = JSON.parse(samples); } catch { continue; }
            }

            if (Array.isArray(samples)) {
              for (const s of samples) {
                const inp = String(s.input || s.instruction || '').trim();
                const rawOut = String(s.output || s.response || '').trim();
                if (inp && rawOut) {
                  const cleaned = sanitizeTeacherOutput(rawOut);
                  const cleanOut = cleaned.cleanedText || rawOut;

                  activeDataset.push({
                    id: `flywheel_${row.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    input: inp,
                    output: cleanOut,
                    category: 'spanish',
                    source: 'teacher_synthetic',
                    approved: true,
                    createdAt: new Date().toISOString(),
                    tags: ['cortex_flywheel', 'stm_sanitized']
                  });
                  newPairsFound++;
                }
              }
            }
          }

          if (newPairsFound > 0) {
            trainer.setDatasets(activeDataset);
            logEvolution(`📥 Córtex Cloud: Absorbidos ${newPairsFound} nuevos pares de entrenamiento purificados con STM.`);
            
            // Compilar shards binarios uint16 en segundo plano
            syncCloudToBinaryShards().catch(err => {
              console.warn('[ShardSync Warning]:', err.message);
            });
          }
        } catch (dbErr: any) {
          console.warn('⚠️ [Postgres Aviso]: Error temporal de conexión a la nube, reintentando en siguiente ciclo...', dbErr.message);
        }
      }

      // ----------------------------------------------------
      // PASO 2: ENTRENAMIENTO CONTINUO LOCAL CON ADAMW
      // ----------------------------------------------------
      const stepsToRun = newPairsFound > 0 ? 30 : 10;
      let cycleTokensTrained = 0;
      let lastStepLoss = currentLoss;

      for (let s = 0; s < stepsToRun; s++) {
        const { step, loss } = trainer.stepIteration();
        lastStepLoss = loss;
        cycleTokensTrained += model.config.block_size;
        totalStepsCompleted++;

        if (initialLoss === null) {
          initialLoss = loss;
        }
      }

      currentLoss = lastStepLoss;

      // ----------------------------------------------------
      // PASO 3: REGISTRO DE EVOLUCIÓN & CHECKPOINTING
      // ----------------------------------------------------
      const lossDelta = initialLoss !== null ? (initialLoss - currentLoss).toFixed(4) : '0.0000';
      logEvolution(
        `⚡ [Ciclo #${cycleCount}] Pasos Totales: ${totalStepsCompleted} | Loss Actual: ${currentLoss.toFixed(4)} (Δ ${lossDelta}) | Tokens: ${trainer.totalTokensTrained.toLocaleString()} | Buffer Activo: ${activeDataset.length} pares`
      );

      // Guardar checkpoint en SQLite cada 5 ciclos o tras nueva cosecha
      if (cycleCount % 5 === 0 || newPairsFound > 0) {
        try {
          const db = await getDatabase();
          const checkpointId = `cp_flywheel_${Date.now()}`;
          const cpName = `Flywheel Autonomous Step ${totalStepsCompleted}`;

          db.run(`
            INSERT OR REPLACE INTO brain_checkpoints (
              id, name, version, branch, step, loss, total_tokens_trained,
              config_json, param_count, history_json, traits_json, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            checkpointId,
            cpName,
            cycleCount,
            'flywheel_main',
            totalStepsCompleted,
            currentLoss,
            trainer.totalTokensTrained,
            JSON.stringify(DEFAULT_CONFIG),
            218000,
            JSON.stringify(trainer.lossHistory.slice(-50)),
            JSON.stringify({ autoFarmed: true }),
            `Evolución autónoma 24/7. Pérdida reducida a ${currentLoss.toFixed(4)}.`
          ]);

          persistDatabase();
          logEvolution(`💾 Checkpoint auto-guardado: "${cpName}" en local_brain_registry.sqlite`);
        } catch (sqliteErr: any) {
          console.warn('⚠️ [SQLite Warning]:', sqliteErr.message);
        }
      }

    } catch (cycleErr: any) {
      logEvolution(`❌ Error en ciclo del Flywheel: ${cycleErr.message}`);
    }

    // ----------------------------------------------------
    // PASO 4: HEARTBEAT & SLEEP LATENTE
    // ----------------------------------------------------
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 segundos entre ciclos
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startAutonomousFlywheel().catch(err => {
    console.error('Fatal error en Flywheel:', err);
    process.exit(1);
  });
}
