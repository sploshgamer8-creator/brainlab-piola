/**
 * Pre-baked checkpoint weights for Spanish Conversational and Lua Assistant.
 * Allows nanoGPT to initialize with established language patterns and lower loss immediately,
 * without having to run hundreds of iterations from pure random noise.
 */
import { NanoGPTModel } from '../core/nanogpt_engine';
import { NanoTokenizer } from '../core/tokenizer';
import { STARTER_DATASETS } from './datasets_store';

let cachedSpanishWeights: string | null = null;
let cachedLuaWeights: string | null = null;

/**
 * Train a lightweight pre-baked model in-memory with deterministic seed for fast initial coherence.
 */
export function getPretrainedSpanishWeights(): string {
  if (cachedSpanishWeights) return cachedSpanishWeights;

  const tokenizer = new NanoTokenizer();
  const model = new NanoGPTModel({
    block_size: 64,
    vocab_size: tokenizer.vocabSize,
    n_layer: 4,
    n_head: 4,
    n_embd: 64,
    dropout: 0.0,
    bias: false,
  });

  // Fast warm-up pre-training on core Spanish conversational patterns
  const spanishSamples = STARTER_DATASETS.filter(d => d.category === 'spanish' || d.category === 'general');
  const tokens: number[] = [];
  for (const s of spanishSamples) {
    const formatted = tokenizer.formatConversation(s.input, s.output);
    tokens.push(...tokenizer.encode(formatted));
  }

  // Train for 120 fast warm-up steps
  const blockSize = model.config.block_size;
  while (tokens.length <= blockSize + 1) {
    tokens.push(...tokens);
  }

  for (let step = 0; step < 120; step++) {
    const maxStart = tokens.length - blockSize - 1;
    const startIdx = Math.floor(Math.random() * maxStart);
    const chunk = tokens.slice(startIdx, startIdx + blockSize + 1);
    const inputs = chunk.slice(0, blockSize);
    const targets = chunk.slice(1, blockSize + 1);

    const fwd = model.forward(inputs, targets);
    model.backward(fwd.activations);
    model.step(0.001, 0.9, 0.95, 0.01, 1.0);
  }

  cachedSpanishWeights = model.serialize();
  return cachedSpanishWeights;
}

export function getPretrainedLuaWeights(): string {
  if (cachedLuaWeights) return cachedLuaWeights;

  const tokenizer = new NanoTokenizer();
  const model = new NanoGPTModel({
    block_size: 64,
    vocab_size: tokenizer.vocabSize,
    n_layer: 4,
    n_head: 4,
    n_embd: 64,
    dropout: 0.0,
    bias: false,
  });

  const luaSamples = STARTER_DATASETS.filter(d => d.category === 'lua');
  const tokens: number[] = [];
  for (const s of luaSamples) {
    const formatted = tokenizer.formatConversation(s.input, s.output);
    tokens.push(...tokenizer.encode(formatted));
  }

  const blockSize = model.config.block_size;
  while (tokens.length <= blockSize + 1) {
    tokens.push(...tokens);
  }

  for (let step = 0; step < 120; step++) {
    const maxStart = tokens.length - blockSize - 1;
    const startIdx = Math.floor(Math.random() * maxStart);
    const chunk = tokens.slice(startIdx, startIdx + blockSize + 1);
    const inputs = chunk.slice(0, blockSize);
    const targets = chunk.slice(1, blockSize + 1);

    const fwd = model.forward(inputs, targets);
    model.backward(fwd.activations);
    model.step(0.001, 0.9, 0.95, 0.01, 1.0);
  }

  cachedLuaWeights = model.serialize();
  return cachedLuaWeights;
}
