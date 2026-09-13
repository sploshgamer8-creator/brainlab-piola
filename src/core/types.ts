/**
 * Core type definitions for Local Brain Lab.
 * Defines the strict separation between:
 * - NEURAL MODEL (nanoGPT architecture & weights)
 * - TRAINING (optimizer, hyperparameters, loss history)
 * - DATASETS (conversations, Lua, multilingual, traits)
 * - PERSONALITY & BEHAVIOR
 * - MEMORY (explicit external key-value, never confused with weights)
 * - EVALUATION (benchmarks, tests, checkpoints scoring)
 * - EXPORT (standalone .brain format)
 */

export interface GPTConfig {
  block_size: number;
  vocab_size: number;
  n_layer: number;
  n_head: number;
  n_embd: number;
  dropout: number;
  bias: boolean;
}

export interface PersonalityTraits {
  curiosity: number; // 0.0 to 1.0
  humor: number;     // 0.0 to 1.0
  patience: number;  // 0.0 to 1.0
  formality: number; // 0.0 to 1.0
  directness: number;// 0.0 to 1.0
  creativity: number;// 0.0 to 1.0
  admitUnknown: boolean;
  naturalDescription: string;
}

export type DatasetCategory = 
  | 'general'
  | 'personality'
  | 'behavior'
  | 'lua'
  | 'spanish'
  | 'english'
  | 'portuguese';

export interface DatasetItem {
  id: string;
  category: DatasetCategory;
  input: string;
  output: string;
  source: 'manual' | 'teacher_synthetic' | 'teacher_gemini' | 'chat_promoted' | 'chat_conversation' | 'synthetic_api' | 'synthetic_rule';
  approved: boolean;
  createdAt: string;
  tags: string[];
}

export interface CheckpointMetadata {
  id: string; // e.g. "brain_0001"
  name: string;
  version: number;
  createdAt: string;
  branch: string; // e.g. "main", "persona_curious", "lua_specialist"
  step: number;
  loss: number;
  totalTokensTrained: number;
  config: GPTConfig;
  paramCount: number;
  history: { step: number; loss: number }[];
  traits: PersonalityTraits;
  notes: string;
  weightsSerialized?: string;
  vocab?: string[];
}

export interface BrainCheckpoint extends CheckpointMetadata {
  weightsSerialized: string; // packed Float32Array encoded as base64 or JSON
  vocab: string[];
}

export interface BrainProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  currentCheckpointId: string;
  checkpoints: CheckpointMetadata[];
  activeBranch: string;
  branches: string[];
  traits: PersonalityTraits;
  multilingualRatio: {
    spanish: number;   // e.g. 50
    english: number;   // e.g. 30
    portuguese: number;// e.g. 20
  };
}

export interface EvaluationTest {
  id: string;
  suite: 'personality' | 'instruction_following' | 'lua' | 'language' | 'unknown' | 'consistency';
  title: string;
  prompt: string;
  expectedPattern: string[]; // keywords or regex to reward
  forbiddenPattern?: string[];
  description: string;
}

export interface EvaluationResult {
  checkpointId: string;
  evaluatedAt: string;
  suiteScores: Record<string, number>; // 0 - 100
  overallScore: number;
  details: {
    testId: string;
    suite: string;
    prompt: string;
    response: string;
    score: number;
    passed: boolean;
    feedback: string;
  }[];
}

export interface ExternalMemoryItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  category: 'user_fact' | 'preference' | 'temporary_context';
  createdAt: string;
}

export interface TrainingHyperparameters {
  learningRate: number;
  batchSize: number;
  gradientAccumulation: number;
  maxIters: number;
  weightDecay: number;
  gradClip: number;
}
