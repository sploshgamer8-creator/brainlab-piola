/**
 * nanoGPT Pure Neural Engine (TypeScript)
 * Direct mathematical implementation of Andrej Karpathy's nanoGPT architecture.
 *
 * References:
 * - https://github.com/karpathy/nanoGPT/blob/master/model.py
 *
 * Implements:
 * 1. GPTConfig
 * 2. Token & Position Embeddings (wte, wpe)
 * 3. LayerNorm (ln_1, ln_2, ln_f) with gain & bias
 * 4. CausalSelfAttention (Multi-Head causal attention with triangular masking)
 * 5. MLP (c_fc, exact GELU, c_proj)
 * 6. Residual connections
 * 7. Linear LM Head
 * 8. Cross-Entropy Loss
 * 9. Analytical Backpropagation (Autograd / Exact gradients)
 * 10. AdamW Optimizer with gradient clipping & weight decay
 * 11. Autoregressive Sampling (temperature & top-k)
 */

import { GPTConfig } from './types';

// Fast GELU approximation matching Karpathy's nanoGPT
export function gelu(x: number): number {
  return 0.5 * x * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
}

export function geluDeriv(x: number): number {
  const c = Math.sqrt(2.0 / Math.PI);
  const tanhArg = c * (x + 0.044715 * Math.pow(x, 3));
  const t = Math.tanh(tanhArg);
  const sech2 = 1.0 - t * t;
  const dInner = c * (1.0 + 3.0 * 0.044715 * x * x);
  return 0.5 * (1.0 + t) + 0.5 * x * sech2 * dInner;
}

export interface LayerWeights {
  // ln_1
  ln1_w: Float32Array; // (n_embd)
  ln1_b: Float32Array; // (n_embd)
  // attn: c_attn maps n_embd -> 3 * n_embd
  c_attn_w: Float32Array; // (n_embd, 3 * n_embd)
  c_attn_b: Float32Array; // (3 * n_embd)
  // attn: c_proj maps n_embd -> n_embd
  c_proj_w: Float32Array; // (n_embd, n_embd)
  c_proj_b: Float32Array; // (n_embd)
  // ln_2
  ln2_w: Float32Array; // (n_embd)
  ln2_b: Float32Array; // (n_embd)
  // mlp: c_fc maps n_embd -> 4 * n_embd
  mlp_fc_w: Float32Array; // (n_embd, 4 * n_embd)
  mlp_fc_b: Float32Array; // (4 * n_embd)
  // mlp: c_proj maps 4 * n_embd -> n_embd
  mlp_proj_w: Float32Array; // (4 * n_embd, n_embd)
  mlp_proj_b: Float32Array; // (n_embd)
}

export interface ModelWeights {
  wte: Float32Array;    // (vocab_size, n_embd)
  wpe: Float32Array;    // (block_size, n_embd)
  blocks: LayerWeights[];
  ln_f_w: Float32Array; // (n_embd)
  ln_f_b: Float32Array; // (n_embd)
  lm_head_w: Float32Array; // (n_embd, vocab_size)
}

export class NanoGPTModel {
  config: GPTConfig;
  weights: ModelWeights;
  grads: ModelWeights;
  m: ModelWeights; // AdamW 1st moment
  v: ModelWeights; // AdamW 2nd moment
  stepCount: number = 0;

  constructor(config: GPTConfig, seed = 1337) {
    this.config = config;
    this.weights = this.allocateWeights();
    this.grads = this.allocateWeights();
    this.m = this.allocateWeights();
    this.v = this.allocateWeights();
    this.initWeights(seed);
  }

  private allocateWeights(): ModelWeights {
    const { vocab_size, block_size, n_layer, n_embd } = this.config;
    const blocks: LayerWeights[] = [];

    for (let l = 0; l < n_layer; l++) {
      blocks.push({
        ln1_w: new Float32Array(n_embd),
        ln1_b: new Float32Array(n_embd),
        c_attn_w: new Float32Array(n_embd * 3 * n_embd),
        c_attn_b: new Float32Array(3 * n_embd),
        c_proj_w: new Float32Array(n_embd * n_embd),
        c_proj_b: new Float32Array(n_embd),
        ln2_w: new Float32Array(n_embd),
        ln2_b: new Float32Array(n_embd),
        mlp_fc_w: new Float32Array(n_embd * 4 * n_embd),
        mlp_fc_b: new Float32Array(4 * n_embd),
        mlp_proj_w: new Float32Array(4 * n_embd * n_embd),
        mlp_proj_b: new Float32Array(n_embd),
      });
    }

    return {
      wte: new Float32Array(vocab_size * n_embd),
      wpe: new Float32Array(block_size * n_embd),
      blocks,
      ln_f_w: new Float32Array(n_embd),
      ln_f_b: new Float32Array(n_embd),
      lm_head_w: new Float32Array(n_embd * vocab_size),
    };
  }

  // Deterministic PRNG
  private randomGaussian(rng: () => number, mean = 0, std = 0.02): number {
    const u1 = Math.max(1e-7, rng());
    const u2 = rng();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * std;
  }

