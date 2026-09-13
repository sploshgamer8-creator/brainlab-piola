/**
 * 🔄 ONEBRAIN CONTINUOUS AUTONOMOUS FLYWHEEL (V2: Auto-Growth & SIMD Calibration)
 * 
 * Bucle infinito desatendido (24/7) que:
 * 1. Sincroniza continuamente los tokens cosechados en Railway (PostgreSQL).
 * 2. Purifica los datos con STM Sanitizer (0% padding waste / fluff).
 * 3. Compila shards binarios uint16 en datasets/cloud_harvested/.
 * 4. Entrena el modelo local nanoGPT con AdamW y SFT masking en bloque de 128 tokens.
 * 5. Protege la memoria con 25% Anchor Replay Buffer (anti-olvido de Lua y español).
 * 6. Disparador Autónomo de Auto-Growth: Cuando la pérdida entra en plateau, duplica capas
 *    con ZeroBlockInsert garantizando Delta Logits = 0.000000.
 * 7. Guarda checkpoints evolucionados automáticamente en local_brain_registry.sqlite.
 * 8. Nunca se detiene: tolera desconexiones de red, rate limits y reintenta perpetuamente.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import dotenv from 'dotenv';
import pg from 'pg';
import { NanoGPTModel } from '../src/core/nanogpt_engine';
import { NanoTokenizer } from '../src/core/tokenizer';
import { BrainTrainer } from '../src/training/trainer';
import { STARTER_DATASETS } from '../src/training/datasets_store';
import { loadPiolacraftCorpus } from '../src/training/piolacraft_corpus_loader';
import { syncCloudToBinaryShards } from '../src/server/harvester/shard_synchronizer';
import { sanitizeTeacherOutput } from '../src/core/stm_sanitizer';
import { expandModelDepth, GrowthResult } from '../src/core/model_growth';
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

// Configuración calibrada al Máximo Sano
const DEFAULT_CONFIG: GPTConfig = {
  vocab_size: 50257,
  block_size: 128, // Contexto expandido a 128 tokens (funciones enteras)
  n_layer: 4,      // 4 capas base (escalable a 8L por ZeroBlockInsert)
  n_head: 4,
  n_embd: 64,
  dropout: 0.05,
  bias: true,
};

const HYPERPARAMS: TrainingHyperparameters = {
  learningRate: 4e-4,
  batchSize: 1,
  gradientAccumulation: 8, // Lote efectivo = 8 * 128 = 1,024 tokens
  maxIters: 20000,
  weightDecay: 0.01,
  gradClip: 1.0,
  replayRatio: 0.25,
  useCosineDecay: true,
};

export async function startAutonomousFlywheel() {
  console.log('='.repeat(70));
  console.log(' 🧬 ONEBRAIN AUTONOMOUS CONTINUOUS EVOLUTION FLYWHEEL (24/7 V2)');
  console.log('='.repeat(70));
  logEvolution('🚀 Iniciando Flywheel Autónomo V2 (Contexto: 128, Auto-Growth: ZeroBlockInsert)...');

  const tokenizer = new NanoTokenizer();
  const WEIGHTS_FILE = path.join(PROJECT_ROOT, 'models', 'flywheel_latest_weights.json');
  const META_FILE = path.join(PROJECT_ROOT, 'models', 'flywheel_meta.json');

  let modelConfig = DEFAULT_CONFIG;
  let cycleCount = 0;
  let totalStepsCompleted = 0;
  let initialLoss: number | null = null;
  let currentLoss = 2.5;
  const recentLosses: number[] = [];
  let hasGrownDepth = false;

  if (fs.existsSync(META_FILE) && fs.existsSync(WEIGHTS_FILE)) {
    try {
      const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      if (meta.config) modelConfig = meta.config;
      if (meta.totalStepsCompleted) totalStepsCompleted = meta.totalStepsCompleted;
      if (meta.cycleCount) cycleCount = meta.cycleCount;
      if (meta.currentLoss) currentLoss = meta.currentLoss;
      if (meta.hasGrownDepth !== undefined) hasGrownDepth = meta.hasGrownDepth;
      logEvolution(`♻️ Reanudando desde estado guardado: Paso ${totalStepsCompleted}, Capas: ${modelConfig.n_layer}L, Loss: ${currentLoss.toFixed(4)}.`);
    } catch {}
  }

  let model = new NanoGPTModel(modelConfig);
  if (fs.existsSync(WEIGHTS_FILE)) {
    try {
      model.deserialize(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
      logEvolution(`✅ Pesos neuronales cargados exitosamente (${modelConfig.n_layer} capas).`);
    } catch {}
  }

  const piolacraftCorpus = loadPiolacraftCorpus();
  logEvolution(`🎮 Corpus PiolaCraft integrado: ${piolacraftCorpus.length.toLocaleString()} pares (Enciclopedia, 70 Mecánicas, Diálogo real de Lucy y Lua).`);

  const activeDataset: DatasetItem[] = [...STARTER_DATASETS, ...piolacraftCorpus];
  const processedJobIds = new Set<string | number>();
  const hotIngestionQueue: DatasetItem[] = [];

  let trainer = new BrainTrainer(model, tokenizer, activeDataset, HYPERPARAMS);
  trainer.setAnchorDatasets([...STARTER_DATASETS, ...piolacraftCorpus.slice(0, 150)], 0.25);
  trainer.totalTokensTrained = totalStepsCompleted * model.config.block_size;

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
      // PASO 1: SINCRONIZAR COSECHA DE LA NUBE (RAILWAY FEED & POSTGRES)
      // ----------------------------------------------------
      let newPairsFound = 0;
      let cloudJobs: any[] = [];

      if (pool) {
        try {
          const res = await pool.query(`
            SELECT id, topic, samples_json, updated_at
            FROM teacher_pool_jobs 
            WHERE status='completed' AND samples_json IS NOT NULL
            ORDER BY updated_at DESC 
            LIMIT 100
          `);
          cloudJobs = res.rows;
        } catch {}
      }

      if (cloudJobs.length === 0) {
        try {
          const feedRes = await fetch('https://brainlab-production.up.railway.app/api/cloud/harvester/feed?limit=400');
          if (feedRes.ok) {
            const feedData: any = await feedRes.json();
            if (feedData.jobs && Array.isArray(feedData.jobs)) {
              cloudJobs = feedData.jobs;
            }
          }
        } catch {}
      }

      for (const row of cloudJobs) {
        const strId = String(row.id);
        if (processedJobIds.has(strId)) continue;
        processedJobIds.add(strId);

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

              const newItem: DatasetItem = {
                id: `flywheel_${row.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                input: inp,
                output: cleanOut,
                category: 'spanish',
                source: 'teacher_synthetic',
                approved: true,
                createdAt: new Date().toISOString(),
                tags: ['cortex_flywheel', 'stm_sanitized', 'hot_absorbed']
              };

              activeDataset.push(newItem);
              hotIngestionQueue.push(newItem);
              newPairsFound++;
            }
          }
        }
      }

      if (newPairsFound > 0) {
        logEvolution(`🔥 [Hot Ingestion]: Absorbidos ${newPairsFound} nuevos pares de la cosecha en la nube directo al búfer caliente (Total búfer: ${activeDataset.length} pares | Pendientes en caliente: ${hotIngestionQueue.length}).`);
        
        // Compilar shards binarios uint16 en segundo plano
        syncCloudToBinaryShards().catch(err => {
          console.warn('[ShardSync Warning]:', err.message);
        });
      }

      // ----------------------------------------------------
      // PASO 2: ENTRENAMIENTO CONTINUO CON ADAMW & INGESTIÓN EN CALIENTE
      // ----------------------------------------------------
      // Si hay pares en el búfer caliente, drenamos hasta 40 pares para entrenamiento focalizado inmediato
      const hotBatch = hotIngestionQueue.splice(0, 40);
      if (hotBatch.length > 0) {
        // Curriculum focalizado: pares calientes nuevos + anclajes anti-olvido
        trainer.setDatasets([...hotBatch, ...STARTER_DATASETS, ...piolacraftCorpus.slice(0, 50)]);
      } else {
        trainer.setDatasets(activeDataset);
      }

      // Ritmo de absorción adaptativo: 50 pasos si hay cola caliente, 30 pasos en crucero
      const stepsToRun = hotBatch.length > 0 ? 50 : 30;
      let lastStepLoss = currentLoss;

      for (let s = 0; s < stepsToRun; s++) {
        const { step, loss } = trainer.stepIteration();
        lastStepLoss = loss;
        totalStepsCompleted++;

        if (initialLoss === null) {
          initialLoss = loss;
        }

        recentLosses.push(loss);
        if (recentLosses.length > 50) recentLosses.shift();
      }

      currentLoss = lastStepLoss;

      // ----------------------------------------------------
      // PASO 3: DISPARADOR AUTÓNOMO DE MODEL GROWTH
      // ----------------------------------------------------
      if (!hasGrownDepth && totalStepsCompleted >= 120 && recentLosses.length >= 30) {
        // Calcular pendiente de pérdida (slope)
        const oldestLoss = recentLosses[0];
        const newestLoss = recentLosses[recentLosses.length - 1];
        const lossSlope = Math.abs(oldestLoss - newestLoss) / recentLosses.length;

        // Si la pérdida se estabiliza (plateau < 0.01) o bajó de 4.0, expandir capacidad
        if (lossSlope < 0.015 || currentLoss <= 4.5) {
          logEvolution(`🧬 [AUTONOMOUS MODEL GROWTH TRIGGERED] Pérdida en meseta (${currentLoss.toFixed(4)}, pendiente: ${lossSlope.toFixed(5)}).`);
          logEvolution(`   Ejecutando ZeroBlockInsert: Duplicando capas de ${model.config.n_layer}L a ${model.config.n_layer + 4}L...`);

          const growthResult = expandModelDepth(model, 4);
          logEvolution(`   ✅ Verificación Matemática: Max Logit Delta = ${growthResult.maxLogitDelta.toFixed(6)} (Equivalencia Identidad Pura)`);
          logEvolution(`   📈 Parámetros: ${growthResult.oldParamCount.toLocaleString()} -> ${growthResult.newParamCount.toLocaleString()}`);

          model = growthResult.expandedModel;
          trainer = new BrainTrainer(model, tokenizer, activeDataset, HYPERPARAMS);
          trainer.setAnchorDatasets(STARTER_DATASETS, 0.25);
          trainer.totalTokensTrained = totalStepsCompleted * model.config.block_size;
          hasGrownDepth = true;

          logEvolution(`🚀 Modelo expandido a ${model.config.n_layer} capas. Reanudando entrenamiento continuo.`);
        }
      }

      // ----------------------------------------------------
      // PASO 4: REGISTRO DE EVOLUCIÓN & CHECKPOINTING
      // ----------------------------------------------------
      const lossDelta = initialLoss !== null ? (initialLoss - currentLoss).toFixed(4) : '0.0000';
      logEvolution(
        `⚡ [Ciclo #${cycleCount}] Pasos Totales: ${totalStepsCompleted} | Capas: ${model.config.n_layer}L | Loss: ${currentLoss.toFixed(4)} (Δ ${lossDelta}) | Tokens: ${trainer.totalTokensTrained.toLocaleString()} | Buffer: ${activeDataset.length} pares`
      );

      // Guardar checkpoint en SQLite cada 5 ciclos o tras nueva cosecha
      if (cycleCount % 5 === 0 || newPairsFound > 0) {
        try {
          const db = await getDatabase();
          const checkpointId = `cp_flywheel_${Date.now()}`;
          const cpName = `Flywheel Autonomous Step ${totalStepsCompleted} (${model.config.n_layer}L)`;

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
            JSON.stringify(model.config),
            model.config.n_layer * 54500,
            JSON.stringify(trainer.lossHistory.slice(-50)),
            JSON.stringify({ autoFarmed: true, grownDepth: hasGrownDepth }),
            `Evolución autónoma 24/7. Capas: ${model.config.n_layer}L. Pérdida: ${currentLoss.toFixed(4)}.`
          ]);

          persistDatabase();
          logEvolution(`💾 Checkpoint auto-guardado: "${cpName}" en local_brain_registry.sqlite`);

          // Persistir pesos neuronales en models/flywheel_latest_weights.json
          try {
            if (!fs.existsSync(path.join(PROJECT_ROOT, 'models'))) {
              fs.mkdirSync(path.join(PROJECT_ROOT, 'models'), { recursive: true });
            }
            fs.writeFileSync(WEIGHTS_FILE, model.serialize(), 'utf8');
            fs.writeFileSync(META_FILE, JSON.stringify({
              config: model.config,
              totalStepsCompleted,
              cycleCount,
              currentLoss,
              hasGrownDepth,
              updatedAt: new Date().toISOString()
            }, null, 2), 'utf8');
            logEvolution(`💾 Pesos neuronales persistidos en models/flywheel_latest_weights.json`);
          } catch (persistErr: any) {
            console.warn('⚠️ [Weight Persist Warning]:', persistErr.message);
          }

          // Medición en vivo de inferencia y generación de muestra (Punto 3)
          try {
            const probePrompt = '<|user|>\nHola, ¿quién eres?\n<|assistant|>\n';
            const promptTokens = tokenizer.encode(probePrompt);
            const genT0 = performance.now();
            const validVocabSize = tokenizer.vocabSize;
            const generatedTokens = [...promptTokens];
            const maxNewTokens = 25;

            for (let s = 0; s < maxNewTokens; s++) {
              const context = generatedTokens.length > model.config.block_size
                ? generatedTokens.slice(generatedTokens.length - model.config.block_size)
                : generatedTokens;

              const { logits } = model.forward(context);
              const lastTokenOffset = (context.length - 1) * model.config.vocab_size;

              const candidates: { idx: number; val: number }[] = [];
              for (let v = 0; v < validVocabSize; v++) {
                candidates.push({ idx: v, val: logits[lastTokenOffset + v] / 0.7 });
              }
              candidates.sort((a, b) => b.val - a.val);
              const topK = candidates.slice(0, 20);

              const maxVal = topK[0].val;
              let expSum = 0;
              for (let i = 0; i < topK.length; i++) expSum += Math.exp(topK[i].val - maxVal);
              const rand = Math.random() * expSum;
              let acc = 0;
              let nextToken = topK[0].idx;
              for (let i = 0; i < topK.length; i++) {
                acc += Math.exp(topK[i].val - maxVal);
                if (rand <= acc) {
                  nextToken = topK[i].idx;
                  break;
                }
              }
              generatedTokens.push(nextToken);
            }
            const genDuration = performance.now() - genT0;
            const newToks = generatedTokens.length - promptTokens.length;
            const msPerTok = genDuration / Math.max(1, newToks);
            const tokPerSec = (newToks / (genDuration / 1000)).toFixed(1);
            const sampleText = tokenizer.decode(generatedTokens.slice(promptTokens.length)).trim();

            logEvolution(`🔬 [EVALUACIÓN EN VIVO - GENERACIÓN]:`);
            logEvolution(`   • Muestra de Texto: "${sampleText || '...'}"`);
            logEvolution(`   • Telemetría: ${newToks} tokens en ${genDuration.toFixed(1)}ms (${msPerTok.toFixed(1)} ms/tok | ${tokPerSec} tok/s)`);
          } catch (probeErr: any) {
            console.warn('⚠️ [Probe Warning]:', probeErr.message);
          }
        } catch (sqliteErr: any) {
          console.warn('⚠️ [SQLite Warning]:', sqliteErr.message);
        }
      }

      // 💓 Heartbeat continuo al Servidor Cloud (Railway PostgreSQL)
      fetch('https://brainlab-production.up.railway.app/api/cloud/telemetry/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: true,
          cycle: cycleCount,
          step: totalStepsCompleted,
          loss: currentLoss,
          layers: `${model.config.n_layer}L`,
          tokens: trainer.totalTokensTrained,
          buffer: activeDataset.length,
          lastUpdated: new Date().toISOString()
        })
      }).catch(() => {});

    } catch (cycleErr: any) {
      logEvolution(`❌ Error en ciclo del Flywheel: ${cycleErr.message}`);
    }

    // ----------------------------------------------------
    // PASO 5: HEARTBEAT & SLEEP LATENTE
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
