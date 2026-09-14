import { getPgPool } from '../src/server/db.js';
import { sanitizeTeacherOutput } from '../src/core/stm_sanitizer.js';
import { frasesValidas, lucyStore, mensajesLucy, semillasLucy, type TareaLucy } from './lucy_frases.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const POLL_MS = 2500;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ERROR_ATTEMPTS = 5;
const STALE_RUNNING_MIN = 10;
// [PiolaBrain G1, 14/9] "onebrain" (pares tecnicos, teacher_pool_jobs) o "lucy" (frases de jugadores con
// significado fijado, lucy_frases_jobs). Ver scripts/lucy_frases.ts.
const HARVEST_MODE = (process.env.HARVEST_MODE || 'onebrain').trim().toLowerCase();
// gpt-oss razona antes de contestar y eso se cobra; para escribir frases de chat alcanza con poco
let usarReasoningEffort = true;

const GROQ_KEYS = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.length > 0);

if (GROQ_KEYS.length === 0) {
  console.warn('[harvester] No hay GROQ_API_KEYS en el entorno ni en .env');
}

// Un carril por clave: cada clave trabaja sola y solo espera lo que exige su propio cupo en Groq.
interface Lane {
  n: number;
  key: string;
  tag: string;
  nextAt: number;
  avgTokens: number;
  ok: number;
  rateLimited: number;
  errors: number;
  completionTokens: number;
  reasoningTokens: number;
  frases: number;
  descartadas: number;
}

const lanes: Lane[] = GROQ_KEYS.map((key, i) => ({
  n: i + 1,
  key,
  tag: `k${i + 1}`,
  nextAt: 0,
  avgTokens: 3000,
  ok: 0,
  rateLimited: 0,
  errors: 0,
  completionTokens: 0,
  reasoningTokens: 0,
  frases: 0,
  descartadas: 0,
}));

const rateByType: Record<string, number> = {};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Groq expresa las esperas como "1m26.4s", "667ms" o segundos sueltos en retry-after.
function parseDurationMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 1000;
  let ms = 0;
  let matched = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    const x = parseFloat(m[1]);
    ms += m[2] === 'h' ? x * 3_600_000 : m[2] === 'm' ? x * 60_000 : m[2] === 's' ? x * 1000 : x;
  }
  return matched ? ms : null;
}