  public initWeights(seed = 1337): void {
    let s = seed;
    const lcg = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    const { vocab_size, block_size, n_layer, n_embd } = this.config;
    const std = 0.02;
    const projStd = 0.02 / Math.sqrt(2 * n_layer); // GPT-2 special scaled init for residual projections

    // Init wte & wpe
    for (let i = 0; i < this.weights.wte.length; i++) {
      this.weights.wte[i] = this.randomGaussian(lcg, 0, std);
    }
    for (let i = 0; i < this.weights.wpe.length; i++) {
      this.weights.wpe[i] = this.randomGaussian(lcg, 0, std);
    }

    // Init blocks
    for (let l = 0; l < n_layer; l++) {
      const b = this.weights.blocks[l];
      b.ln1_w.fill(1.0);
      b.ln1_b.fill(0.0);
      b.ln2_w.fill(1.0);
      b.ln2_b.fill(0.0);

      for (let i = 0; i < b.c_attn_w.length; i++) b.c_attn_w[i] = this.randomGaussian(lcg, 0, std);
      b.c_attn_b.fill(0.0);

      for (let i = 0; i < b.c_proj_w.length; i++) b.c_proj_w[i] = this.randomGaussian(lcg, 0, projStd);
      b.c_proj_b.fill(0.0);

      for (let i = 0; i < b.mlp_fc_w.length; i++) b.mlp_fc_w[i] = this.randomGaussian(lcg, 0, std);
      b.mlp_fc_b.fill(0.0);

      for (let i = 0; i < b.mlp_proj_w.length; i++) b.mlp_proj_w[i] = this.randomGaussian(lcg, 0, projStd);
      b.mlp_proj_b.fill(0.0);
    }

    // Final LN and Head
    this.weights.ln_f_w.fill(1.0);
    this.weights.ln_f_b.fill(0.0);
    for (let i = 0; i < this.weights.lm_head_w.length; i++) {
      this.weights.lm_head_w[i] = this.randomGaussian(lcg, 0, std);
    }
  }

  public getNumParams(): number {
    let total = 0;
    total += this.weights.wte.length;
    total += this.weights.wpe.length;
    for (const b of this.weights.blocks) {
      total += b.ln1_w.length + b.ln1_b.length;
      total += b.c_attn_w.length + b.c_attn_b.length;
      total += b.c_proj_w.length + b.c_proj_b.length;
      total += b.ln2_w.length + b.ln2_b.length;
      total += b.mlp_fc_w.length + b.mlp_fc_b.length;
      total += b.mlp_proj_w.length + b.mlp_proj_b.length;
    }
    total += this.weights.ln_f_w.length + this.weights.ln_f_b.length;
    total += this.weights.lm_head_w.length;
    return total;
  }

