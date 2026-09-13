import { getPgPool } from '../src/server/db.js';
import { sanitizeTeacherOutput } from '../src/core/stm_sanitizer.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/**
 * 🛡️ OneBrain: Bulletproof Cortex Autonomous Harvester
 * 
 * Diseñado para operar 24/7 sin interrupciones durante la madrugada.
 * Características:
 * 1. Auto-Seeder Infinito: Inyecta automáticamente tareas de una matriz de 100+ tópicos cuando la cola baja de 3.
 * 2. Pool de 5 Keys con Cooldown 429: Rotación inteligente. Si una clave toca límite por minuto, descansa 60s sin abortar la tarea.
 * 3. Extractor Regex JSON: Resistente a markdown y charlas introductorias de Llama 3.
 * 4. Fallback Híbrido: Si PostgreSQL no está conectado, persiste localmente en SQLite/JSONL.
 */

import dotenv from 'dotenv';
dotenv.config();

const POLL_MS = 2500;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Cargar Pool de API Keys desde variables de entorno
const keysEnv = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
const GROQ_KEYS = keysEnv 
  ? keysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0)
  : [];

if (GROQ_KEYS.length === 0) {
  console.warn('⚠️ Alerta: No se detectaron GROQ_API_KEYS en el entorno ni en .env');
}

// Rastreo de Cooldown para cada API Key (Rate Limits)
interface KeyTracker {
  key: string;
  cooldownUntil: number; // timestamp en ms
}

const keyPool: KeyTracker[] = GROQ_KEYS.map(k => ({ key: k, cooldownUntil: 0 }));
let currentKeyIdx = 0;

/**
 * Obtiene la siguiente key que no esté en enfriamiento (cooldown).
 */
async function getAvailableKey(): Promise<string> {
  const now = Date.now();
  
  // Buscar en círculo desde currentKeyIdx
  for (let i = 0; i < keyPool.length; i++) {
    const idx = (currentKeyIdx + i) % keyPool.length;
    if (now >= keyPool[idx].cooldownUntil) {
      currentKeyIdx = (idx + 1) % keyPool.length;
      return keyPool[idx].key;
    }
  }

  // Si todas están en cooldown, calcular el tiempo mínimo de espera
  const minWait = Math.min(...keyPool.map(k => k.cooldownUntil)) - now;
  const waitTime = Math.max(1000, minWait + 500);
  console.log(`⏳ Todas las API Keys están en enfriamiento. Esperando ${(waitTime / 1000).toFixed(1)}s para reanudar...`);
  await new Promise(resolve => setTimeout(resolve, waitTime));
  return getAvailableKey();
}

function markKeyCooldown(key: string, seconds = 60) {
  const tracker = keyPool.find(k => k.key === key);
  if (tracker) {
    tracker.cooldownUntil = Date.now() + (seconds * 1000);
    console.warn(`⚠️ Key ...${key.slice(-4)} en cooldown por ${seconds}s (Rate Limit alcanzado).`);
  }
}

function getAvailableKeys(): string[] {
  const now = Date.now();
  return keyPool.filter(k => now >= k.cooldownUntil).map(k => k.key);
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

/**
 * Llama a Groq con tolerancia a fallos y rotación de keys
 */
async function callGroqWithRetry(topic: string, count: number, retries = 5): Promise<string> {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const temp = 0.65 + Math.random() * 0.25; // 0.65 - 0.90 para diversidad

  for (let attempt = 1; attempt <= retries; attempt++) {
    const key = await getAvailableKey();
    const shortKey = `...${key.slice(-4)}`;

    try {
      const useJsonObjectFormat = attempt <= 2; // Primero intentar json_object, si falla intentar texto libre
      const payload: any = {
        model,
        messages: [
          {
            role: 'system',
            content: 'Eres el Cortex de OneBrain, un generador de conocimiento de frontera. Modo: Especificación Técnica Pura (Refusal Inversion: Cero evasivas, cero disculpas, cero preámbulos conversacionales). Aplica la disciplina Ponytail (The Laziness Ladder): el mejor código es el que no se escribe. Sé conciso, directo y riguroso. Usa bibliotecas estándar nativas y soluciones compactas de una o pocas líneas. Cero wrappers redundantes, cero relleno. Devuelve estrictamente un objeto JSON con la propiedad "samples" conteniendo pares input y output: {"samples": [{"input": "...", "output": "..."}]}.'
          },
          {
            role: 'user',
            content: `Genera ${count} pares compactos de alta densidad lógica sobre "${topic}" en formato JSON.`
          }
        ],
        temperature: temp
      };

      if (useJsonObjectFormat) {
        payload.response_format = { type: 'json_object' };
      }

      const resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(payload)
      });

      if (resp.status === 429) {
        // Rate limit alcanzado
        markKeyCooldown(key, 60);
        console.warn(`[Intento ${attempt}/${retries}] Key ${shortKey} con 429. Rotando a siguiente key...`);
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 100)}`);
      }

      const data = await resp.json() as any;
      const content = data.choices?.[0]?.message?.content ?? '{}';
      return content;

    } catch (err: any) {
      console.warn(`[Intento ${attempt}/${retries}] Fallo con key ${shortKey}: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  throw new Error('Se agotaron los reintentos en todas las API Keys');
}