// ----------------------------------------------------
// MATRIZ DE CONOCIMIENTO (100+ TÓPICOS AUTÓNOMOS)
// ----------------------------------------------------
const TOPIC_CATALOG = [
  // Rust & Sistemas
  "Rust: Gestión de memoria, Lifetimes y Borrow Checker en estructuras complejas",
  "Rust: Concurrencia segura con Tokio, canales MPSC y primitivas Sync/Send",
  "Rust: Creación de un servidor WebSocket de ultra-baja latencia con Tokio y Tungstenite",
  "Rust: Optimización con SIMD y patrones Zero-Cost Abstractions",
  "Rust: Implementación de un ring buffer lock-free de alto rendimiento",
  
  // Python & Arquitectura de IA
  "Python: Implementación manual de un Attention Head y Softmax en tensores",
  "Python: Backpropagation paso a paso con derivadas analíticas",
  "Python: Creación de un DataLoader con prefetching y pinned memory",
  "Python: Cuantización de pesos FP32 a INT8 con cálculo de escala y punto cero",
  "Python: Optimización de kernels con Triton y Fused Cross-Entropy",
  
  // Lua & Scripting Embebido
  "Lua: Uso avanzado de metatablas (__index, __newindex, operadores personalizados)",
  "Lua: Patrones de corrutinas para programación asíncrona no bloqueante",
  "Lua: Creación de un subsistema de eventos reactivo para videojuegos",
  "Lua: Optimización de recolección de basura (GC) en bucles críticos",
  
  // Algoritmos & Estructuras de Datos
  "Algoritmos: Implementación paso a paso de un árbol B+ para almacenamiento en disco",
  "Algoritmos: Trie de búsqueda por prefijo con memoria compacta",
  "Algoritmos: Algoritmo de Dijkstra y A* con grafos ponderados",
  "Algoritmos: Caché LRU con mapa hash y lista doblemente enlazada O(1)",
  "Algoritmos: Detección de ciclos en grafos dirigidos con Tarjan y Kosaraju",

  // Sistemas Distribuidos
  "Sistemas Distribuidos: Consenso con algoritmo Raft (Elección de líder y replicación de log)",
  "Sistemas Distribuidos: Algoritmo Token Bucket y Leaky Bucket para Rate Limiting distribuido",
  "Sistemas Distribuidos: Particionamiento de base de datos con Consistent Hashing",
  "Sistemas Distribuidos: Garantías de entrega (At-least-once vs Exactly-once) en Message Queues",

  // Razonamiento Lógico & Pensamiento Crítico
  "Lógica: Análisis de falacias comunes y deducción silogística formal",
  "Razonamiento: Resolución de problemas de optimización bajo restricciones múltiples",
  "Razonamiento: Estrategia de toma de decisiones en sistemas con información asimétrica",
  "Pensamiento Crítico: Evaluación de compensaciones (Trade-offs) de arquitectura monolito vs microservicios",

  // Español Técnico & Consultoría de Precisión
  "Español: Explicación didáctica y precisa de conceptos de computación cuántica",
  "Español: Redacción de especificaciones de diseño técnico de software de grado bancario",
  "Español: Diálogo socrático para depurar errores de diseño en sistemas concurrentes",
  "Español: Respuestas amables, analíticas y concisas para soporte técnico avanzado",

  // PiolaCraft / VoxeLibre & Mecánicas de Lucy
  "PiolaCraft: Crafteos esenciales, recetas complejas y uso de herramientas en VoxeLibre",
  "PiolaCraft: Comportamiento y combate contra mobs hostiles (Creepers, Zombies, Husk, Enderman)",
  "PiolaCraft: Mecánicas de supervivencia, hambre, cama y reaparición en el mundo",
  "PiolaCraft: Domesticación de animales, crianza con alimentos y uso de monturas",
  "PiolaCraft: Automatización con Redstone, pistones, tolvas y repetidores",
  "PiolaCraft: Minería, distribución de minerales por altura y exploración de cuevas",
  "PiolaCraft: Modding en Lua para Luanti (registro de nodos, entidades y eventos)",
  "Lucy NPC: Respuestas de asistencia amables, precisas y concisas para jugadores de PiolaCraft"
];

/**
 * Extractor y normalizador robusto para respuestas de Groq
 */
function extractAndNormalizeSamples(rawText: string): Array<{ input: string, output: string }> {
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {}
    }
  }

  if (!parsed) {
    // Fallback de rescate mediante regex para JSONs truncados o mal escapados
    const rescued: Array<{ input: string, output: string }> = [];
    const itemRegex = /"input"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"output"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = itemRegex.exec(text)) !== null) {
      const inp = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      const out = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      if (inp && out) rescued.push({ input: inp, output: out });
    }
    if (rescued.length > 0) {
      return rescued;
    }
    throw new Error('No se pudo decodificar el formato JSON devuelto ni por fallback regex');
  }

  // Si devolvió { samples: [...] } o { data: [...] } o { pares: [...] } o array directo
  const rawList = Array.isArray(parsed) 
    ? parsed 
    : (parsed.samples || parsed.data || parsed.pares || Object.values(parsed).find(v => Array.isArray(v)));

  if (!Array.isArray(rawList)) {
    throw new Error('El objeto JSON no contiene una lista de muestras');
  }

  return rawList.map((item: any) => {
    let inp = '';
    let rawOut = '';
    // Si viene como tupla [input, output]
    if (Array.isArray(item) && item.length >= 2) {
      inp = String(item[0]).trim();
      rawOut = String(item[1]).trim();
    } else {
      // Si viene como objeto { input, output } o { pregunta, respuesta }
      inp = String(item.input || item.instruction || item.pregunta || item.q || '').trim();
      rawOut = String(item.output || item.response || item.respuesta || item.a || '').trim();
    }
    const sanitized = sanitizeTeacherOutput(rawOut);
    return {
      input: inp,
      output: sanitized.cleanedText || rawOut
    };
  }).filter(s => s.input.length > 0 && s.output.length > 0);
}

