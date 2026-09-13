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

  private getTokensFrom(items: DatasetItem[]): number[] {
    if (items.length === 0) {
      const base = this.tokenizer.formatConversation('hola', '¡Hola! Soy tu cerebro local.');
      return this.tokenizer.encode(base);
    }
    const tokens: number[] = [];
    for (const item of items) {
      const formatted = this.tokenizer.formatConversation(item.input, item.output);
      const encoded = this.tokenizer.encode(formatted);
      tokens.push(...encoded);
    }
    return tokens;
  }

  /**
   * Prepares a concatenated token stream with anti-catastrophic-forgetting replay.
   */
  private getTrainingTokens(): number[] {
    const useReplay = this.anchorDatasets.length > 0 && Math.random() < (this.hyperparams.replayRatio ?? this.replayRatio);
    const sourceData = useReplay ? this.anchorDatasets : this.datasets;
    return this.getTokensFrom(sourceData.length > 0 ? sourceData : this.datasets);
  }

  /**
   * Execute a single training iteration.
   */
  public stepIteration(): { step: number; loss: number } {
    const allTokens = this.getTrainingTokens();
    const blockSize = this.model.config.block_size;
    const { learningRate, weightDecay, gradClip, useCosineDecay, maxIters } = this.hyperparams;

    // Cosine learning rate decay
    let effectiveLR = learningRate;
    if (useCosineDecay) {
      const totalIters = Math.max(100, maxIters || 500);
      const minLr = learningRate * 0.1;
      const progress = Math.min(1.0, this.currentStep / totalIters);
      effectiveLR = minLr + 0.5 * (learningRate - minLr) * (1 + Math.cos(Math.PI * progress));
    }

    if (allTokens.length <= blockSize + 1) {
      // Pad or duplicate if too short
      while (allTokens.length <= blockSize + 1) {
        allTokens.push(...allTokens);
      }
    }

    // Random sample window
    const maxStart = allTokens.length - blockSize - 1;
    const startIdx = Math.floor(Math.random() * maxStart);
    const chunk = allTokens.slice(startIdx, startIdx + blockSize + 1);

    const inputs = chunk.slice(0, blockSize);
    const targets = chunk.slice(1, blockSize + 1);

    // Forward pass
    const fwd = this.model.forward(inputs, targets);
    const loss = fwd.loss ?? 0;

    // Backward pass
    this.model.backward(fwd.activations);

    // Optimizer step
    this.model.step(effectiveLR, 0.9, 0.95, weightDecay, gradClip);

    this.currentStep++;
    this.totalTokensTrained += blockSize;
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
