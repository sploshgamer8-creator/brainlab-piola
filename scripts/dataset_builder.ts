import fs from 'fs';
import path from 'path';
import { NanoTokenizer } from '../src/core/tokenizer';
import pg from 'pg'; // Usado para conectar al Córtex en producción

/**
 * 🚀 BrainLab: Dataset Builder (Fase 1 del Plan v2)
 * 
 * Este script elimina el JSON y PostgreSQL del "hot path" de entrenamiento.
 * Convierte el conocimiento farmeado en bloques binarios concatenados (padding-free)
 * que el Training Engine puede ingerir directamente mediante mmap().
 */

const BLOCK_SIZE = 1024;
const SHARD_SIZE_TOKENS = 500000; // 500k tokens por shard
const DATASETS_DIR = path.resolve(process.cwd(), 'datasets');

// Obtener PG URL de las variables de entorno
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function buildDataset() {
  console.log('='.repeat(60));
  console.log(' 🧠 ONEBRAIN: DATASET BUILDER (Sequence Packing)');
  console.log('='.repeat(60));

  if (!fs.existsSync(DATASETS_DIR)) fs.mkdirSync(DATASETS_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(DATASETS_DIR, `gen_${stamp}`);
  fs.mkdirSync(outDir);

  const tokenizer = new NanoTokenizer();
  
  let docs: string[] = [];
  let sourceLabel = 'Mock Data (Desconectado del Córtex)';

  if (connectionString && !process.env.MOCK_DATASET) {
    console.log('[*] Conectando a PostgreSQL (Cloud Cortex)...');
    try {
      const pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('railway.internal') ? false : { rejectUnauthorized: false }
      });
      
      const result = await pool.query("SELECT samples_json FROM teacher_pool_jobs WHERE status='completed'");
      for (const row of result.rows) {
        if (row.samples_json) {
          const samples = JSON.parse(row.samples_json);
          for (const s of samples) {
            docs.push(`<|user|>${s.input}<|endoftext|><|assistant|>${s.output}<|endoftext|>`);
          }
        }
      }
      sourceLabel = 'PostgreSQL (Cloud Cortex)';
      console.log(`[*] Descargados ${docs.length} documentos reales desde la nube.`);
      await pool.end();
    } catch (e: any) {
      console.warn(`[WARN] No se pudo conectar a PostgreSQL: ${e.message}. Usando Mock Data.`);
      docs = getMockDocuments();
    }
  } else {
    console.log('[*] DATABASE_URL no definido o MOCK_DATASET activado. Generando datos sintéticos...');
    docs = getMockDocuments();
  }

  if (docs.length === 0) {
    console.error('❌ No hay documentos para procesar.');
    process.exit(1);
  }

  console.log(`[*] Iniciando Sequence Packing (Eliminando Padding)...`);

  let currentBuffer: number[] = [];
  let shardIdx = 0;
  let totalUsefulTokens = 0;
  let totalBlocks = 0;
  
  const manifest: any = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: sourceLabel,
    blockSize: BLOCK_SIZE,
    shardTokenCapacity: SHARD_SIZE_TOKENS,
    tokenByteWidth: 2, // Uint16
    shards: []
  };

  const flushShard = () => {
    if (currentBuffer.length === 0) return;
    const shardName = `shard_${shardIdx.toString().padStart(4, '0')}.bin`;
    const shardPath = path.join(outDir, shardName);
    
    // Uint16 (2 bytes por token)
    const uint16 = new Uint16Array(currentBuffer);
    fs.writeFileSync(shardPath, Buffer.from(uint16.buffer));
    
    manifest.shards.push({
      file: shardName,
      tokens: uint16.length,
      bytes: uint16.byteLength
    });
    
    console.log(`  [+] Guardado: ${shardName} (${uint16.length} tokens, ${(uint16.byteLength / 1024).toFixed(1)} KB)`);
    
    totalBlocks += Math.floor(currentBuffer.length / BLOCK_SIZE);
    shardIdx++;
    currentBuffer = [];
  };

  for (const doc of docs) {
    const tokens = tokenizer.encode(doc);
    currentBuffer.push(...tokens);
    totalUsefulTokens += tokens.length;

    if (currentBuffer.length >= SHARD_SIZE_TOKENS) {
      flushShard();
    }
  }

  // Flush remaining
  if (currentBuffer.length > 0) {
    flushShard();
  }

  // Escribir Manifest
  manifest.totalTokens = totalUsefulTokens;
  manifest.totalBlocks = totalBlocks;
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('-'.repeat(60));
  console.log('✅ REPORTE DE COMPILACIÓN (DATASET BUILDER v2):');
  console.log(`   Tokens crudos procesados: ${totalUsefulTokens}`);
  console.log(`   Desperdicio por padding:  0% (Packing dinámico)`);
  console.log(`   Bloques completos (B=${BLOCK_SIZE}): ${totalBlocks}`);
  console.log(`   Directorio de salida:     ${outDir}`);
  console.log('-'.repeat(60));
}

function getMockDocuments(): string[] {
  const baseDocs = [
    "<|user|>Escribe un script en Python para leer un archivo JSON.<|endoftext|><|assistant|>```python\nimport json\nwith open('data.json') as f:\n    data = json.load(f)\n```<|endoftext|>",
    "<|user|>¿Cuál es el sentido de la vida?<|endoftext|><|assistant|>Según la novela de Douglas Adams, es 42.<|endoftext|>",
    "<|user|>Implementa QuickSort en C++.<|endoftext|><|assistant|>Claro, aquí tienes una implementación de QuickSort...<|endoftext|>",
    "<|user|>¿Cómo se calcula la divergencia KL?<|endoftext|><|assistant|>La divergencia Kullback-Leibler mide la diferencia entre dos distribuciones de probabilidad...<|endoftext|>"
  ];
  
  const massive: string[] = [];
  // 1000 iteraciones x 4 docs = 4000 docs
  for (let i = 0; i < 5000; i++) {
    massive.push(...baseDocs);
  }
  return massive;
}

buildDataset().catch(console.error);
