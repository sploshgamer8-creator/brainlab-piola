/**
 * LOCAL BRAIN LAB — AUDIT TEST SUITE
 * 
 * Verifica desatendidamente la integridad matemática, la prevención de olvido,
 * la serialización SafeTensors y la destilación de conocimiento.
 * 
 * Ejecución: npm run test (o npx tsx scripts/run_audit_tests.ts)
 */

import { NanoGPTModel } from '../src/core/nanogpt_engine';
import { ReplayBuffer } from '../src/training/replay_buffer';
import { SafeTensorsExporter } from '../src/storage/safetensors_exporter';
import { DistillationEngine } from '../src/training/distillation_engine';
import { GPTConfig, CheckpointMetadata } from '../src/core/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 LOCAL BRAIN LAB — TEST SUITE DE AUDITORÍA NUMÉRICA');
  console.log('======================================================\n');

  // ---------------------------------------------------------
  // TEST 1: nanoGPT Math & Gradient Convergence
  // ---------------------------------------------------------
  console.log('--- 1. Verificación Matemática de nanoGPT (Karpathy Core) ---');
  const testConfig: GPTConfig = {
    vocab_size: 64,
    block_size: 16,
    n_layer: 2,
    n_head: 2,
    n_embd: 32,
    dropout: 0.0,
    bias: true,
  };

  const model = new NanoGPTModel(testConfig);
  const inputTokens = [1, 5, 12, 18, 22];
  const targetTokens = [5, 12, 18, 22, 30];

  const initialForward = model.forward(inputTokens, targetTokens);
  assert(initialForward.loss !== null && initialForward.loss > 0, 'Forward pass calcula loss positivo');
  assert(initialForward.logits.length === inputTokens.length * testConfig.vocab_size, 'Logits tienen tamaño T * vocab_size');

  // Entrenar 5 pasos con los mismos tokens
  let currentLoss = initialForward.loss || 0;
  for (let i = 0; i < 5; i++) {
    model.zeroGrad();
    const fwd = model.forward(inputTokens, targetTokens);
    model.backward(fwd.activations);
    model.step(0.01, 0.9, 0.999, 0.0, 1.0);
    currentLoss = fwd.loss || 0;
  }
  const finalFwd = model.forward(inputTokens, targetTokens);
  assert((finalFwd.loss || 0) < (initialForward.loss || 0), 'Descenso de gradiente AdamW reduce el loss tras 5 pasos');

  // ---------------------------------------------------------
  // TEST 2: ReplayBuffer, Deduplicación FNV-1a y Anchors
  // ---------------------------------------------------------
  console.log('\n--- 2. Buffer de Replay Priorizado (PER) & Prevención de Olvido ---');
  const buffer = new ReplayBuffer(100);

  const tokens1 = [10, 20, 30];
  const tokens2 = [20, 30, 40];

  const added1 = buffer.addExperience('function test()', 'return 42 end', tokens1, tokens2, false, 'lua', 2.5);
  const added2 = buffer.addExperience('function test()', 'return 42 end', tokens1, tokens2, false, 'lua', 2.0);
  const added3 = buffer.addExperience('local x = 10', 'print(x)', [5, 6], [6, 7], false, 'lua', 1.2);

  assert(added1 === true, 'Primer elemento insertado correctamente');
  assert(added2 === false, 'Deduplicación FNV-1a detecta y rechaza contenido idéntico');
  assert(added3 === true, 'Segundo elemento único insertado');
  assert(buffer.getStats().totalExperiences === 2, 'Tamaño del buffer refleja deduplicación');

  // Insertar ancla
  buffer.addExperience('local function greet()', 'return "hi" end', [1, 2], [2, 3], true, 'lua', 5.0);
  assert(buffer.getStats().anchorCount === 1, 'Conjunto de anclajes (Anchor Dataset) registrado');

  const sample = buffer.sampleBatch(4, 16);
  assert(sample !== null && sample.inputs.length === 4, 'Muestreo balanceado retorna lote de entrenamiento');

  // ---------------------------------------------------------
  // TEST 3: SafeTensors Binary Exporter (Hugging Face Standard)
  // ---------------------------------------------------------
  console.log('\n--- 3. Serializador Binario SafeTensors (Hugging Face) ---');
  const mockCp: CheckpointMetadata = {
    id: 'cp_test_001',
    name: 'Checkpoint Test',
    version: 1,
    createdAt: new Date().toISOString(),
    branch: 'main',
    step: 150,
    loss: 1.84,
    totalTokensTrained: 5000,
    config: testConfig,
    paramCount: model.getNumParams(),
    history: [{ step: 150, loss: 1.84 }],
    traits: {
      curiosity: 0.8,
      humor: 0.5,
      patience: 0.9,
      formality: 0.4,
      directness: 0.7,
      creativity: 0.8,
      admitUnknown: true,
      naturalDescription: 'Balanced assistant',
    },
    notes: 'Test checkpoint for safetensors',
  };
  (mockCp as any).weights = model.weights;

  const bufferSafeTensors = SafeTensorsExporter.exportToSafeTensors(mockCp);
  assert(bufferSafeTensors instanceof ArrayBuffer, 'SafeTensors exporta un ArrayBuffer binario');
  assert(bufferSafeTensors.byteLength > 8, 'Tamaño del buffer supera los 8 bytes de cabecera');

  // Verificar lectura del header uint64
  const dataView = new DataView(bufferSafeTensors);
  const headerLen = Number(dataView.getBigUint64(0, true));
  assert(headerLen > 0 && headerLen < bufferSafeTensors.byteLength, 'Cabecera uint64 especifica longitud válida');

  // Decodificar JSON header
  const headerBytes = new Uint8Array(bufferSafeTensors, 8, headerLen);
  const headerStr = new TextDecoder('utf-8').decode(headerBytes);
  const headerObj = JSON.parse(headerStr);
  assert(headerObj.__metadata__ !== undefined, 'Cabecera incluye metadatos de arquitectura');
  assert(headerObj.__metadata__.framework === 'LocalBrainLab-nanoGPT', 'Metadatos identifican framework');
  assert(headerObj['transformer.wte.weight'] !== undefined, 'Tensor wte.weight registrado en la cabecera');

  // ---------------------------------------------------------
  // TEST 4: Knowledge Distillation Engine
  // ---------------------------------------------------------
  console.log('\n--- 4. Motor de Destilación de Conocimiento (KD) ---');
  const kdEngine = new DistillationEngine({ alpha: 0.5, temperature: 2.0 });
  const studentLogits = new Float32Array([2.0, 1.0, 0.1, -1.0]);
  const teacherLogits = new Float32Array([2.5, 1.2, 0.0, -1.5]);

  const klDiv = kdEngine.computeKLDivergence(studentLogits, teacherLogits, 2.0);
  assert(typeof klDiv === 'number' && !isNaN(klDiv) && klDiv >= 0, 'Divergencia KL es un valor no negativo');

  kdEngine.updateConfig({ alpha: 0.0 });
  const lossPureCE = kdEngine.computeCombinedLoss(1.5, studentLogits, teacherLogits);
  assert(Math.abs(lossPureCE.totalLoss - 1.5) < 1e-5, 'Con alpha=0.0, la pérdida total coincide exactamente con CrossEntropy');

  kdEngine.updateConfig({ alpha: 0.5 });
  const lossCombined = kdEngine.computeCombinedLoss(1.5, studentLogits, teacherLogits);
  assert(lossCombined.totalLoss > 0, 'Pérdida combinada con alpha=0.5 es calculada positivamente');

  // ---------------------------------------------------------
  // RESULTADOS FINALES
  // ---------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} superados | ${failed} fallidos`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Error fatal ejecutando test suite:', err);
  process.exit(1);
});