  /**
   * Forward pass through nanoGPT.
   * Returns logits for all positions (T, vocab_size) and cross-entropy loss if targets provided.
   */
  public forward(
    tokens: number[],
    targets?: number[]
  ): {
    logits: Float32Array; // (T, vocab_size)
    loss: number | null;
    activations: any; // Cache for backward pass
  } {
    const T = tokens.length;
    const { n_embd, n_layer, n_head, vocab_size } = this.config;
    const head_size = Math.floor(n_embd / n_head);

    if (T > this.config.block_size) {
      throw new Error(`Sequence length ${T} exceeds block_size ${this.config.block_size}`);
    }

    // Token + Position Embeddings
    // x: shape (T, n_embd)
    const x = new Float32Array(T * n_embd);
    for (let t = 0; t < T; t++) {
      const tok = tokens[t];
      const tokOffset = tok * n_embd;
      const posOffset = t * n_embd;
      const outOffset = t * n_embd;
      for (let c = 0; c < n_embd; c++) {
        x[outOffset + c] = this.weights.wte[tokOffset + c] + this.weights.wpe[posOffset + c];
      }
    }

    const blockCaches: any[] = [];

    // Forward through transformer blocks
    let curr_x = x;
    for (let l = 0; l < n_layer; l++) {
      const b = this.weights.blocks[l];

      // 1. LayerNorm 1
      const ln1_out = new Float32Array(T * n_embd);
      const ln1_mean = new Float32Array(T);
      const ln1_rstd = new Float32Array(T);

      for (let t = 0; t < T; t++) {
        let sum = 0;
        const off = t * n_embd;
        for (let c = 0; c < n_embd; c++) sum += curr_x[off + c];
        const mean = sum / n_embd;
        ln1_mean[t] = mean;

        let varSum = 0;
        for (let c = 0; c < n_embd; c++) {
          const diff = curr_x[off + c] - mean;
          varSum += diff * diff;
        }
        const rstd = 1.0 / Math.sqrt(varSum / n_embd + 1e-5);
        ln1_rstd[t] = rstd;

        for (let c = 0; c < n_embd; c++) {
          ln1_out[off + c] = (curr_x[off + c] - mean) * rstd * b.ln1_w[c] + b.ln1_b[c];
        }
      }

      // 2. Causal Self-Attention
      // c_attn projection: n_embd -> 3 * n_embd (Q, K, V)
      const qkv = new Float32Array(T * 3 * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * 3 * n_embd;
        for (let i = 0; i < 3 * n_embd; i++) {
          let sum = b.c_attn_b[i];
          const wOff = i;
          for (let c = 0; c < n_embd; c++) {
            sum += ln1_out[inOff + c] * b.c_attn_w[c * (3 * n_embd) + wOff];
          }
          qkv[outOff + i] = sum;
        }
      }

      // Multi-head attention with causal mask
      const att_out = new Float32Array(T * n_embd);
      const att_weights = new Float32Array(n_head * T * T);
      const scale = 1.0 / Math.sqrt(head_size);

      for (let h = 0; h < n_head; h++) {
        const headAttOff = h * T * T;
        for (let i = 0; i < T; i++) {
          const qOff = i * 3 * n_embd + h * head_size;
          let maxScore = -Infinity;
          const scores = new Float32Array(T);

          // Compute Q * K^T for j <= i (causal mask)
          for (let j = 0; j <= i; j++) {
            const kOff = j * 3 * n_embd + n_embd + h * head_size;
            let dot = 0;
            for (let d = 0; d < head_size; d++) {
              dot += qkv[qOff + d] * qkv[kOff + d];
            }
            const s = dot * scale;
            scores[j] = s;
            if (s > maxScore) maxScore = s;
          }

          // Softmax
          let expSum = 0;
          for (let j = 0; j <= i; j++) {
            const exp = Math.exp(scores[j] - maxScore);
            scores[j] = exp;
            expSum += exp;
          }
          for (let j = 0; j <= i; j++) {
            const p = scores[j] / expSum;
            scores[j] = p;
            att_weights[headAttOff + i * T + j] = p;
          }

          // Weighted sum of V
          const outPosOff = i * n_embd + h * head_size;
          for (let d = 0; d < head_size; d++) {
            let sumV = 0;
            for (let j = 0; j <= i; j++) {
              const vOff = j * 3 * n_embd + 2 * n_embd + h * head_size;
              sumV += scores[j] * qkv[vOff + d];
            }
            att_out[outPosOff + d] = sumV;
          }
        }
      }

      // c_proj: n_embd -> n_embd
      const attn_proj_out = new Float32Array(T * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * n_embd;
        for (let j = 0; j < n_embd; j++) {
          let sum = b.c_proj_b[j];
          for (let c = 0; c < n_embd; c++) {
            sum += att_out[inOff + c] * b.c_proj_w[c * n_embd + j];
          }
          attn_proj_out[outOff + j] = sum;
        }
      }

      // Residual 1: x_res1 = curr_x + attn_proj_out
      const x_res1 = new Float32Array(T * n_embd);
      for (let i = 0; i < x_res1.length; i++) {
        x_res1[i] = curr_x[i] + attn_proj_out[i];
      }

      // 3. LayerNorm 2
      const ln2_out = new Float32Array(T * n_embd);
      const ln2_mean = new Float32Array(T);
      const ln2_rstd = new Float32Array(T);

      for (let t = 0; t < T; t++) {
        let sum = 0;
        const off = t * n_embd;
        for (let c = 0; c < n_embd; c++) sum += x_res1[off + c];
        const mean = sum / n_embd;
        ln2_mean[t] = mean;

        let varSum = 0;
        for (let c = 0; c < n_embd; c++) {
          const diff = x_res1[off + c] - mean;
          varSum += diff * diff;
        }
        const rstd = 1.0 / Math.sqrt(varSum / n_embd + 1e-5);
        ln2_rstd[t] = rstd;

        for (let c = 0; c < n_embd; c++) {
          ln2_out[off + c] = (x_res1[off + c] - mean) * rstd * b.ln2_w[c] + b.ln2_b[c];
        }
      }

      // 4. MLP
      // c_fc: n_embd -> 4 * n_embd
      const mlp_fc_out = new Float32Array(T * 4 * n_embd);
      const mlp_gelu_out = new Float32Array(T * 4 * n_embd);

      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * 4 * n_embd;
        for (let j = 0; j < 4 * n_embd; j++) {
          let sum = b.mlp_fc_b[j];
          for (let c = 0; c < n_embd; c++) {
            sum += ln2_out[inOff + c] * b.mlp_fc_w[c * (4 * n_embd) + j];
          }
          mlp_fc_out[outOff + j] = sum;
          mlp_gelu_out[outOff + j] = gelu(sum);
        }
      }

      // c_proj: 4 * n_embd -> n_embd
      const mlp_proj_out = new Float32Array(T * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * 4 * n_embd;
        const outOff = t * n_embd;
        for (let j = 0; j < n_embd; j++) {
          let sum = b.mlp_proj_b[j];
          for (let c = 0; c < 4 * n_embd; c++) {
            sum += mlp_gelu_out[inOff + c] * b.mlp_proj_w[c * n_embd + j];
          }
          mlp_proj_out[outOff + j] = sum;
        }
      }

      // Residual 2: x_res2 = x_res1 + mlp_proj_out
      const x_res2 = new Float32Array(T * n_embd);
      for (let i = 0; i < x_res2.length; i++) {
        x_res2[i] = x_res1[i] + mlp_proj_out[i];
      }

      blockCaches.push({
        in_x: curr_x,
        ln1_out,
        ln1_mean,
        ln1_rstd,
        qkv,
        att_weights,
        att_out,
        attn_proj_out,
        x_res1,
        ln2_out,
        ln2_mean,
        ln2_rstd,
        mlp_fc_out,
        mlp_gelu_out,
        mlp_proj_out,
        x_res2,
      });

      curr_x = x_res2;
    }

