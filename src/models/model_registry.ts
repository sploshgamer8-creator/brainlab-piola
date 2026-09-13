/**
 * LOCAL BRAIN LAB — UNIFIED MODEL REGISTRY
 * 
 * Gestiona el catálogo de modelos en el laboratorio, tanto los estudiantes locales
 * pequeños y entrenables (218K, 3M, 15M) como los modelos grandes de referencia (3B, 7B)
 * que actúan como profesores o motores de inferencia vía llama.cpp o WebLLM.
 */

import { ModelConfig } from '../core/contracts';

export type ModelRuntimeType = 'nanogpt_local' | 'llamacpp_gguf' | 'webllm_webgpu' | 'transformers_js';
export type ModelRole = 'student_trainable' | 'teacher_distiller' | 'external_inference';

export interface RegisteredModel {
  id: string;
  name: string;
  role: ModelRole;
  architecture: string;
  parameterCount: number;
  parameterCountFormatted: string;
  runtime: ModelRuntimeType;
  format: 'in_memory_tensors' | 'gguf' | 'safetensors' | 'onnx';
  dtype: string;
  isTrainableLocally: boolean;
  contextLength: number;
  description: string;
  config?: ModelConfig;
}

export class ModelRegistry {
  private static models: Map<string, RegisteredModel> = new Map([
    [
      'nanogpt-218k-default',
      {
        id: 'nanogpt-218k-default',
        name: 'nanoGPT Karpathy Student',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal',
        parameterCount: 218432,
        parameterCountFormatted: '~218K',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 64,
        description: 'Modelo estudiante local con retropropagación analítica en Float32Array y optimizador AdamW.',
        config: {
          name: 'nanoGPT Student',
          architecture: 'nanogpt',
          vocabSize: 128,
          blockSize: 64,
          nEmbeddings: 64,
          nHeads: 4,
          nLayers: 4,
          dtype: 'float32',
        },
      },
    ],
    [
      'nanogpt-3m-scaled',
      {
        id: 'nanogpt-3m-scaled',
        name: 'nanoGPT Scaled (3M)',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal',
        parameterCount: 3150000,
        parameterCountFormatted: '~3.1M',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 128,
        description: 'Variante ampliada para entrenamiento experimental con n_embd=192, n_head=6, n_layer=6.',
        config: {
          name: 'nanoGPT 3M',
          architecture: 'nanogpt',
          vocabSize: 512,
          blockSize: 128,
          nEmbeddings: 192,
          nHeads: 6,
          nLayers: 6,
          dtype: 'float32',
        },
      },
    ],
    [
      'qwen2.5-7b-teacher-gguf',
      {
        id: 'qwen2.5-7b-teacher-gguf',
        name: 'Qwen 2.5 7B (Profesor Local)',
        role: 'teacher_distiller',
        architecture: 'Qwen2ForCausalLM',
        parameterCount: 7610000000,
        parameterCountFormatted: '~7.6B',
        runtime: 'llamacpp_gguf',
        format: 'gguf',
        dtype: 'q4_k_m',
        isTrainableLocally: false, // Solo inferencia y destilación
        contextLength: 4096,
        description: 'Modelo de 7B de alta capacidad para destilación offline y generación de datasets sintéticos vía llama.cpp.',
      },
    ],
    [
      'llama3.2-3b-webllm',
      {
        id: 'llama3.2-3b-webllm',
        name: 'Llama 3.2 3B (WebLLM WebGPU)',
        role: 'teacher_distiller',
        architecture: 'LlamaForCausalLM',
        parameterCount: 3210000000,
        parameterCountFormatted: '~3.2B',
        runtime: 'webllm_webgpu',
        format: 'onnx',
        dtype: 'q4_0',
        isTrainableLocally: false,
        contextLength: 2048,
        description: 'Ejecución directa en el navegador sobre WebGPU mediante MLC WebLLM.',
      },
    ],
  ]);

  public static listModels(): RegisteredModel[] {
    return Array.from(this.models.values());
  }

  public static getModel(id: string): RegisteredModel | undefined {
    return this.models.get(id);
  }

  public static registerModel(model: RegisteredModel): void {
    this.models.set(model.id, model);
  }
}
