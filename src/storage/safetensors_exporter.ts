/**
 * LOCAL BRAIN LAB — SAFETENSORS EXPORTER
 * 
 * Implementa la especificación estándar SafeTensors de Hugging Face:
 * [8 bytes uint64 Header Length] + [UTF-8 JSON Header] + [Raw Float32 Binary Buffers]
 * 
 * 100% interoperable con Hugging Face, PyTorch y llama.cpp safetensors loaders.
 */

import { CheckpointMetadata, BrainCheckpoint } from '../core/types';

export interface SafeTensorsTensorEntry {
  dtype: 'F32' | 'F16' | 'I32';
  shape: number[];
  data_offsets: [number, number];
}

export interface SafeTensorsHeader {
  __metadata__?: Record<string, string>;
  [tensorName: string]: SafeTensorsTensorEntry | Record<string, string> | undefined;
}

export class SafeTensorsExporter {
  /**
   * Empaqueta los pesos de un CheckpointMetadata en un ArrayBuffer binario formato .safetensors
   */
  public static exportToSafeTensors(checkpoint: CheckpointMetadata | BrainCheckpoint): ArrayBuffer {
    let weights: any = (checkpoint as any).weights;
    if (!weights && checkpoint.weightsSerialized) {
      try {
        weights = typeof checkpoint.weightsSerialized === 'string'
          ? JSON.parse(checkpoint.weightsSerialized)
          : checkpoint.weightsSerialized;
      } catch {
        weights = {};
      }
    }
    weights = weights || {};

    const lossVal = typeof checkpoint.loss === 'number' ? checkpoint.loss : 2.0;

    const headerObj: SafeTensorsHeader = {
      __metadata__: {
        format: 'pt',
        framework: 'LocalBrainLab-nanoGPT',
        architecture: 'NanoGPT',
        step: checkpoint.step.toString(),
        loss: lossVal.toString(),
        vocab_size: checkpoint.config.vocab_size.toString(),
        block_size: checkpoint.config.block_size.toString(),
        n_embd: checkpoint.config.n_embd.toString(),
        n_layer: checkpoint.config.n_layer.toString(),
        n_head: checkpoint.config.n_head.toString(),
      },
    };

    // Calcular offsets de cada tensor
    const tensorsToPack: { name: string; shape: number[]; data: Float32Array }[] = [];
    const { vocab_size, block_size, n_embd, n_layer } = checkpoint.config;

    // Caso 1: Serialización de NanoGPTModel (Array ordenado de tensores)
    if (Array.isArray(weights) && weights.length >= 2) {
      let ptr = 0;
      // wte & wpe
      tensorsToPack.push({
        name: 'transformer.wte.weight',
        shape: [vocab_size, n_embd],
        data: new Float32Array(weights[ptr++]),
      });
      tensorsToPack.push({
        name: 'transformer.wpe.weight',
        shape: [block_size, n_embd],
        data: new Float32Array(weights[ptr++]),
      });

      // Bloques transformer
      for (let l = 0; l < n_layer; l++) {
        tensorsToPack.push({
          name: `transformer.h.${l}.attn.c_attn.weight`,
          shape: [n_embd, 3 * n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.attn.c_attn.bias`,
          shape: [3 * n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.attn.c_proj.weight`,
          shape: [n_embd, n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.attn.c_proj.bias`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.mlp.c_fc.weight`,
          shape: [n_embd, 4 * n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.mlp.c_fc.bias`,
          shape: [4 * n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.mlp.c_proj.weight`,
          shape: [4 * n_embd, n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.mlp.c_proj.bias`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.ln_1.weight`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.ln_1.bias`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.ln_2.weight`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
        tensorsToPack.push({
          name: `transformer.h.${l}.ln_2.bias`,
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
      }

      // ln_f & lm_head
      if (ptr < weights.length) {
        tensorsToPack.push({
          name: 'transformer.ln_f.weight',
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
      }
      if (ptr < weights.length) {
        tensorsToPack.push({
          name: 'transformer.ln_f.bias',
          shape: [n_embd],
          data: new Float32Array(weights[ptr++]),
        });
      }
      if (ptr < weights.length) {
        tensorsToPack.push({
          name: 'lm_head.weight',
          shape: [n_embd, vocab_size],
          data: new Float32Array(weights[ptr++]),
        });
      }
    } else {
      // Caso 2: Objeto asociativo { wte, wpe, blocks... }
      if (weights.wte) {
        tensorsToPack.push({
          name: 'transformer.wte.weight',
          shape: [checkpoint.config.vocab_size, checkpoint.config.n_embd],
          data: weights.wte instanceof Float32Array ? weights.wte : new Float32Array(weights.wte),
        });
      }

      if (weights.wpe) {
        tensorsToPack.push({
          name: 'transformer.wpe.weight',
          shape: [checkpoint.config.block_size, checkpoint.config.n_embd],
          data: weights.wpe instanceof Float32Array ? weights.wpe : new Float32Array(weights.wpe),
        });
      }

      if (weights.blocks && Array.isArray(weights.blocks)) {
        for (let l = 0; l < weights.blocks.length; l++) {
          const b = weights.blocks[l];
          const c_attn = b.c_attn_w || b.c_attn_weight;
          if (c_attn) {
            tensorsToPack.push({
              name: `transformer.h.${l}.attn.c_attn.weight`,
              shape: [3 * checkpoint.config.n_embd, checkpoint.config.n_embd],
              data: c_attn instanceof Float32Array ? c_attn : new Float32Array(c_attn),
            });
          }
          const c_proj = b.c_proj_w || b.c_proj_weight;
          if (c_proj) {
            tensorsToPack.push({
              name: `transformer.h.${l}.attn.c_proj.weight`,
              shape: [checkpoint.config.n_embd, checkpoint.config.n_embd],
              data: c_proj instanceof Float32Array ? c_proj : new Float32Array(c_proj),
            });
          }
          const c_fc = b.mlp_fc_w || b.c_fc_weight;
          if (c_fc) {
            tensorsToPack.push({
              name: `transformer.h.${l}.mlp.c_fc.weight`,
              shape: [4 * checkpoint.config.n_embd, checkpoint.config.n_embd],
              data: c_fc instanceof Float32Array ? c_fc : new Float32Array(c_fc),
            });
          }
          const c_proj_mlp = b.mlp_proj_w || b.c_proj_mlp_weight;
          if (c_proj_mlp) {
            tensorsToPack.push({
              name: `transformer.h.${l}.mlp.c_proj.weight`,
              shape: [checkpoint.config.n_embd, 4 * checkpoint.config.n_embd],
              data: c_proj_mlp instanceof Float32Array ? c_proj_mlp : new Float32Array(c_proj_mlp),
            });
          }
        }
      }
    }

    let currentOffset = 0;
    for (const item of tensorsToPack) {
      const byteLength = item.data.byteLength;
      headerObj[item.name] = {
        dtype: 'F32',
        shape: item.shape,
        data_offsets: [currentOffset, currentOffset + byteLength],
      };
      currentOffset += byteLength;
    }

    // Codificar Header a UTF-8
    const headerStr = JSON.stringify(headerObj);
    const textEncoder = new TextEncoder();
    const headerBytes = textEncoder.encode(headerStr);
    const headerLength = headerBytes.byteLength;

    // Crear buffer total: 8 bytes longitud + headerBytes + buffer de tensores
    const totalBufferSize = 8 + headerLength + currentOffset;
    const finalBuffer = new ArrayBuffer(totalBufferSize);
    const dataView = new DataView(finalBuffer);

    // Escribir 8 bytes uint64 little-endian para la longitud del header
    // Nota: JS soporta BigInt para setBigUint64
    dataView.setBigUint64(0, BigInt(headerLength), true);

    // Escribir Header JSON
    const finalU8 = new Uint8Array(finalBuffer);
    finalU8.set(headerBytes, 8);

    // Escribir Tensores
    let tensorStartInFinal = 8 + headerLength;
    for (const item of tensorsToPack) {
      const u8Source = new Uint8Array(item.data.buffer, item.data.byteOffset, item.data.byteLength);
      finalU8.set(u8Source, tensorStartInFinal);
      tensorStartInFinal += item.data.byteLength;
    }

    return finalBuffer;
  }
}
