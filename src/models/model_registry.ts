/**
 * LOCAL BRAIN LAB — UNIFIED MODEL REGISTRY
 * 
 * Gestiona el catálogo de modelos en el laboratorio, tanto los estudiantes locales
 * pequeños y entrenables (218K, 3M, 15M) como los modelos grandes de referencia (3B, 7B)
 * que actúan como profesores o motores de inferencia vía llama.cpp o WebLLM.
 */

import { ModelConfig } from '../core/contracts';
import { GPTConfig } from '../core/types';

export type ModelRuntimeType = 'nanogpt_local' | 'llamacpp_gguf' | 'webllm_webgpu' | 'transformers_js';
export type ModelRole = 'student_trainable' | 'teacher_distiller' | 'external_inference';

export interface ModelBenchmarkStats {
  fwdMs: number;
  bwdMs: number;
  stepMs: number;
  tokPerSec: number;
  weightsMB: number;
  trainRAM_MB: number;
  rating: 'ultra_fast' | 'sweet_spot' | 'deep_reasoning' | 'heavy';
}

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
  gptConfig?: GPTConfig;
  benchmark?: ModelBenchmarkStats;
}

export class ModelRegistry {
  private static models: Map<string, RegisteredModel> = new Map([
    [
      'nanogpt-221k-nano',
      {
        id: 'nanogpt-221k-nano',
        name: 'nanoGPT Nano Student (221K)',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal (Karpathy)',
        parameterCount: 220544,
        parameterCountFormatted: '~221K',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 64,
        description: 'Ultra-ágil. Retropropagación en tiempo real en CPU (<150ms/paso). Máxima responsividad en navegador.',
        gptConfig: {
          vocab_size: 128,
          block_size: 64,
          n_embd: 64,
          n_head: 4,
          n_layer: 4,
          dropout: 0.0,
          bias: true,
        },
        benchmark: {
          fwdMs: 68.6,
          bwdMs: 77.7,
          stepMs: 149.6,
          tokPerSec: 156,
          weightsMB: 0.84,
          trainRAM_MB: 2.94,
          rating: 'ultra_fast',
        },
      },
    ],
    [
      'nanogpt-503k-micro',
      {
        id: 'nanogpt-503k-micro',
        name: 'nanoGPT Micro Student (503K) ★ Sweet Spot',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal (Karpathy)',
        parameterCount: 502848,
        parameterCountFormatted: '~503K',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 64,
        description: 'Equilibrio perfecto: 6 heads, embedding 96, vocab 256. ~240ms/paso (~4 pasos/s) con solo 6.7MB RAM.',
        gptConfig: {
          vocab_size: 256,
          block_size: 64,
          n_embd: 96,
          n_head: 6,
          n_layer: 4,
          dropout: 0.0,
          bias: true,
        },
        benchmark: {
          fwdMs: 72.2,
          bwdMs: 160.5,
          stepMs: 240.9,
          tokPerSec: 100,
          weightsMB: 1.92,
          trainRAM_MB: 6.71,
          rating: 'sweet_spot',
        },
      },
    ],
    [
      'nanogpt-1.6m-medium',
      {
        id: 'nanogpt-1.6m-medium',
        name: 'nanoGPT Medium Student (1.6M)',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal (Karpathy)',
        parameterCount: 1596672,
        parameterCountFormatted: '~1.60M',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 128,
        description: 'Capacidad representacional expandida para gramática avanzada y Lua. ~1.45s por paso en CPU.',
        gptConfig: {
          vocab_size: 256,
          block_size: 128,
          n_embd: 144,
          n_head: 6,
          n_layer: 6,
          dropout: 0.0,
          bias: true,
        },
        benchmark: {
          fwdMs: 483.1,
          bwdMs: 932.6,
          stepMs: 1449.8,
          tokPerSec: 26,
          weightsMB: 6.09,
          trainRAM_MB: 21.32,
          rating: 'deep_reasoning',
        },
      },
    ],
    [
      'nanogpt-2.9m-scaled',
      {
        id: 'nanogpt-2.9m-scaled',
        name: 'nanoGPT Scaled Student (2.9M)',
        role: 'student_trainable',
        architecture: 'Transformer Decoder-Only Causal (Karpathy)',
        parameterCount: 2890752,
        parameterCountFormatted: '~2.89M',
        runtime: 'nanogpt_local',
        format: 'in_memory_tensors',
        dtype: 'float32',
        isTrainableLocally: true,
        contextLength: 128,
        description: 'Límite superior para CPU mono-hilo (~2.9s/paso). Recomendado para entrenamientos por lotes en segundo plano.',
        gptConfig: {
          vocab_size: 512,
          block_size: 128,
          n_embd: 192,
          n_head: 6,
          n_layer: 6,
          dropout: 0.0,
          bias: true,
        },
        benchmark: {
          fwdMs: 901.0,
          bwdMs: 1955.6,
          stepMs: 2909.7,
          tokPerSec: 15,
          weightsMB: 11.03,
          trainRAM_MB: 38.60,
          rating: 'heavy',
        },
      },
    ],
    [
      'gpt4o-frontier-teacher',
      {
        id: 'gpt4o-frontier-teacher',
        name: 'GPT-4o / GPT-4 (Profesor de Frontera OpenAI)',
        role: 'teacher_distiller',
        architecture: 'GPT-4 Omni Multimodal Frontier Model',
        parameterCount: 200000000000,
        parameterCountFormatted: '~200B+',
        runtime: 'transformers_js',
        format: 'onnx',
        dtype: 'fp16',
        isTrainableLocally: false,
        contextLength: 128000,
        description: 'Profesor de frontera de máxima capacidad vía API de OpenAI o compatible (gpt-4o, gpt-4o-mini). Supervisa y genera datos sintéticos de alta densidad.',
      },
    ],
    [
      'gemini-2.5-frontier-teacher',
      {
        id: 'gemini-2.5-frontier-teacher',
        name: 'Gemini 2.5 Flash (Profesor de Frontera Google)',
        role: 'teacher_distiller',
        architecture: 'Gemini 2.5 Flash MoE',
        parameterCount: 100000000000,
        parameterCountFormatted: '~100B+',
        runtime: 'transformers_js',
        format: 'onnx',
        dtype: 'fp16',
        isTrainableLocally: false,
        contextLength: 1000000,
        description: 'Profesor de frontera ultra veloz de Google vía API nativa o Gateway OmniRoute.',
      },
    ],
    [
      'qwen2.5-7b-teacher-gguf',
      {
        id: 'qwen2.5-7b-teacher-gguf',
        name: 'Qwen 2.5 7B (Profesor Local GGUF)',
        role: 'teacher_distiller',
        architecture: 'Qwen2ForCausalLM',
        parameterCount: 7610000000,
        parameterCountFormatted: '~7.6B',
        runtime: 'llamacpp_gguf',
        format: 'gguf',
        dtype: 'q4_k_m',
        isTrainableLocally: false,
        contextLength: 4096,
        description: 'Modelo de 7B local de alta capacidad para destilación offline y generación sin internet vía llama.cpp.',
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

  public static getStudentModels(): RegisteredModel[] {
    return Array.from(this.models.values()).filter(m => m.role === 'student_trainable');
  }

  public static getTeacherModels(): RegisteredModel[] {
    return Array.from(this.models.values()).filter(m => m.role === 'teacher_distiller');
  }

  public static registerModel(model: RegisteredModel): void {
    this.models.set(model.id, model);
  }
}