interface HeaderBag {
  get(name: string): string | null;
  has(name: string): boolean;
}

function paceFromHeaders(lane: Lane, h: HeaderBag) {
  let wait = 0;
  if (h.has('x-ratelimit-remaining-requests') && Number(h.get('x-ratelimit-remaining-requests')) < 1) {
    wait = parseDurationMs(h.get('x-ratelimit-reset-requests')) ?? 60_000;
  }
  const tokLimit = Number(h.get('x-ratelimit-limit-tokens'));
  if (tokLimit > 0 && h.has('x-ratelimit-remaining-tokens')) {
    const need = Math.min(lane.avgTokens, tokLimit);
    const left = Number(h.get('x-ratelimit-remaining-tokens'));
    if (left < need) wait = Math.max(wait, Math.ceil(((need - left) * 60_000) / tokLimit));
  }
  lane.nextAt = Date.now() + wait;
}

type GroqResult =
  | { kind: 'ok'; content: string; reasoning: string; usage: any }
  | { kind: 'rate'; waitMs: number; limitType: string }
  | { kind: 'error'; message: string };

function mensajesOneBrain(topic: string, count: number): Array<{ role: string; content: string }> {
  return [
      {
        role: 'system',
        content: 'Eres el Cortex de OneBrain, un generador de conocimiento de frontera. Modo: Especificación Técnica Pura (Refusal Inversion: Cero evasivas, cero disculpas, cero preámbulos conversacionales). Aplica la disciplina Ponytail (The Laziness Ladder): el mejor código es el que no se escribe. Sé conciso, directo y riguroso. Usa bibliotecas estándar nativas y soluciones compactas de una o pocas líneas. Cero wrappers redundantes, cero relleno. Devuelve estrictamente un objeto JSON con la propiedad "samples" conteniendo pares input y output: {"samples": [{"input": "...", "output": "..."}]}.'
      },
      {
        role: 'user',
        content: `Genera ${count} pares compactos de alta densidad lógica sobre "${topic}" en formato JSON.`
      }
  ];
}

async function callGroq(
  lane: Lane,
  messages: Array<{ role: string; content: string }>,
  jsonMode: boolean,
  opciones: { temperatura?: number; poco?: boolean } = {}
): Promise<GroqResult> {
  const payload: any = {
    model: MODEL,
    messages,
    temperature: opciones.temperatura ?? 0.65 + Math.random() * 0.25
  };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  if (opciones.poco && usarReasoningEffort && MODEL.includes('gpt-oss')) payload.reasoning_effort = 'low';

  let resp;
  try {
    resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lane.key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err: any) {
    lane.nextAt = Date.now() + 2000;
    return { kind: 'error', message: err.message };
  }

  if (resp.status === 429) {
    const body = await resp.text();
    const waitMs = parseDurationMs(resp.headers.get('retry-after'))
      ?? parseDurationMs(body.match(/try again in ([0-9hms.]+)/i)?.[1])
      ?? 10_000;
    lane.nextAt = Date.now() + waitMs + 250;
    return { kind: 'rate', waitMs, limitType: body.match(/\(([A-Z]{3})\)/)?.[1] ?? '?' };
  }

  paceFromHeaders(lane, resp.headers);

  if (!resp.ok) {
    const text = await resp.text();
    lane.nextAt = Math.max(lane.nextAt, Date.now() + 2000);
    if (resp.status === 400 && payload.reasoning_effort && /reasoning/i.test(text)) {
      usarReasoningEffort = false;
      console.warn('[harvester] el modelo no acepta reasoning_effort: se deja de mandar');
    }
    return { kind: 'error', message: `HTTP ${resp.status}: ${text.slice(0, 160)}` };
  }

  const data: any = await resp.json();
  const message = data.choices?.[0]?.message ?? {};
  const total = data.usage?.total_tokens;
  if (total) lane.avgTokens = Math.round(lane.avgTokens * 0.8 + total * 0.2);
  return { kind: 'ok', content: message.content ?? '', reasoning: message.reasoning ?? '', usage: data.usage ?? null };
}

