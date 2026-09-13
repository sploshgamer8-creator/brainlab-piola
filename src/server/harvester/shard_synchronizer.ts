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

  if (!connectionString) {
    return {
      success: false,
      totalTokens: 0,
      shardsCount: 0,
      samplesCount: 0,
      outputDir: OUTPUT_DIR,
      error: 'DATABASE_URL no está configurada.'
    };
  }

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

    if (res.rows.length === 0) {
      await pool.end();
      return {
        success: true,
        totalTokens: 0,
        shardsCount: 0,
        samplesCount: 0,
        outputDir: OUTPUT_DIR
      };
    }

    // Extraer todos los pares limpios
    const allPairs: Array<{ input: string; output: string }> = [];
    for (const row of res.rows) {
      let samples: any = row.samples_json;
      if (typeof samples === 'string') {
        try { samples = JSON.parse(samples); } catch { continue; }
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

    // Tokenización y compilación a binario
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
    await pool.end();

    return {
      success: true,
      totalTokens,
      shardsCount: shardIndex,
      samplesCount: allPairs.length,
      outputDir: OUTPUT_DIR,
      manifest
    };

  } catch (err: any) {
    try { await pool.end(); } catch {}
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
