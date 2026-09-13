/**
 * 🧬 OneBrain: Model Growth Engine (Cirugía Arquitectónica)
 * 
 * Basado en las técnicas de `llm-grow` (ZeroBlockInsert) y `LLaMA-Pro`.
 * Permite expandir la profundidad de un modelo Transformer (n_layer) 
 * garantizando que al momento de la expansión el conocimiento previo se conserve al 100%:
 * 
 *     max |Logits_old - Logits_new| = 0.000000
 */

import { GPTConfig } from './types';
import { NanoGPTModel, LayerWeights, ModelWeights } from './nanogpt_engine';

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
  let oldLayerIdx = 0;
  let addedSoFar = 0;
  const insertFrequency = Math.max(1, Math.floor(oldConfig.n_layer / additionalLayers));

  for (let l = 0; l < newConfig.n_layer; l++) {
    const isNewLayer = (l % (insertFrequency + 1) === insertFrequency) && (addedSoFar < additionalLayers);

    if (!isNewLayer && oldLayerIdx < oldConfig.n_layer) {
      copyLayerWeights(sourceModel.weights.blocks[oldLayerIdx], newModel.weights.blocks[l]);
      oldLayerIdx++;
    } else {
      initIdentityBlock(newModel.weights.blocks[l], oldConfig.n_embd);
      addedSoFar++;
    }
  }

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
  block.ln1_w.fill(1.0);
  block.ln1_b.fill(0.0);
  block.c_attn_w.fill(0.01);
  block.c_attn_b.fill(0.0);
  block.c_proj_w.fill(0.0);
  block.c_proj_b.fill(0.0);

  block.ln2_w.fill(1.0);
  block.ln2_b.fill(0.0);
  block.mlp_fc_w.fill(0.01);
  block.mlp_fc_b.fill(0.0);
  block.mlp_proj_w.fill(0.0);
  block.mlp_proj_b.fill(0.0);
}

function countWeights(weights: ModelWeights): number {
  let total = weights.wte.length + weights.wpe.length + weights.ln_f_w.length + weights.ln_f_b.length + weights.lm_head_w.length;
  for (const b of weights.blocks) {
    total += b.ln1_w.length + b.ln1_b.length + b.c_attn_w.length + b.c_attn_b.length + b.c_proj_w.length + b.c_proj_b.length;
    total += b.ln2_w.length + b.ln2_b.length + b.mlp_fc_w.length + b.mlp_fc_b.length + b.mlp_proj_w.length + b.mlp_proj_b.length;
  }
  return total;
}