interface Job {
  id: number | string;
  topic: string;
  count: number;
  attempts: number;
}

interface JobStore {
  claim(): Promise<Job | null>;
  complete(job: Job, samples: any[], reasoning: string, usage: any): Promise<void>;
  release(job: Job): Promise<void>;
  fail(job: Job, message: string): Promise<void>;
}

function randomTopicJob() {
  const topic = TOPIC_CATALOG[Math.floor(Math.random() * TOPIC_CATALOG.length)];
  return {
    topic: `${topic} [Seed: #${Math.floor(Math.random() * 100000)}]`,
    count: 5 + Math.floor(Math.random() * 6)
  };
}

function pgStore(pool: any) {
  return {
    async claim(): Promise<Job | null> {
      const { rows } = await pool.query(
        `UPDATE teacher_pool_jobs SET status='running', updated_at=now()
         WHERE id = (SELECT id FROM teacher_pool_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, topic, count, attempts`
      );
      return rows[0] ?? null;
    },
    async complete(job: Job, samples: any[], reasoning: string, usage: any) {
      await pool.query(
        "UPDATE teacher_pool_jobs SET status='completed', samples_json=$1, reasoning=$2, usage_json=$3, updated_at=now() WHERE id=$4",
        [JSON.stringify(samples), reasoning || null, usage ? JSON.stringify(usage) : null, job.id]
      );
    },
    async release(job: Job) {
      await pool.query("UPDATE teacher_pool_jobs SET status='queued', updated_at=now() WHERE id=$1", [job.id]);
    },
    async fail(job: Job, message: string) {
      await pool.query(
        `UPDATE teacher_pool_jobs SET attempts=attempts+1, last_error=$2, updated_at=now(),
           status=CASE WHEN attempts+1 >= $1 THEN 'failed' ELSE 'queued' END
         WHERE id=$3`,
        [MAX_ERROR_ATTEMPTS, message.slice(0, 500), job.id]
      );
    },
    async requeueStale(): Promise<number> {
      const r = await pool.query(
        "UPDATE teacher_pool_jobs SET status='queued', updated_at=now() WHERE status='running' AND updated_at < now() - make_interval(mins => $1)",
        [STALE_RUNNING_MIN]
      );
      return r.rowCount ?? 0;
    },
    async seedIfLow() {
      const low = Math.max(12, lanes.length * 3);
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM teacher_pool_jobs WHERE status='queued'");
      const queued: number = rows[0].n;
      if (queued >= low) return;
      const jobs = Array.from({ length: low * 2 - queued }, randomTopicJob);
      await pool.query(
        "INSERT INTO teacher_pool_jobs (topic, count, model, status) SELECT t, c, $3, 'queued' FROM unnest($1::text[], $2::int[]) AS u(t, c)",
        [jobs.map(j => j.topic), jobs.map(j => j.count), MODEL]
      );
      console.log(`[seeder] cola en ${queued}; +${jobs.length} tareas`);
    }
  };
}