    // Final LayerNorm (ln_f)
    const ln_f_out = new Float32Array(T * n_embd);
    const ln_f_mean = new Float32Array(T);
    const ln_f_rstd = new Float32Array(T);

    for (let t = 0; t < T; t++) {
      let sum = 0;
      const off = t * n_embd;
      for (let c = 0; c < n_embd; c++) sum += curr_x[off + c];
      const mean = sum / n_embd;
      ln_f_mean[t] = mean;

      let varSum = 0;
      for (let c = 0; c < n_embd; c++) {
        const diff = curr_x[off + c] - mean;
        varSum += diff * diff;
      }
      const rstd = 1.0 / Math.sqrt(varSum / n_embd + 1e-5);
      ln_f_rstd[t] = rstd;

      for (let c = 0; c < n_embd; c++) {
        ln_f_out[off + c] = (curr_x[off + c] - mean) * rstd * this.weights.ln_f_w[c] + this.weights.ln_f_b[c];
      }
    }

    // lm_head projection: n_embd -> vocab_size
    const logits = new Float32Array(T * vocab_size);
    for (let t = 0; t < T; t++) {
      const inOff = t * n_embd;
      const outOff = t * vocab_size;
      for (let v = 0; v < vocab_size; v++) {
        let sum = 0;
        for (let c = 0; c < n_embd; c++) {
          sum += ln_f_out[inOff + c] * this.weights.lm_head_w[c * vocab_size + v];
        }
        logits[outOff + v] = sum;
      }
    }

    let loss: number | null = null;
    let probs: Float32Array | null = null;

    if (targets && targets.length === T) {
      probs = new Float32Array(T * vocab_size);
      let totalLoss = 0;
      let count = 0;

      for (let t = 0; t < T; t++) {
        const target = targets[t];
        if (target < 0) continue; // ignore_index

        const off = t * vocab_size;
        let maxL = -Infinity;
        for (let v = 0; v < vocab_size; v++) {
          if (logits[off + v] > maxL) maxL = logits[off + v];
        }

        let expSum = 0;
        for (let v = 0; v < vocab_size; v++) {
          const exp = Math.exp(logits[off + v] - maxL);
          probs[off + v] = exp;
          expSum += exp;
        }

        for (let v = 0; v < vocab_size; v++) {
          probs[off + v] /= expSum;
        }

        const targetProb = Math.max(1e-12, probs[off + target]);
        totalLoss += -Math.log(targetProb);
        count++;
      }

      loss = count > 0 ? totalLoss / count : 0;
    }

    const activations = {
      tokens,
      targets,
      T,
      x,
      blockCaches,
      curr_x,
      ln_f_out,
      ln_f_mean,
      ln_f_rstd,
      logits,
      probs,
    };

