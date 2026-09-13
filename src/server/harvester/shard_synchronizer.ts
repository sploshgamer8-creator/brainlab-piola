/**
 * Continuous Cloud-to-Binary Shard Synchronizer
 * Descarga los pares cosechados de la nube (PostgreSQL en Railway),
 * los tokeniza con NanoTokenizer y los compila en shards binarios uint16
 * en datasets/cloud_harvested/ sin desperdicio de relleno (0% padding waste).
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { NanoTokenizer } from '../../core/tokenizer';
import { sanitizeTeacherOutput } from '../../core/stm_sanitizer';
import { repairAndParseJson } from '../../core/json_repair';

const { Pool } = pg;
const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'datasets', 'cloud_harvested');
const SHARD_SIZE = 500_000; // 500k tokens por shard

export interface ShardSyncResult {
  success: boolean;
  totalTokens: number;
  shardsCount: number;
  samplesCount: number;
  outputDir: string;
  error?: string;
  manifest?: any;
}

export function getCloudShardsStatus(): {
  manifestExists: boolean;
  totalTokens: number;
  shardsCount: number;
  samplesCount: number;
  updatedAt?: string;
  outputDir: string;
} {
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        manifestExists: true,
        totalTokens: data.total_tokens || 0,
        shardsCount: data.shards_count || 0,
        samplesCount: data.samples_count || 0,
        updatedAt: data.updated_at,
        outputDir: OUTPUT_DIR
      };
    } catch {
      // Fallback below
    }
  }
  return {
    manifestExists: false,
    totalTokens: 0,
    shardsCount: 0,
    samplesCount: 0,
    outputDir: OUTPUT_DIR
  };
}

export async function syncCloudToBinaryShards(): Promise<ShardSyncResult> {
  const connectionString = process.env.DATABASE_URL;
  const cloudUrl = process.env.CLOUD_HARVEST_URL || 'https://brainlab-production.up.railway.app';
  const allPairs: Array<{ input: string; output: string }> = [];

  // 1. Conexión directa a PostgreSQL si DATABASE_URL está presente
  if (connectionString) {
    const pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
    });

    try {
      const client = await pool.connect();
      const res = await client.query(`
        SELECT id, topic, samples_json 
        FROM teacher_pool_jobs 
        WHERE status='completed' AND samples_json IS NOT NULL
        ORDER BY created_at ASC
      `);
      client.release();

      for (const row of res.rows) {
        let samples: any = row.samples_json;
        if (typeof samples === 'string') {
          samples = repairAndParseJson(samples);
        }
        if (Array.isArray(samples)) {
          for (const s of samples) {
            const inp = String(s.input || s.instruction || '').trim();
            const rawOut = String(s.output || s.response || '').trim();
            if (inp && rawOut) {
              const sanitized = sanitizeTeacherOutput(rawOut);
              const cleanOut = sanitized.cleanedText || rawOut;
              allPairs.push({ input: inp, output: cleanOut });
            }
          }
        }
      }
      await pool.end();
    } catch (dbErr: any) {
      console.warn(`[WARN] Conexión directa PostgreSQL no disponible: ${dbErr.message}`);
    }
  }

  // 2. Si no hay pares de DB directa, consultar la API HTTP en Railway
  if (allPairs.length === 0) {
    try {
      console.log(`[+] Conectando a la nube vía HTTP: ${cloudUrl}/api/cloud/harvester/export-samples...`);
      const httpRes = await fetch(`${cloudUrl}/api/cloud/harvester/export-samples?limit=5000`);
      if (httpRes.ok) {
        const data: any = await httpRes.json();
        if (data.success && Array.isArray(data.samples)) {
          for (const s of data.samples) {
            const inp = String(s.input || '').trim();
            const rawOut = String(s.output || '').trim();
            if (inp && rawOut) {
              const sanitized = sanitizeTeacherOutput(rawOut);
              allPairs.push({ input: inp, output: sanitized.cleanedText || rawOut });
            }
          }
          console.log(`[OK] Descargados ${allPairs.length} pares desde la nube.`);
        }
      }
    } catch (httpErr: any) {
      console.warn(`[WARN] Sincronización HTTP con Railway en espera: ${httpErr.message}`);
    }
  }

  // 3. Absorber datasets/harvested_raw.jsonl si existe
  const rawFile = path.join(PROJECT_ROOT, 'datasets', 'harvested_raw.jsonl');
  if (fs.existsSync(rawFile)) {
    try {
      const content = fs.readFileSync(rawFile, 'utf8');
      const lines = content.split('\n');
      let rawCount = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const inp = String(item.input || '').trim();
          const out = String(item.output || '').trim();
          if (inp && out) {
            allPairs.push({ input: inp, output: out });
            rawCount++;
          }
        } catch {}
      }
      if (rawCount > 0) {
        console.log(`[+] Integrados ${rawCount} pares locales desde harvested_raw.jsonl.`);
      }
    } catch {}
  }

  if (allPairs.length === 0) {
    return {
      success: false,
      totalTokens: 0,
      shardsCount: 0,
      samplesCount: 0,
      outputDir: OUTPUT_DIR,
      error: 'No se encontraron pares en PostgreSQL, API de Railway ni harvested_raw.jsonl.'
    };
  }

  // Tokenización y compilación a binario
  try {
    const tokenizer = new NanoTokenizer();
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    let currentShardTokens: number[] = [];
    let shardIndex = 0;
    let totalTokens = 0;

    const flushShard = () => {
      if (currentShardTokens.length === 0) return;
      const shardFileName = `cloud_shard_${String(shardIndex).padStart(4, '0')}.bin`;
      const shardPath = path.join(OUTPUT_DIR, shardFileName);
      
      const buffer = Buffer.alloc(currentShardTokens.length * 2);
      for (let i = 0; i < currentShardTokens.length; i++) {
        buffer.writeUInt16LE(currentShardTokens[i], i * 2);
      }
      fs.writeFileSync(shardPath, buffer);
      shardIndex++;
      currentShardTokens = [];
    };

    for (const pair of allPairs) {
      const text = `<|user|>\n${pair.input}\n<|assistant|>\n${pair.output}<|endoftext|>\n`;
      const tokens = tokenizer.encode(text);
      totalTokens += tokens.length;

      for (const t of tokens) {
        currentShardTokens.push(t);
        if (currentShardTokens.length >= SHARD_SIZE) {
          flushShard();
        }
      }
    }

    // Guardar tokens residuales
    if (currentShardTokens.length > 0) {
      flushShard();
    }

    const manifest = {
      dataset_name: 'onebrain_cloud_harvested',
      source: 'railway_postgresql_cortex',
      shards_count: shardIndex,
      total_tokens: totalTokens,
      samples_count: allPairs.length,
      token_format: 'uint16',
      endianness: 'little_endian',
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    return {
      success: true,
      totalTokens,
      shardsCount: shardIndex,
      samplesCount: allPairs.length,
      outputDir: OUTPUT_DIR,
      manifest
    };

  } catch (err: any) {
    return {
      success: false,
      totalTokens: 0,
      shardsCount: 0,
      samplesCount: 0,
      outputDir: OUTPUT_DIR,
      error: err.message
    };
  }
}
