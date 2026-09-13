import { GPTConfig } from '../src/core/types';
import { NanoGPTModel, LayerWeights, ModelWeights } from '../src/core/nanogpt_engine';

/**
 * 🧬 OneBrain: Model Growth Engine (Cirugía Arquitectónica)
 * 
 * Basado en las técnicas de `llm-grow` (ZeroBlockInsert) y `LLaMA-Pro`.
 * Permite expandir la profundidad de un modelo Transformer (n_layer) 
 * garantizando que al momento de la expansión el conocimiento previo se conserve al 100%:
 * 
 *     max |Logits_old - Logits_new| = 0.000000
 * 
 * Principio matemático:
 * En un bloque Transformer con residuales:
 *     x_{l+1} = x_l + Attn(LN(x_l)) + MLP(LN(x_l))
 * 
 * Si en las capas insertadas inicializamos la proyección de atención (c_proj) y 
 * la proyección del MLP (mlp_proj) en CERO, entonces:
 *     Attn(x) = 0  y  MLP(x) = 0
 *     x_{l+1} = x_l + 0 + 0 = x_l  (Función Identidad Pura)
 */

export interface GrowthResult {
  expandedModel: NanoGPTModel;
  maxLogitDelta: number;
  oldParamCount: number;
  newParamCount: number;
  genome: any;
}

export function expandModelDepth(sourceModel: NanoGPTModel, additionalLayers: number): GrowthResult {
  const oldConfig = sourceModel.config;
  const newConfig: GPTConfig = {
    ...oldConfig,
    n_layer: oldConfig.n_layer + additionalLayers
  };

  const newModel = new NanoGPTModel(newConfig);

  // 1. Transferencia directa de Embeddings y Cabezal de Salida
  newModel.weights.wte.set(sourceModel.weights.wte);
  newModel.weights.wpe.set(sourceModel.weights.wpe);
  newModel.weights.ln_f_w.set(sourceModel.weights.ln_f_w);
  newModel.weights.ln_f_b.set(sourceModel.weights.ln_f_b);
  newModel.weights.lm_head_w.set(sourceModel.weights.lm_head_w);

  // 2. Estrategia de Inserción Progresiva (Interleaved ZeroBlockInsert)
  // Intercalamos capas viejas con capas nuevas "identidad"
  let oldLayerIdx = 0;
  let addedSoFar = 0;
  const insertFrequency = Math.max(1, Math.floor(oldConfig.n_layer / additionalLayers));

  for (let l = 0; l < newConfig.n_layer; l++) {
    const isNewLayer = (l % (insertFrequency + 1) === insertFrequency) && (addedSoFar < additionalLayers);

    if (!isNewLayer && oldLayerIdx < oldConfig.n_layer) {
      // COPIAR CAPA EXISTENTE (Conserva pesos aprendidos)
      copyLayerWeights(sourceModel.weights.blocks[oldLayerIdx], newModel.weights.blocks[l]);
      oldLayerIdx++;
    } else {
      // INSERTAR NUEVA CAPA CON RESIDUO CERO (Identidad matemática pura)
      initIdentityBlock(newModel.weights.blocks[l], oldConfig.n_embd);
      addedSoFar++;
    }
  }

  // Si sobraron capas viejas por redondeo, colocarlas al final
  while (oldLayerIdx < oldConfig.n_layer && addedSoFar + oldLayerIdx < newConfig.n_layer) {
    copyLayerWeights(sourceModel.weights.blocks[oldLayerIdx], newModel.weights.blocks[addedSoFar + oldLayerIdx]);
    oldLayerIdx++;
  }

  // 3. Verificación Funcional
  const testTokens = [12, 45, 99, 104, 230];
  const oldOutput = sourceModel.forward(testTokens);
  const newOutput = newModel.forward(testTokens);

  let maxLogitDelta = 0;
  for (let i = 0; i < oldOutput.logits.length; i++) {
    const delta = Math.abs(oldOutput.logits[i] - newOutput.logits[i]);
    if (delta > maxLogitDelta) maxLogitDelta = delta;
  }

  const oldParamCount = countWeights(sourceModel.weights);
  const newParamCount = countWeights(newModel.weights);

  const genome = {
    model_id: `onebrain_depth_${newConfig.n_layer}L`,
    timestamp: new Date().toISOString(),
    growth_type: 'depth_upscaling_zeroblock',
    source_layers: oldConfig.n_layer,
    target_layers: newConfig.n_layer,
    parameters_before: oldParamCount,
    parameters_after: newParamCount,
    verification: {
      max_logit_delta: maxLogitDelta,
      functionally_equivalent: maxLogitDelta < 1e-5
    }
  };

  return {
    expandedModel: newModel,
    maxLogitDelta,
    oldParamCount,
    newParamCount,
    genome
  };
}