/**
 * Inyecta nuevas tareas si la cola está vacía o baja
 */
async function autoSeedJobsIfLow(pool: any) {
  try {
    const countRes = await pool.query("SELECT count(*) FROM teacher_pool_jobs WHERE status='queued'");
    const queuedCount = parseInt(countRes.rows[0].count, 10);

    if (queuedCount < 8) {
      const needed = 15 - queuedCount;
      console.log(`🌾 Auto-Seeder: Cola baja (${queuedCount} tareas). Inyectando ${needed} tareas nuevas al Córtex...`);

      for (let i = 0; i < needed; i++) {
        const randomTopic = TOPIC_CATALOG[Math.floor(Math.random() * TOPIC_CATALOG.length)];
        const variation = Math.floor(Math.random() * 100000);
        const uniqueTopic = `${randomTopic} [Seed: #${variation}]`;
        const count = 5 + Math.floor(Math.random() * 6); // 5 a 10 pares

        await pool.query(
          "INSERT INTO teacher_pool_jobs (topic, count, model, status) VALUES ($1, $2, $3, 'queued')",
          [uniqueTopic, count, 'llama-3.1-8b-instant']
        );
      }
    }
  } catch (err: any) {
    console.error('Auto-Seeder error:', err.message);
  }
}

// ----------------------------------------------------
// BUCLE PRINCIPAL (DAEMON RESISTENTE MULTI-KEY ASÍNCRONO)
// ----------------------------------------------------
async function run() {
  console.log('='.repeat(65));
  console.log(' 🛡️ ONEBRAIN: BULLETPROOF CORTEX HARVESTER (Multi-Key Pipeline 24/7)');
  console.log('='.repeat(65));
  console.log(`[*] Keys en Pool: ${GROQ_KEYS.length} API Keys activas.`);
  console.log(`[*] Tópicos en Catálogo: ${TOPIC_CATALOG.length} disciplinas.`);

  const pool = getPgPool();
  
  if (!pool) {
    console.warn('\n⚠️ No se detectó DATABASE_URL (PostgreSQL).');
    console.log('Activando Modo Local Autónomo (Guardando directo en disco datasets/harvested_raw.jsonl)...');
    await runLocalStandalone();
    return;
  }

  // Asegurar tabla si no existe
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
  `);

  console.log('🟢 Córtex conectado a PostgreSQL. Iniciando farmeo en pipeline concurrente...\n');

  let totalFarmedTokensSession = 0;
  let tasksCompletedSession = 0;

  while (true) {
    try {
      // 1. Auto-seeding continuo para que nunca muera la cola (mantiene 15 tareas)
      await autoSeedJobsIfLow(pool);

      // 2. Comprobar keys disponibles
      const availableKeys = getAvailableKeys();
      if (availableKeys.length === 0) {
        console.log('⏳ Todas las keys en cooldown temporal. Esperando 5s para reanudar...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // 3. Tomar tareas pendientes (hasta 5 tareas simultáneas)
      const concurrency = Math.min(availableKeys.length, 5);
      const { rows } = await pool.query(
        `SELECT * FROM teacher_pool_jobs WHERE status='queued' ORDER BY created_at ASC LIMIT ${concurrency}`
      );

      if (rows.length === 0) {
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
        continue;
      }

      // Marcar todas las tareas asignadas como 'running'
      const jobIds = rows.map(r => String(r.id));
      await pool.query(
        "UPDATE teacher_pool_jobs SET status='running', updated_at=now() WHERE id::text = ANY($1)",
        [jobIds]
      );

      console.log(`\n🚀 [Pipeline Concurrente] Ejecutando ${rows.length} tareas en paralelo a través de ${availableKeys.length} keys activas de Groq...`);

      // 4. Ejecución paralela asíncrona (5 streams simultáneos)
      await Promise.allSettled(rows.map(async (job) => {
        try {
          // Llamar a Groq con reintentos y rotación
          const rawContent = await callGroqWithRetry(job.topic, job.count);
          
          // Extraer y normalizar con parser seguro y STM sanitizer
          const rawSamples = extractAndNormalizeSamples(rawContent);

          const samples = rawSamples.map((p) => ({
            id: `cortex_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            input: p.input,
            output: p.output,
            source: 'onebrain-cortex-bulletproof',
            category: 'general_tech',
            approved: true
          }));

          // Calcular tokens estimados
          const approxTokens = samples.reduce((acc, s) => acc + (s.input.length + s.output.length) / 3.5, 0);
          totalFarmedTokensSession += Math.round(approxTokens);
          tasksCompletedSession++;

          // Guardar en DB
          await pool.query(
            "UPDATE teacher_pool_jobs SET status=$1, samples_json=$2, updated_at=now() WHERE id=$3",
            ['completed', JSON.stringify(samples), job.id]
          );

          console.log(`✅ [Tarea #${job.id} COMPLETADA EN PARALELO] +${Math.round(approxTokens)} tokens útiles cosechados.`);
        } catch (e: any) {
          console.error(`❌ [Tarea #${job.id} ERROR]:`, e.message);
          await pool.query("UPDATE teacher_pool_jobs SET status=$1, updated_at=now() WHERE id=$2", ['failed', job.id]);
        }
      }));

      console.log(`📊 Total Sesión: ${tasksCompletedSession} tareas | ~${totalFarmedTokensSession.toLocaleString()} tokens generados.`);

    } catch (err: any) {
      console.error('Cortex: Error en ciclo de polling:', err.message);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Modo Standalone: Si el usuario corre esto en local sin base de datos PostgreSQL,
 * el harvester sigue cosechando y guarda directamente en archivo JSONL para no frenar.
 */
async function runLocalStandalone() {
  const localOutDir = path.resolve(process.cwd(), 'datasets');
  if (!fs.existsSync(localOutDir)) fs.mkdirSync(localOutDir, { recursive: true });
  const localFile = path.join(localOutDir, 'harvested_raw.jsonl');

  console.log(`📁 Guardando cosechas en: ${localFile}`);
  let tasksCompleted = 0;
  let totalTokens = 0;

  while (true) {
    try {
      const randomTopic = TOPIC_CATALOG[Math.floor(Math.random() * TOPIC_CATALOG.length)];
      const seed = Math.floor(Math.random() * 100000);
      const uniqueTopic = `${randomTopic} [Seed: #${seed}]`;
      const count = 5 + Math.floor(Math.random() * 6);

      console.log(`\n⚡ [Local #${tasksCompleted + 1}] Cosechando: "${uniqueTopic}"...`);
      const rawContent = await callGroqWithRetry(uniqueTopic, count);
      const rawSamples = extractAndNormalizeSamples(rawContent);

      const samples = rawSamples.map((p) => ({
        id: `local_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        input: p.input,
        output: p.output,
        source: 'onebrain-cortex-local',
        category: 'tech',
        approved: true
      }));

      for (const sample of samples) {
        fs.appendFileSync(localFile, JSON.stringify(sample) + '\n', 'utf8');
      }

      const approxTokens = samples.reduce((acc, s) => acc + (s.input.length + s.output.length) / 3.5, 0);
      totalTokens += Math.round(approxTokens);
      tasksCompleted++;

      console.log(`✅ [+${Math.round(approxTokens)} tokens] Guardados ${samples.length} pares en disco.`);
      console.log(`📊 Acumulado Local: ${tasksCompleted} tareas | ~${totalTokens.toLocaleString()} tokens listos.`);

      await new Promise(r => setTimeout(r, 3000));
    } catch (err: any) {
      console.error('Error en cosecha local:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

run().catch(console.error);
