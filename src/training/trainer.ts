/**
 * Training Coordinator for Local Brain Lab.
 * Manages the training loop over local datasets using nanoGPT.
 */

import { NanoGPTModel } from '../core/nanogpt_engine';
import { NanoTokenizer } from '../core/tokenizer';
import { DatasetItem, TrainingHyperparameters } from '../core/types';

export interface TrainingStepEvent {
  step: number;
  maxIters: number;
  loss: number;
  perplexity: number;
  tokensProcessed: number;
  elapsedMs: number;
  tokensPerSec: number;
  lr: number;
}

export class BrainTrainer {
  model: NanoGPTModel;
  tokenizer: NanoTokenizer;
  datasets: DatasetItem[];
  hyperparams: TrainingHyperparameters;
  isTraining: boolean = false;
  currentStep: number = 0;
  totalTokensTrained: number = 0;
  lossHistory: { step: number; loss: number }[] = [];
  onStepCallback?: (e: TrainingStepEvent) => void;
  onFinishedCallback?: () => void;

  constructor(
    model: NanoGPTModel,
    tokenizer: NanoTokenizer,
    datasets: DatasetItem[],
    hyperparams: TrainingHyperparameters
  ) {
    this.model = model;
    this.tokenizer = tokenizer;
    this.datasets = datasets.filter(d => d.approved);
    this.hyperparams = hyperparams;
  }

  public setHyperparameters(params: Partial<TrainingHyperparameters>) {
    this.hyperparams = { ...this.hyperparams, ...params };
  }

  public setDatasets(datasets: DatasetItem[]) {
    this.datasets = datasets.filter(d => d.approved);
  }

  anchorDatasets: DatasetItem[] = [];
  replayRatio: number = 0.25;

  public setAnchorDatasets(anchors: DatasetItem[], ratio: number = 0.25) {
    this.anchorDatasets = anchors.filter(d => d.approved);
    this.replayRatio = ratio;
  }