function copyLayerWeights(src: LayerWeights, dst: LayerWeights) {
  dst.ln1_w.set(src.ln1_w);
  dst.ln1_b.set(src.ln1_b);
  dst.c_attn_w.set(src.c_attn_w);
  dst.c_attn_b.set(src.c_attn_b);
  dst.c_proj_w.set(src.c_proj_w);
  dst.c_proj_b.set(src.c_proj_b);

  dst.ln2_w.set(src.ln2_w);
  dst.ln2_b.set(src.ln2_b);
  dst.mlp_fc_w.set(src.mlp_fc_w);
  dst.mlp_fc_b.set(src.mlp_fc_b);
  dst.mlp_proj_w.set(src.mlp_proj_w);
  dst.mlp_proj_b.set(src.mlp_proj_b);
}

function initIdentityBlock(block: LayerWeights, n_embd: number) {
  // LayerNorms normales
  block.ln1_w.fill(1.0);
  block.ln1_b.fill(0.0);
  block.ln2_w.fill(1.0);
  block.ln2_b.fill(0.0);

  // Atención: proyectores de salida en CERO
  block.c_attn_w.fill(0.01);
  block.c_attn_b.fill(0.0);
  block.c_proj_w.fill(0.0); // <-- PROYECCIÓN CERO (Attn residual = 0)
  block.c_proj_b.fill(0.0);

  // MLP: proyectores de salida en CERO
  block.mlp_fc_w.fill(0.01);
  block.mlp_fc_b.fill(0.0);
  block.mlp_proj_w.fill(0.0); // <-- PROYECCIÓN CERO (MLP residual = 0)
  block.mlp_proj_b.fill(0.0);
}

function countWeights(w: ModelWeights): number {
  let count = w.wte.length + w.wpe.length + w.ln_f_w.length + w.ln_f_b.length + w.lm_head_w.length;
  for (const b of w.blocks) {
    count += b.ln1_w.length + b.ln1_b.length + b.c_attn_w.length + b.c_attn_b.length +
             b.c_proj_w.length + b.c_proj_b.length + b.ln2_w.length + b.ln2_b.length +
             b.mlp_fc_w.length + b.mlp_fc_b.length + b.mlp_proj_w.length + b.mlp_proj_b.length;
  }
  return count;
}

// ----------------------------------------------------
// DEMOSTRACIÓN PRÁCTICA DEL CRECIMIENTO
// ----------------------------------------------------
async function main() {
  console.log('='.repeat(65));
  console.log(' 🧠 ONEBRAIN: MODEL GROWTH ENGINE (ZeroBlockInsert Demo)');
  console.log('='.repeat(65));

  const baseConfig: GPTConfig = {
    vocab_size: 500,
    block_size: 128,
    n_layer: 4,     // Modelo base: 4 capas
    n_head: 4,
    n_embd: 128,
    dropout: 0.0,
    bias: true
  };

  console.log(`[*] Creando modelo base: ${baseConfig.n_layer} capas, emb=${baseConfig.n_embd}...`);
  const baseModel = new NanoGPTModel(baseConfig);

  console.log('[*] Ejecutando expansión por profundidad (+4 capas)...');
  const result = expandModelDepth(baseModel, 4);

  console.log('\n📊 RESULTADOS DE LA CIRUGÍA ARQUITECTÓNICA:');
  console.log(`   Parámetros Originales : ${result.oldParamCount.toLocaleString()} (4 capas)`);
  console.log(`   Parámetros Expandidos : ${result.newParamCount.toLocaleString()} (8 capas)`);
  console.log(`   Crecimiento de Huesos : +${((result.newParamCount / result.oldParamCount - 1) * 100).toFixed(1)}%`);
  console.log('-'.repeat(65));
  console.log(`   🎯 MAX LOGIT DELTA    : ${result.maxLogitDelta.toExponential(6)}`);
  
  if (result.maxLogitDelta < 1e-5) {
    console.log('   🟢 CERTIFICACIÓN: ÉXITO TOTAL. El modelo duplicó su capacidad sin');
    console.log('      cambiar en lo más mínimo sus predicciones actuales.');
    console.log('      ¡Listo para entrar a la Fase 1 de Entrenamiento Congelado!');
  } else {
    console.log('   🔴 ALERTA: La función original sufrió variaciones.');
  }
  console.log('-'.repeat(65));
  console.log('🧬 Genoma generado:');
  console.log(JSON.stringify(result.genome, null, 2));
}

main().catch(console.error);