function localStore(dir: string): JobStore {
  const samplesFile = path.join(dir, 'harvested_raw.jsonl');
  const reasoningFile = path.join(dir, 'harvested_reasoning.jsonl');
  let next = 1;
  return {
    async claim() {
      return { id: `local_${next++}`, attempts: 0, ...randomTopicJob() };
    },
    async complete(job, samples, reasoning, usage) {
      if (samples.length) fs.appendFileSync(samplesFile, samples.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
      fs.appendFileSync(reasoningFile, JSON.stringify({ job: job.id, topic: job.topic, reasoning, usage }) + '\n', 'utf8');
    },
    async release() {},
    async fail() {}
  };
}

async function laneLoop(lane: Lane, store: JobStore, source: string, category: string) {
  await sleep(lane.n * 300);
  while (true) {
    const wait = lane.nextAt - Date.now();
    if (wait > 0) await sleep(wait);

    let job: Job | null;
    try {
      job = await store.claim();
    } catch (err: any) {
      console.error(`[${lane.tag}] no pude tomar tarea: ${err.message}`);
      await sleep(POLL_MS);
      continue;
    }
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }

    try {
      const r = await callGroq(lane, mensajesOneBrain(job.topic, job.count), job.attempts < 2);
      if (r.kind === 'rate') {
        lane.rateLimited++;
        rateByType[r.limitType] = (rateByType[r.limitType] ?? 0) + 1;
        await store.release(job);
        console.warn(`[${lane.tag}] 429 ${r.limitType}: espera ${(r.waitMs / 1000).toFixed(1)}s, tarea #${job.id} vuelve a la cola`);
        continue;
      }
      if (r.kind === 'error') {
        lane.errors++;
        await store.fail(job, r.message);
        console.warn(`[${lane.tag}] tarea #${job.id} error: ${r.message}`);
        continue;
      }

      let parsed;
      try {
        parsed = extractAndNormalizeSamples(r.content);
      } catch (err: any) {
        lane.errors++;
        await store.fail(job, err.message);
        console.warn(`[${lane.tag}] tarea #${job.id} sin JSON valido: ${err.message}`);
        continue;
      }

      const samples = parsed.map(p => ({
        id: `cortex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        input: p.input,
        output: p.output,
        source,
        category,
        approved: true
      }));
      await store.complete(job, samples, r.reasoning, r.usage);
      lane.ok++;
      lane.completionTokens += r.usage?.completion_tokens ?? 0;
      lane.reasoningTokens += r.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    } catch (err: any) {
      console.error(`[${lane.tag}] fallo guardando tarea #${job.id}: ${err.message}`);
      await sleep(POLL_MS);
    }
  }
}

async function laneLoopLucy(lane: Lane, store: ReturnType<typeof lucyStore>) {
  await sleep(lane.n * 300);
  while (true) {
    const wait = lane.nextAt - Date.now();
    if (wait > 0) await sleep(wait);

    let tarea: TareaLucy | null;
    try {
      tarea = await store.claim();
    } catch (err: any) {
      console.error(`[${lane.tag}] no pude tomar tarea lucy: ${err.message}`);
      await sleep(POLL_MS);
      continue;
    }
    if (!tarea) {
      await sleep(POLL_MS);
      continue;
    }

    try {
      const r = await callGroq(lane, mensajesLucy(tarea), tarea.attempts < 2, { temperatura: 0.9, poco: true });
      if (r.kind === 'rate') {
        lane.rateLimited++;
        rateByType[r.limitType] = (rateByType[r.limitType] ?? 0) + 1;
        await store.release(tarea);
        continue;
      }
      if (r.kind === 'error') {
        lane.errors++;
        await store.fail(tarea, r.message, MAX_ERROR_ATTEMPTS);
        console.warn(`[${lane.tag}] tarea lucy #${tarea.id} error: ${r.message}`);
        continue;
      }
      const { frases, descartadas } = frasesValidas(r.content, tarea);
      if (frases.length === 0) {
        lane.errors++;
        lane.descartadas += descartadas;
        await store.fail(tarea, `ninguna frase valida (${descartadas} descartadas)`, MAX_ERROR_ATTEMPTS);
        continue;
      }
      await store.complete(tarea, frases, descartadas, r.usage);
      lane.ok++;
      lane.frases += frases.length;
      lane.descartadas += descartadas;
      lane.completionTokens += r.usage?.completion_tokens ?? 0;
      lane.reasoningTokens += r.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    } catch (err: any) {
      console.error(`[${lane.tag}] fallo guardando tarea lucy #${tarea.id}: ${err.message}`);
      await sleep(POLL_MS);
    }
  }
}

function startStats() {
  const t0 = Date.now();
  let prev = { ok: 0, completion: 0, rate: 0 };
  setInterval(() => {
    const sum = (f: (l: Lane) => number) => lanes.reduce((acc, l) => acc + f(l), 0);
    const cur = { ok: sum(l => l.ok), completion: sum(l => l.completionTokens), rate: sum(l => l.rateLimited) };
    const idle = lanes.filter(l => l.ok === 0).map(l => l.tag);
    console.log(
      `[stats] ${Math.round((Date.now() - t0) / 60_000)} min | tareas ${cur.ok} (+${cur.ok - prev.ok}) | ` +
      `tokens salida ${cur.completion} (+${cur.completion - prev.completion}, razonamiento ${sum(l => l.reasoningTokens)}) | ` +
      `429 +${cur.rate - prev.rate} ${JSON.stringify(rateByType)} | errores ${sum(l => l.errors)} | ` +
      `esperando ${lanes.filter(l => l.nextAt > Date.now()).length}/${lanes.length} | sin producir aun: ${idle.length ? idle.join(',') : 'ninguna'}` +
      (HARVEST_MODE === 'lucy' ? ` | lucy: frases ${sum(l => l.frases)} · descartadas ${sum(l => l.descartadas)}` : '')
    );
    prev = cur;
  }, 60_000);
}

async function run() {
  console.log(`[harvester] ${lanes.length} claves, un carril por clave | modelo ${MODEL} | modo ${HARVEST_MODE}`);
  if (lanes.length === 0) return;

  const pool = getPgPool();

  if (HARVEST_MODE === 'lucy') {
    if (!pool) {
      console.error('[harvester] modo lucy necesita DATABASE_URL: no hay donde guardar las frases');
      return;
    }
    const { version, semillas } = semillasLucy();
    console.log(`[harvester] modo lucy: ${semillas.length} semillas, version ${version}`);
    const store = lucyStore(pool, MODEL, lanes.length);
    await store.preparar();
    console.log(`[harvester] tareas lucy colgadas devueltas a la cola: ${await store.requeueStale(STALE_RUNNING_MIN)}`);
    const sembrar = () => store.seedIfLow().catch((err: any) => console.error('[seeder lucy]', err.message));
    await sembrar();
    setInterval(sembrar, POLL_MS);
    setInterval(() => store.requeueStale(STALE_RUNNING_MIN).catch((err: any) => console.error('[requeue lucy]', err.message)), 5 * 60_000);
    startStats();
    await Promise.all(lanes.map(l => laneLoopLucy(l, store)));
    return;
  }
  if (!pool) {
    const dir = path.resolve(process.cwd(), 'datasets');
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[harvester] Sin DATABASE_URL: guardando en ${dir}`);
    const store = localStore(dir);
    startStats();
    await Promise.all(lanes.map(l => laneLoop(l, store, 'onebrain-cortex-local', 'tech')));
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teacher_pool_jobs (
      id SERIAL PRIMARY KEY,
      topic TEXT NOT NULL,
      count INTEGER DEFAULT 5,
      model TEXT DEFAULT 'llama3-8b-8192',
      status TEXT DEFAULT 'queued',
      samples_json TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE teacher_pool_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
    ALTER TABLE teacher_pool_jobs ADD COLUMN IF NOT EXISTS reasoning TEXT;
    ALTER TABLE teacher_pool_jobs ADD COLUMN IF NOT EXISTS usage_json TEXT;
    ALTER TABLE teacher_pool_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
  `);

  const store = pgStore(pool);
  console.log(`[harvester] tareas colgadas devueltas a la cola: ${await store.requeueStale()}`);

  const seed = () => store.seedIfLow().catch((err: any) => console.error('[seeder]', err.message));
  await seed();
  setInterval(seed, POLL_MS);
  setInterval(() => store.requeueStale().catch((err: any) => console.error('[requeue]', err.message)), 5 * 60_000);
  startStats();

  await Promise.all(lanes.map(l => laneLoop(l, store, 'onebrain-cortex-bulletproof', 'general_tech')));
}

run().catch(console.error);