    return { logits, loss, activations };
  }

  /**
   * Analytical Backward pass computing exact parameter gradients.
   */
  public backward(activations: any): void {
    const {
      tokens,
      targets,
      T,
      blockCaches,
      ln_f_out,
      ln_f_mean,
      ln_f_rstd,
      probs,
    } = activations;

    if (!targets || !probs) {
      throw new Error("Cannot run backward without targets & probabilities");
    }

    const { n_embd, n_layer, n_head, vocab_size } = this.config;
    const head_size = Math.floor(n_embd / n_head);
    const scale = 1.0 / Math.sqrt(head_size);

    // 1. Gradient of cross entropy wrt logits: dL/dLogits = (probs - 1_target) / N
    const dLogits = new Float32Array(T * vocab_size);
    let count = 0;
    for (let t = 0; t < T; t++) {
      if (targets[t] >= 0) count++;
    }
    const invCount = count > 0 ? 1.0 / count : 0;

    for (let t = 0; t < T; t++) {
      const target = targets[t];
      if (target < 0) continue;
      const off = t * vocab_size;
      for (let v = 0; v < vocab_size; v++) {
        dLogits[off + v] = (probs[off + v] - (v === target ? 1.0 : 0.0)) * invCount;
      }
    }

    // 2. Gradients for lm_head
    const dLn_f_out = new Float32Array(T * n_embd);
    for (let t = 0; t < T; t++) {
      const logOff = t * vocab_size;
      const lnOff = t * n_embd;
      for (let v = 0; v < vocab_size; v++) {
        const dL = dLogits[logOff + v];
        if (dL === 0) continue;
        for (let c = 0; c < n_embd; c++) {
          this.grads.lm_head_w[c * vocab_size + v] += ln_f_out[lnOff + c] * dL;
          dLn_f_out[lnOff + c] += this.weights.lm_head_w[c * vocab_size + v] * dL;
        }
      }
    }

    // 3. Backward through final LayerNorm (ln_f)
    const dCurr_x = new Float32Array(T * n_embd);
    for (let t = 0; t < T; t++) {
      const off = t * n_embd;
      const rstd = ln_f_rstd[t];
      const mean = ln_f_mean[t];

      for (let c = 0; c < n_embd; c++) {
        const dy = dLn_f_out[off + c];
        const x_hat = (activations.curr_x[off + c] - mean) * rstd;
        this.grads.ln_f_w[c] += dy * x_hat;
        this.grads.ln_f_b[c] += dy;
      }

      // dx backward through LayerNorm
      let sum1 = 0;
      let sum2 = 0;
      for (let c = 0; c < n_embd; c++) {
        const dy = dLn_f_out[off + c];
        const gamma = this.weights.ln_f_w[c];
        const x_hat = (activations.curr_x[off + c] - mean) * rstd;
        sum1 += dy * gamma;
        sum2 += dy * gamma * x_hat;
      }
      for (let c = 0; c < n_embd; c++) {
        const dy = dLn_f_out[off + c];
        const gamma = this.weights.ln_f_w[c];
        const x_hat = (activations.curr_x[off + c] - mean) * rstd;
        dCurr_x[off + c] = (rstd / n_embd) * (n_embd * dy * gamma - sum1 - x_hat * sum2);
      }
    }

    // 4. Backward through transformer blocks (in reverse order)
    let dNext_x = dCurr_x;
    for (let l = n_layer - 1; l >= 0; l--) {
      const bWeights = this.weights.blocks[l];
      const bGrads = this.grads.blocks[l];
      const cache = blockCaches[l];

      // Residual 2 split: dNext_x goes to dx_res1 and dMlp_proj_out
      const dMlp_proj_out = dNext_x;
      const dX_res1 = new Float32Array(dNext_x);

      // MLP c_proj backward
      const dMlp_gelu_out = new Float32Array(T * 4 * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * 4 * n_embd;
        const outOff = t * n_embd;
        for (let j = 0; j < n_embd; j++) {
          const dy = dMlp_proj_out[outOff + j];
          bGrads.mlp_proj_b[j] += dy;
          for (let c = 0; c < 4 * n_embd; c++) {
            bGrads.mlp_proj_w[c * n_embd + j] += cache.mlp_gelu_out[inOff + c] * dy;
            dMlp_gelu_out[inOff + c] += bWeights.mlp_proj_w[c * n_embd + j] * dy;
          }
        }
      }

      // GELU backward
      const dMlp_fc_out = new Float32Array(T * 4 * n_embd);
      for (let i = 0; i < dMlp_gelu_out.length; i++) {
        dMlp_fc_out[i] = dMlp_gelu_out[i] * geluDeriv(cache.mlp_fc_out[i]);
      }

      // MLP c_fc backward
      const dLn2_out = new Float32Array(T * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * 4 * n_embd;
        for (let j = 0; j < 4 * n_embd; j++) {
          const dy = dMlp_fc_out[outOff + j];
          bGrads.mlp_fc_b[j] += dy;
          for (let c = 0; c < n_embd; c++) {
            bGrads.mlp_fc_w[c * 4 * n_embd + j] += cache.ln2_out[inOff + c] * dy;
            dLn2_out[inOff + c] += bWeights.mlp_fc_w[c * 4 * n_embd + j] * dy;
          }
        }
      }

      // LayerNorm 2 backward
      for (let t = 0; t < T; t++) {
        const off = t * n_embd;
        const rstd = cache.ln2_rstd[t];
        const mean = cache.ln2_mean[t];

        let sum1 = 0;
        let sum2 = 0;
        for (let c = 0; c < n_embd; c++) {
          const dy = dLn2_out[off + c];
          const x_hat = (cache.x_res1[off + c] - mean) * rstd;
          bGrads.ln2_w[c] += dy * x_hat;
          bGrads.ln2_b[c] += dy;
          sum1 += dy * bWeights.ln2_w[c];
          sum2 += dy * bWeights.ln2_w[c] * x_hat;
        }

        for (let c = 0; c < n_embd; c++) {
          const dy = dLn2_out[off + c];
          const x_hat = (cache.x_res1[off + c] - mean) * rstd;
          const dx = (rstd / n_embd) * (n_embd * dy * bWeights.ln2_w[c] - sum1 - x_hat * sum2);
          dX_res1[off + c] += dx;
        }
      }

      // Residual 1 split: dX_res1 goes to dIn_x and dAttn_proj_out
      const dAttn_proj_out = dX_res1;
      const dIn_x = new Float32Array(dX_res1);

      // Attention c_proj backward
      const dAtt_out = new Float32Array(T * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * n_embd;
        for (let j = 0; j < n_embd; j++) {
          const dy = dAttn_proj_out[outOff + j];
          bGrads.c_proj_b[j] += dy;
          for (let c = 0; c < n_embd; c++) {
            bGrads.c_proj_w[c * n_embd + j] += cache.att_out[inOff + c] * dy;
            dAtt_out[inOff + c] += bWeights.c_proj_w[c * n_embd + j] * dy;
          }
        }
      }

      // Multi-head attention backward
      const dQkv = new Float32Array(T * 3 * n_embd);
      for (let h = 0; h < n_head; h++) {
        const headAttOff = h * T * T;
        for (let i = 0; i < T; i++) {
          const dAttOutPos = i * n_embd + h * head_size;
          const qOff = i * 3 * n_embd + h * head_size;

          const dAttWeights_i = new Float32Array(T);
          for (let j = 0; j <= i; j++) {
            const vOff = j * 3 * n_embd + 2 * n_embd + h * head_size;
            const p = cache.att_weights[headAttOff + i * T + j];
            let dP = 0;
            for (let d = 0; d < head_size; d++) {
              dQkv[vOff + d] += p * dAtt_out[dAttOutPos + d];
              dP += cache.qkv[vOff + d] * dAtt_out[dAttOutPos + d];
            }
            dAttWeights_i[j] = dP;
          }

          // Softmax backward
          let sumP_dP = 0;
          for (let j = 0; j <= i; j++) {
            const p = cache.att_weights[headAttOff + i * T + j];
            sumP_dP += p * dAttWeights_i[j];
          }

          for (let j = 0; j <= i; j++) {
            const p = cache.att_weights[headAttOff + i * T + j];
            const dScore = p * (dAttWeights_i[j] - sumP_dP) * scale;
            const kOff = j * 3 * n_embd + n_embd + h * head_size;
            for (let d = 0; d < head_size; d++) {
              dQkv[qOff + d] += dScore * cache.qkv[kOff + d];
              dQkv[kOff + d] += dScore * cache.qkv[qOff + d];
            }
          }
        }
      }

      // c_attn projection backward
      const dLn1_out = new Float32Array(T * n_embd);
      for (let t = 0; t < T; t++) {
        const inOff = t * n_embd;
        const outOff = t * 3 * n_embd;
        for (let j = 0; j < 3 * n_embd; j++) {
          const dy = dQkv[outOff + j];
          bGrads.c_attn_b[j] += dy;
          for (let c = 0; c < n_embd; c++) {
            bGrads.c_attn_w[c * (3 * n_embd) + j] += cache.ln1_out[inOff + c] * dy;
            dLn1_out[inOff + c] += bWeights.c_attn_w[c * (3 * n_embd) + j] * dy;
          }
        }
      }

      // LayerNorm 1 backward
      for (let t = 0; t < T; t++) {
        const off = t * n_embd;
        const rstd = cache.ln1_rstd[t];
        const mean = cache.ln1_mean[t];

        let sum1 = 0;
        let sum2 = 0;
        for (let c = 0; c < n_embd; c++) {
          const dy = dLn1_out[off + c];
          const x_hat = (cache.in_x[off + c] - mean) * rstd;
          bGrads.ln1_w[c] += dy * x_hat;
          bGrads.ln1_b[c] += dy;
          sum1 += dy * bWeights.ln1_w[c];
          sum2 += dy * bWeights.ln1_w[c] * x_hat;
        }

        for (let c = 0; c < n_embd; c++) {
          const dy = dLn1_out[off + c];
          const x_hat = (cache.in_x[off + c] - mean) * rstd;
          const dx = (rstd / n_embd) * (n_embd * dy * bWeights.ln1_w[c] - sum1 - x_hat * sum2);
          dIn_x[off + c] += dx;
        }
      }

      dNext_x = dIn_x;
    }

    // 5. Embeddings backward (wte & wpe)
    for (let t = 0; t < T; t++) {
      const tok = tokens[t];
      const tokOff = tok * n_embd;
      const posOff = t * n_embd;
      const inOff = t * n_embd;
      for (let c = 0; c < n_embd; c++) {
        const dy = dNext_x[inOff + c];
        this.grads.wte[tokOff + c] += dy;
        this.grads.wpe[posOff + c] += dy;
      }
    }
  }

  /**
   * AdamW Optimizer step with gradient clipping and weight decay.
   */
  public step(
    learningRate = 1e-3,
    beta1 = 0.9,
    beta2 = 0.95,
    weightDecay = 1e-1,
    gradClip = 1.0
  ): void {
    this.stepCount++;
    const eps = 1e-8;

    // 1. Calculate total gradient norm for clipping
    let totalNormSq = 0;
    const computeNorm = (arr: Float32Array) => {
      for (let i = 0; i < arr.length; i++) totalNormSq += arr[i] * arr[i];
    };

    computeNorm(this.grads.wte);
    computeNorm(this.grads.wpe);
    for (const b of this.grads.blocks) {
      computeNorm(b.c_attn_w);
      computeNorm(b.c_proj_w);
      computeNorm(b.mlp_fc_w);
      computeNorm(b.mlp_proj_w);
      computeNorm(b.ln1_w);
      computeNorm(b.ln2_w);
      computeNorm(b.c_attn_b);
      computeNorm(b.c_proj_b);
      computeNorm(b.mlp_fc_b);
      computeNorm(b.mlp_proj_b);
      computeNorm(b.ln1_b);
      computeNorm(b.ln2_b);
    }
    computeNorm(this.grads.ln_f_w);
    computeNorm(this.grads.ln_f_b);
    computeNorm(this.grads.lm_head_w);

    const totalNorm = Math.sqrt(totalNormSq);
    const clipScale = totalNorm > gradClip && gradClip > 0 ? gradClip / (totalNorm + 1e-6) : 1.0;

    // Bias correction factors
    const biasCorr1 = 1.0 - Math.pow(beta1, this.stepCount);
    const biasCorr2 = 1.0 - Math.pow(beta2, this.stepCount);

    // Helper for applying AdamW update
    const updateTensor = (
      w: Float32Array,
      g: Float32Array,
      m: Float32Array,
      v: Float32Array,
      applyWeightDecay: boolean
    ) => {
      for (let i = 0; i < w.length; i++) {
        const grad = g[i] * clipScale;
        m[i] = beta1 * m[i] + (1.0 - beta1) * grad;
        v[i] = beta2 * v[i] + (1.0 - beta2) * grad * grad;

        const mHat = m[i] / biasCorr1;
        const vHat = v[i] / biasCorr2;

        const stepVal = mHat / (Math.sqrt(vHat) + eps);
        let decay = 0;
        if (applyWeightDecay) {
          decay = weightDecay * w[i];
        }

        w[i] -= learningRate * (stepVal + decay);
        g[i] = 0; // Reset gradient
      }
    };

    updateTensor(this.weights.wte, this.grads.wte, this.m.wte, this.v.wte, true);
    updateTensor(this.weights.wpe, this.grads.wpe, this.m.wpe, this.v.wpe, true);

    for (let l = 0; l < this.config.n_layer; l++) {
      const bw = this.weights.blocks[l];
      const bg = this.grads.blocks[l];
      const bm = this.m.blocks[l];
      const bv = this.v.blocks[l];

      updateTensor(bw.c_attn_w, bg.c_attn_w, bm.c_attn_w, bv.c_attn_w, true);
      updateTensor(bw.c_attn_b, bg.c_attn_b, bm.c_attn_b, bv.c_attn_b, false);
      updateTensor(bw.c_proj_w, bg.c_proj_w, bm.c_proj_w, bv.c_proj_w, true);
      updateTensor(bw.c_proj_b, bg.c_proj_b, bm.c_proj_b, bv.c_proj_b, false);

      updateTensor(bw.mlp_fc_w, bg.mlp_fc_w, bm.mlp_fc_w, bv.mlp_fc_w, true);
      updateTensor(bw.mlp_fc_b, bg.mlp_fc_b, bm.mlp_fc_b, bv.mlp_fc_b, false);
      updateTensor(bw.mlp_proj_w, bg.mlp_proj_w, bm.mlp_proj_w, bv.mlp_proj_w, true);
      updateTensor(bw.mlp_proj_b, bg.mlp_proj_b, bm.mlp_proj_b, bv.mlp_proj_b, false);

      updateTensor(bw.ln1_w, bg.ln1_w, bm.ln1_w, bv.ln1_w, false);
      updateTensor(bw.ln1_b, bg.ln1_b, bm.ln1_b, bv.ln1_b, false);
      updateTensor(bw.ln2_w, bg.ln2_w, bm.ln2_w, bv.ln2_w, false);
      updateTensor(bw.ln2_b, bg.ln2_b, bm.ln2_b, bv.ln2_b, false);
    }

    updateTensor(this.weights.ln_f_w, this.grads.ln_f_w, this.m.ln_f_w, this.v.ln_f_w, false);
    updateTensor(this.weights.ln_f_b, this.grads.ln_f_b, this.m.ln_f_b, this.v.ln_f_b, false);
    updateTensor(this.weights.lm_head_w, this.grads.lm_head_w, this.m.lm_head_w, this.v.lm_head_w, true);
  }

  /**
   * Resetea explícitamente todos los tensores de gradientes a cero.
   */
  public zeroGrad(): void {
    this.grads.wte.fill(0);
    this.grads.wpe.fill(0);
    for (const b of this.grads.blocks) {
      b.c_attn_w.fill(0);
      b.c_attn_b.fill(0);
      b.c_proj_w.fill(0);
      b.c_proj_b.fill(0);
      b.mlp_fc_w.fill(0);
      b.mlp_fc_b.fill(0);
      b.mlp_proj_w.fill(0);
      b.mlp_proj_b.fill(0);
      b.ln1_w.fill(0);
      b.ln1_b.fill(0);
      b.ln2_w.fill(0);
      b.ln2_b.fill(0);
    }
    this.grads.ln_f_w.fill(0);
    this.grads.ln_f_b.fill(0);
    this.grads.lm_head_w.fill(0);
  }

  /**
   * Autoregressive text generation.
   * Feeds tokens back into the model, sampling next token with temperature and top-k filtering.
   */
  public generate(
    promptTokens: number[],
    maxNewTokens: number,
    temperature = 0.8,
    topK = 40,
    stopToken?: number,
    onToken?: (token: number) => void
  ): number[] {
    const generated = [...promptTokens];
    const { block_size, vocab_size } = this.config;

    for (let step = 0; step < maxNewTokens; step++) {
      // Crop to block_size if needed
      const context = generated.length > block_size
        ? generated.slice(generated.length - block_size)
        : generated;

      const { logits } = this.forward(context);
      const lastTokenOffset = (context.length - 1) * vocab_size;

      // Extract last position logits
      const lastLogits = new Float32Array(vocab_size);
      for (let v = 0; v < vocab_size; v++) {
        lastLogits[v] = logits[lastTokenOffset + v] / Math.max(1e-4, temperature);
      }

      // Top-K filtering
      let candidates: { idx: number; val: number }[] = [];
      for (let v = 0; v < vocab_size; v++) {
        candidates.push({ idx: v, val: lastLogits[v] });
      }
      candidates.sort((a, b) => b.val - a.val);

      if (topK > 0 && topK < vocab_size) {
        candidates = candidates.slice(0, topK);
      }

      // Softmax over top-k
      let maxVal = candidates[0].val;
      let expSum = 0;
      const probs: number[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const exp = Math.exp(candidates[i].val - maxVal);
        probs.push(exp);
        expSum += exp;
      }

      // Multinomial sampling
      const rand = Math.random() * expSum;
      let acc = 0;
      let nextToken = candidates[0].idx;
      for (let i = 0; i < candidates.length; i++) {
        acc += probs[i];
        if (rand <= acc) {
          nextToken = candidates[i].idx;
          break;
        }
      }

      generated.push(nextToken);
      if (onToken) onToken(nextToken);

      if (stopToken !== undefined && nextToken === stopToken) {
        break;
      }
    }

    return generated;
  }

  /**
   * Serialize weights to compact JSON/base64 representation for checkpoints and export.
   */
  public serialize(): string {
    const arrays: number[][] = [];
    arrays.push(Array.from(this.weights.wte));
    arrays.push(Array.from(this.weights.wpe));
    for (const b of this.weights.blocks) {
      arrays.push(Array.from(b.c_attn_w));
      arrays.push(Array.from(b.c_attn_b));
      arrays.push(Array.from(b.c_proj_w));
      arrays.push(Array.from(b.c_proj_b));
      arrays.push(Array.from(b.mlp_fc_w));
      arrays.push(Array.from(b.mlp_fc_b));
      arrays.push(Array.from(b.mlp_proj_w));
      arrays.push(Array.from(b.mlp_proj_b));
      arrays.push(Array.from(b.ln1_w));
      arrays.push(Array.from(b.ln1_b));
      arrays.push(Array.from(b.ln2_w));
      arrays.push(Array.from(b.ln2_b));
    }
    arrays.push(Array.from(this.weights.ln_f_w));
    arrays.push(Array.from(this.weights.ln_f_b));
    arrays.push(Array.from(this.weights.lm_head_w));

    return JSON.stringify(arrays);
  }

  public deserialize(serialized: string): void {
    const arrays: number[][] = JSON.parse(serialized);
    let ptr = 0;
    this.weights.wte.set(arrays[ptr++]);
    this.weights.wpe.set(arrays[ptr++]);
    for (let l = 0; l < this.config.n_layer; l++) {
      const b = this.weights.blocks[l];
      b.c_attn_w.set(arrays[ptr++]);
      b.c_attn_b.set(arrays[ptr++]);
      b.c_proj_w.set(arrays[ptr++]);
      b.c_proj_b.set(arrays[ptr++]);
      b.mlp_fc_w.set(arrays[ptr++]);
      b.mlp_fc_b.set(arrays[ptr++]);
      b.mlp_proj_w.set(arrays[ptr++]);
      b.mlp_proj_b.set(arrays[ptr++]);
      b.ln1_w.set(arrays[ptr++]);
      b.ln1_b.set(arrays[ptr++]);
      b.ln2_w.set(arrays[ptr++]);
      b.ln2_b.set(arrays[ptr++]);
    }
    this.weights.ln_f_w.set(arrays[ptr++]);
    this.weights.ln_f_b.set(arrays[ptr++]);
    this.weights.lm_head_w.set(arrays[ptr++]);
  }
}