  public async loadCloudSamples(jobId: string) {
    try {
      const resp = await fetch(`/api/cloud/teacher-pool/status/${jobId}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 'completed' && json.samples) {
          const samples: DatasetItem[] = JSON.parse(json.samples);
          // Auto-approve incoming cloud samples
          samples.forEach(s => s.approved = true);
          this.setDatasets([...samples, ...this.datasets]);
        }
      }
    } catch (e) {
      console.error('Failed to load cloud samples:', e);
    }
  }

  private getTokensFrom(items: DatasetItem[]): number[] {
    const sample = items.length > 10 ? items.slice(0, 10) : items;
    if (sample.length === 0) {
      const base = this.tokenizer.formatConversation('hola', '¡Hola! Soy tu cerebro local.');
      return this.tokenizer.encode(base);
    }
    const tokens: number[] = [];
    for (const item of sample) {
      const formatted = this.tokenizer.formatConversation(item.input || '', item.output || '');
      const encoded = this.tokenizer.encode(formatted);
      tokens.push(...encoded);
    }
    return tokens;
  }

  /**
   * Prepares an instruction-masked batch where prompt tokens have target = -1
   * so backpropagation updates ONLY weights predicting the assistant's response.
   */
  public sampleTrainingBatch(): { inputs: number[]; targets: number[] } {
    const useReplay = this.anchorDatasets.length > 0 && Math.random() < (this.hyperparams.replayRatio ?? this.replayRatio);
    const sourceData = (useReplay && this.anchorDatasets.length > 0) ? this.anchorDatasets : this.datasets;
    const items = sourceData.length > 0 ? sourceData : this.datasets;
    const blockSize = this.model.config.block_size;

    if (items.length > 0) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const item = items[Math.floor(Math.random() * items.length)];
        if (!item || !item.input || !item.output) continue;
        const prefix = this.tokenizer.formatConversation(item.input);
        const prefixTokens = this.tokenizer.encode(prefix);
        const fullText = this.tokenizer.formatConversation(item.input, item.output);
        const fullTokens = this.tokenizer.encode(fullText);

        if (fullTokens.length >= 4) {
          let seq = fullTokens;
          if (seq.length > blockSize + 1) {
            seq = seq.slice(0, blockSize + 1);
          }

          const promptLen = Math.min(prefixTokens.length, seq.length);
          const inputs: number[] = [];
          const targets: number[] = [];

          for (let i = 0; i < seq.length - 1; i++) {
            inputs.push(seq[i]);
            if (i < promptLen - 1) {
              targets.push(-1);
            } else {
              targets.push(seq[i + 1]);
            }
          }

          const hasValidTarget = targets.some(t => t >= 0);
          if (hasValidTarget && inputs.length > 0) {
            return { inputs, targets };
          }
        }
      }
    }

    // Fallback: fast bounded token stream
    const allTokens = this.getTokensFrom(items);
    if (allTokens.length <= blockSize + 1) {
      while (allTokens.length <= blockSize + 1) {
        allTokens.push(...allTokens);
      }
    }
    const maxStart = allTokens.length - blockSize - 1;
    const startIdx = Math.floor(Math.random() * Math.max(1, maxStart));
    const chunk = allTokens.slice(startIdx, startIdx + blockSize + 1);
    return {
      inputs: chunk.slice(0, blockSize),
      targets: chunk.slice(1, blockSize + 1),
    };
  }

  /**
   * Execute a single training iteration with SFT Instruction Masking.
   */
  public stepIteration(): { step: number; loss: number } {
    const { learningRate, weightDecay, gradClip, useCosineDecay, maxIters } = this.hyperparams;

    // Cosine learning rate decay
    let effectiveLR = learningRate;
    if (useCosineDecay) {
      const totalIters = Math.max(100, maxIters || 500);
      const minLr = learningRate * 0.1;
      const progress = Math.min(1.0, this.currentStep / totalIters);
      effectiveLR = minLr + 0.5 * (learningRate - minLr) * (1 + Math.cos(Math.PI * progress));
    }

    // Sample instruction-masked batch
    const { inputs, targets } = this.sampleTrainingBatch();

    // Forward pass
    const fwd = this.model.forward(inputs, targets);
    const loss = fwd.loss ?? 0;

    // Backward pass (Karpathy analytical autograd honors target < 0 as ignore_index)
    this.model.backward(fwd.activations);

    // Optimizer step
    this.model.step(effectiveLR, 0.9, 0.95, weightDecay, gradClip);

    this.currentStep++;
    this.totalTokensTrained += this.model.config.block_size;
    this.lossHistory.push({ step: this.currentStep, loss });

    return { step: this.currentStep, loss };
  }

  /**
   * Run training asynchronously in small batches with yields to keep UI 60fps responsive.
   */
  public async startTraining(stepsToRun: number): Promise<void> {
    if (this.isTraining) return;
    this.isTraining = true;

    const targetStep = this.currentStep + stepsToRun;
    const startTime = performance.now();
    let tokensInRun = 0;

    while (this.isTraining && this.currentStep < targetStep) {
      const iterStart = performance.now();
      const { step, loss } = this.stepIteration();
      tokensInRun += this.model.config.block_size;

      const elapsed = performance.now() - startTime;
      const tokensPerSec = elapsed > 0 ? (tokensInRun / (elapsed / 1000)) : 0;
      const perplexity = Math.min(999, Math.exp(Math.min(20, loss)));

      if (this.onStepCallback) {
        this.onStepCallback({
          step,
          maxIters: targetStep,
          loss,
          perplexity,
          tokensProcessed: this.totalTokensTrained,
          elapsedMs: elapsed,
          tokensPerSec: Math.round(tokensPerSec),
          lr: this.hyperparams.learningRate,
        });
      }

      // Yield every 3 steps or if frame budget exceeded
      if (step % 3 === 0 || performance.now() - iterStart > 16) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.isTraining = false;
    if (this.onFinishedCallback) {
      this.onFinishedCallback();
    }
  }

  public pauseTraining(): void {
    this.isTraining = false;
  }
}
