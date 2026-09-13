/**
 * LOCAL BRAIN LAB — COMMON ARCHITECTURAL CONTRACTS
 * 
 * Contratos fundamentales que desacoplan el núcleo de aprendizaje
 * de los runtimes de inferencia externos (llama.cpp, WebLLM, Transformers.js)
 * y permiten escalar de 218K a millones de parámetros.
 */

export type ModelDType = 'float32' | 'float16' | 'bfloat16' | 'q4_0' | 'q4_k_m' | 'q8_0';

export interface ModelConfig {
  name: string;
  architecture: 'nanogpt' | 'llama' | 'qwen' | 'custom_transformer';
  vocabSize: number;
  blockSize: number;
  nEmbeddings: number;
  nHeads: number;
  nLayers: number;
  dropout?: number;
  normType?: 'layernorm' | 'rmsnorm';
  positionalEncoding?: 'learned' | 'rope';
  activation?: 'gelu' | 'silu' | 'swiglu';
  dtype?: ModelDType;
  paramCount?: number;
}

export interface GenerationOptions {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxNewTokens?: number;
  stopTokens?: number[];
  onTokenStream?: (token: number, text: string) => void;
}

export interface GenerationResult {
  tokens: number[];
  text: string;
  durationMs: number;
  tokensPerSecond: number;
}

export interface TrainingBatch {
  inputs: number[][];      // [batchSize, seqLen]
  targets: number[][];     // [batchSize, seqLen]
  weights?: number[];      // [batchSize] para Prioritized Experience Replay
}

export interface TrainingMetrics {
  step: number;
  loss: number;
  perplexity: number;
  gradientNorm: number;
  learningRate: number;
  durationMs: number;
  tokensProcessed: number;
}

export interface CheckpointArtifact {
  id: string;
  modelId: string;
  version: string;
  step: number;
  loss: number;
  valLoss?: number;
  learningRate: number;
  config: ModelConfig;
  weights: Record<string, Float32Array>;
  timestamp: string;
  hash: string;
}

/**
 * Contrato para el estudiante local (modelo entrenable)
 */
export interface BrainModel {
  config: ModelConfig;
  
  forward(tokens: number[], isTraining?: boolean): Float32Array;
  backward(targets: number[]): number;
  step(): void;

  generate(
    inputTokens: number[],
    options?: GenerationOptions
  ): Promise<GenerationResult>;

  train(batch: TrainingBatch): Promise<TrainingMetrics>;
  save(): Promise<CheckpointArtifact>;
  load(checkpoint: CheckpointArtifact): Promise<void>;
}

/**
 * Backend de inferencia desacoplado (para nanoGPT local o adaptadores de 7B)
 */
export interface InferenceBackend {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'evaluator';
  capabilities: {
    canTrain: boolean;
    supportsWebGPU: boolean;
    supportsWASM: boolean;
    maxContextTokens: number;
  };

  initialize(): Promise<void>;
  generate(inputTokens: number[], options?: GenerationOptions): Promise<GenerationResult>;
  unload(): Promise<void>;
}

/**
 * Experiencia para el Replay Buffer (anti-olvido catastrófico)
 */
export interface ExperienceItem {
  id: string;
  hash: string;
  input: string;
  output: string;
  inputTokens: number[];
  targetTokens: number[];
  priority: number;         // Calculado en base a loss + novedad + anclaje
  loss: number;
  usageCount: number;
  isAnchor: boolean;        // Ejemplo de referencia inmutable que nunca se descarta
  category: string;
  createdAt: string;
  lastUsedAt?: string;
}
