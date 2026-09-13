import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { NanoTokenizer } from '../src/core/tokenizer';

/**
 * 🏛️ OneBrain: Foundation Dataset Importer
 * 
 * Establece el "Piso Mínimo de Calidad" del modelo:
 * Descarga directamente los datasets de frontera abiertos y verificados
 * que se usaron para reproducir ChatGPT y Claude:
 * 1. Stanford Alpaca (52.000 pares de instrucciones generales y razonamiento)
 * 2. CodeAlpaca (20.000 pares de programación y algoritmos)
 * 
 * Los procesa, empaqueta (sequence-packing) y compila en shards binarios uint16 (.bin)
 * para que sirvan como la base sobre la cual OneBrain aprende.
 */

const BLOCK_SIZE = 1024;
const SHARD_SIZE_TOKENS = 500000;
const OUT_DIR = path.resolve(process.cwd(), 'datasets', 'foundation_baseline');

const SOURCES = [
  {
    name: 'Stanford Alpaca',
    url: 'https://raw.githubusercontent.com/tatsu-lab/stanford_alpaca/main/alpaca_data.json',
    category: 'instruction_reasoning'
  },
  {
    name: 'CodeAlpaca 20k',
    url: 'https://raw.githubusercontent.com/sahil280114/codealpaca/master/data/code_alpaca_20k.json',
    category: 'coding'
  }
];

async function run() {
  console.log('='.repeat(65));
  console.log(' 🏛️ ONEBRAIN: IMPORTADOR DE DATASETS DE FRONTERA BASE');
  console.log('='.repeat(65));

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const tokenizer = new NanoTokenizer();
  const allDocuments: string[] = [];

  for (const src of SOURCES) {
    console.log(`\n[*] Descargando dataset: ${src.name}...`);
    try {
      const resp = await fetch(src.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as Array<any>;
      console.log(`    ✅ Descargados ${data.length.toLocaleString()} ejemplos de ${src.name}.`);

      for (const item of data) {
        const inputPrompt = item.input ? `${item.instruction}\nContexto: ${item.input}` : item.instruction;
        const outputResponse = item.output;

        if (inputPrompt && outputResponse) {
          allDocuments.push(`<|user|>${inputPrompt}<|endoftext|><|assistant|>${outputResponse}<|endoftext|>`);
        }
      }
    } catch (e: any) {
      console.error(`    ❌ Error al descargar ${src.name}: ${e.message}`);
    }
  }

  console.log(`\n[*] Total de documentos de frontera consolidados: ${allDocuments.length.toLocaleString()}`);
  console.log('[*] Compilando en shards binarios empaquetados (Sequence Packing)...');

  let currentBuffer: number[] = [];
  let shardIdx = 0;
  let totalTokens = 0;
  let totalBlocks = 0;

  const manifest: any = {
    version: 1,
    dataset_name: "OneBrain Foundation Baseline",
    generated_at: new Date().toISOString(),
    description: "Piso mínimo de entrenamiento: Stanford Alpaca + CodeAlpaca empaquetados en uint16",
    blockSize: BLOCK_SIZE,
    shardTokenCapacity: SHARD_SIZE_TOKENS,
    tokenByteWidth: 2,
    totalDocuments: allDocuments.length,
    shards: []
  };

  const flushShard = () => {
    if (currentBuffer.length === 0) return;
    const shardName = `foundation_shard_${shardIdx.toString().padStart(4, '0')}.bin`;
    const shardPath = path.join(OUT_DIR, shardName);

    const uint16 = new Uint16Array(currentBuffer);
    fs.writeFileSync(shardPath, Buffer.from(uint16.buffer));

    manifest.shards.push({
      file: shardName,
      tokens: uint16.length,
      bytes: uint16.byteLength
    });

    console.log(`  [+] Shard Base #${shardIdx}: ${shardName} (${uint16.length.toLocaleString()} tokens, ${(uint16.byteLength / 1024).toFixed(1)} KB)`);

    totalBlocks += Math.floor(currentBuffer.length / BLOCK_SIZE);
    shardIdx++;
    currentBuffer = [];
  };

  for (let i = 0; i < allDocuments.length; i++) {
    const tokens = tokenizer.encode(allDocuments[i]);
    currentBuffer.push(...tokens);
    totalTokens += tokens.length;

    if (currentBuffer.length >= SHARD_SIZE_TOKENS) {
      flushShard();
    }

    if ((i + 1) % 15000 === 0 || i === allDocuments.length - 1) {
      console.log(`    Progreso: ${(i + 1).toLocaleString()} / ${allDocuments.length.toLocaleString()} documentos tokenizados...`);
    }
  }

  if (currentBuffer.length > 0) {
    flushShard();
  }

  manifest.totalTokens = totalTokens;
  manifest.totalBlocks = totalBlocks;
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\n' + '-'.repeat(65));
  console.log('✅ PISO MÍNIMO DE ENTRENAMIENTO COMPILADO CON ÉXITO:');
  console.log(`   Documentos de Frontera : ${allDocuments.length.toLocaleString()} pares`);
  console.log(`   Tokens Útiles Reales   : ${totalTokens.toLocaleString()} tokens`);
  console.log(`   Bloques Listos (B=1024): ${totalBlocks.toLocaleString()}`);
  console.log(`   Shards Binarios (.bin) : ${shardIdx}`);
  console.log(`   Ubicación en Disco     : ${OUT_DIR}`);
  console.log('-'.repeat(65));
}

run().catch(console.error);
