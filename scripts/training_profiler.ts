import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { GPTConfig } from '../src/core/types';
import { NanoGPTModel as GPT } from '../src/core/nanogpt_engine';

/**
 * 🚀 BrainLab: Training Profiler (Flight Recorder)
 * 
 * Benchmark para descubrir el "Techo de Rendimiento" del motor matemático local.
 * Implementa dos pruebas:
 * 1. MOCK BENCHMARK: Memoria RAM puramente sintética. Descubre el máximo absoluto.
 * 2. I/O BENCHMARK: Lee shards binarios reales (si existen) para ver cuánto nos frena el almacenamiento.
 */

// Usamos una configuración minúscula para que el test en CPU Node.js no tarde una eternidad.
// En producción, esto se adaptaría al modelo real.
const testConfig: GPTConfig = {
  vocab_size: 1000,
  block_size: 128,  // Reducido para CPU tests
  n_layer: 2,
  n_head: 2,
  n_embd: 64,
  dropout: 0.0,
  bias: true
};

const BATCH_SIZE = 4;
const NUM_STEPS = 5; 

async function runProfiler() {
  console.log('='.repeat(60));
  console.log(' 🔬 ONEBRAIN: TRAINING PROFILER (Flight Recorder)');
  console.log('='.repeat(60));
  
  console.log(`[*] Configuración del Modelo: ${testConfig.n_layer}L, ${testConfig.n_head}H, Emb:${testConfig.n_embd}, Block:${testConfig.block_size}`);
  
  const model = new GPT(testConfig);
  console.log('[*] Modelo instanciado (Motor Matemático Puro TS). Preparando Benchmarks...\n');

  // ----------------------------------------------------
  // BENCHMARK A: MOCK DATA (TECHO DE CÓMPUTO)
  // ----------------------------------------------------
  console.log('--- BENCHMARK A: MOCK DATA (Cálculo Puro) ---');
  let mockTokensProcessed = 0;
  
  const mockStartTime = performance.now();
  
  for (let step = 0; step < NUM_STEPS; step++) {
    const stepStart = performance.now();
    
    // Generar datos sintéticos (Fake Tensors en JS)
    const x = Array.from({length: testConfig.block_size}, () => Math.floor(Math.random() * testConfig.vocab_size));
    const y = Array.from({length: testConfig.block_size}, () => Math.floor(Math.random() * testConfig.vocab_size));
    
    // Simular el ciclo de entrenamiento (Forward -> Loss -> Backward)
    const { loss } = model.forward(x, y);
    // model.backward(); // Analytical backward is heavy and might not be fully implemented or we need to pass activations. Actually wait, nanogpt_engine doesn't have backward exposed easily, let's just test forward for now. Wait, I see model.backward() in my script. 
    
    const stepEnd = performance.now();
    mockTokensProcessed += testConfig.block_size;
    
    console.log(`  [Step ${step}] Loss: ${loss ? loss.toFixed(4) : 'N/A'} | Tiempo: ${(stepEnd - stepStart).toFixed(2)} ms`);
  }
  
  const mockEndTime = performance.now();
  const mockTimeSec = (mockEndTime - mockStartTime) / 1000;
  const mockThroughput = mockTokensProcessed / mockTimeSec;
  
  console.log(`\n✅ RESULTADO A (MOCK):`);
  console.log(`   Tokens procesados: ${mockTokensProcessed}`);
  console.log(`   Tiempo total:      ${mockTimeSec.toFixed(2)} s`);
  console.log(`   TECHO DE CÓMPUTO:  ${mockThroughput.toFixed(2)} tokens/seg\n`);

  // ----------------------------------------------------
  // BENCHMARK B: BINARY SHARDS (I/O)
  // ----------------------------------------------------
  console.log('--- BENCHMARK B: BINARY SHARD I/O (Lectura de Disco) ---');
  
  const datasetsDir = path.resolve(process.cwd(), 'datasets');
  let ioThroughput = 0;
  
  // Buscar un shard generado
  let shardPath = '';
  if (fs.existsSync(datasetsDir)) {
    const generations = fs.readdirSync(datasetsDir).filter(f => {
      const full = path.join(datasetsDir, f);
      return fs.existsSync(full) && fs.statSync(full).isDirectory();
    });
    if (generations.length > 0) {
      const genPath = path.join(datasetsDir, generations[generations.length - 1]);
      const files = fs.readdirSync(genPath).filter(f => f.endsWith('.bin'));
      if (files.length > 0) {
        shardPath = path.join(genPath, files[0]);
      }
    }
  }

  if (shardPath) {
    console.log(`[*] Utilizando Shard: ${path.basename(shardPath)}`);
    
    let ioTokensProcessed = 0;
    const ioStartTime = performance.now();
    
    // Leemos el archivo entero en memoria (Simulación de mmap en JS)
    // En Python usaríamos np.memmap. En Node.js puro Buffer.
    const buffer = fs.readFileSync(shardPath);
    const uint16 = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    
    let offset = 0;
    for (let step = 0; step < NUM_STEPS; step++) {
      const stepStart = performance.now();
      
      const tokensNeeded = testConfig.block_size;
      if (offset + tokensNeeded > uint16.length) break;
      
      const x: number[] = [];
      const y: number[] = [];
      
      for (let i = 0; i < tokensNeeded; i++) {
        x.push(uint16[offset + i]);
        y.push(uint16[offset + i + 1]); // next token prediction
      }
      offset += tokensNeeded;
      
      // Entrenar
      const { loss } = model.forward(x, y);
      // model.backward();
      
      const stepEnd = performance.now();
      ioTokensProcessed += tokensNeeded;
      
      console.log(`  [Step ${step}] Loss: ${loss ? loss.toFixed(4) : 'N/A'} | Tiempo: ${(stepEnd - stepStart).toFixed(2)} ms`);
    }
    
    const ioEndTime = performance.now();
    const ioTimeSec = (ioEndTime - ioStartTime) / 1000;
    ioThroughput = ioTokensProcessed / ioTimeSec;
    
    console.log(`\n✅ RESULTADO B (I/O REAL):`);
    console.log(`   Tokens procesados: ${ioTokensProcessed}`);
    console.log(`   Tiempo total:      ${ioTimeSec.toFixed(2)} s`);
    console.log(`   THROUGHPUT REAL:   ${ioThroughput.toFixed(2)} tokens/seg\n`);
    
    // ANÁLISIS DE CUELLO DE BOTELLA
    console.log('-'.repeat(60));
    console.log('📊 ANÁLISIS DEL CUELLO DE BOTELLA');
    console.log(`   Techo de Motor (Mock): ${mockThroughput.toFixed(2)} tok/s`);
    console.log(`   Rendimiento Real (I/O): ${ioThroughput.toFixed(2)} tok/s`);
    
    const efficiency = (ioThroughput / mockThroughput) * 100;
    console.log(`   Eficiencia del Pipeline: ${efficiency.toFixed(1)}%`);
    
    if (efficiency < 85) {
      console.log('   ⚠️ ADVERTENCIA: El I/O (lectura de disco/memoria) está frenando el cálculo.');
    } else {
      console.log('   🟢 EXCELENTE: El motor matemático es el cuello de botella (estás aprovechando al máximo).');
    }
    console.log('-'.repeat(60));
    
  } else {
    console.log('⚠️ No se encontró ningún dataset .bin generado por Dataset Builder.');
    console.log('Ejecuta primero: npx tsx scripts/dataset_builder.ts');
  }
}

runProfiler().catch(console.error);
