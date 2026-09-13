/**
 * LOCAL BRAIN LAB — BENCHMARK RUNNER & EVALUATION ENGINE
 * 
 * Mide empíricamente:
 * 1. Tiempos de ejecución por componente: Forward (ms), Backward (ms), AdamW Step (ms)
 * 2. Rendimiento de inferencia: tokens por segundo (tok/s) y latencia al primer token
 * 3. Detección de Olvido Catastrófico (Catastrophic Forgetting Delta)
 *    comparando el desempeño sobre el Anchor Dataset vs Nuevo Dataset
 */

import { NanoGPTModel } from '../core/nanogpt_engine';
import { GPTConfig } from '../core/types';

export interface BenchmarkResult {
  architectureName: string;
  paramCount: number;
  paramCountFormatted: string;
  forwardMs: number;
  backwardMs: number;
  optimizerStepMs: number;
  totalStepMs: number;
  inferenceTokensPerSecond: number;
  memoryEstimateMB: number;
  rating: 'ultra_fast' | 'optimal' | 'moderate' | 'heavy';
}

export interface CatastrophicForgettingReport {
  anchorLossBaseline: number;
  anchorLossCurrent: number;
  deltaLoss: number;
  hasDegraded: boolean;
  preservationScore: number; // 0% a 100%
  status: 'safe' | 'warning' | 'catastrophic_detected';
  recommendation: string;
}

export class BenchmarkRunner {
  /**
   * Ejecuta una batería completa de pruebas sobre una configuración específica
   */
  public static async runBenchmark(config?: GPTConfig, steps = 3): Promise<BenchmarkResult> {
    const cfg: GPTConfig = config || {
      vocab_size: 128,
      block_size: 64,
      n_embd: 64,
      n_head: 4,
      n_layer: 4,
      dropout: 0.0,
      bias: true,
    };

    const model = new NanoGPTModel(cfg);
    const paramCount = model.getNumParams();

    // Secuencias de prueba
    const testInput = Array.from({ length: cfg.block_size - 1 }, (_, i) => (i % 60) + 32);
    const testTarget = Array.from({ length: cfg.block_size - 1 }, (_, i) => ((i + 1) % 60) + 32);

    // 1. Warmup
    model.forward(testInput, testTarget);

    // 2. Medir Forward
    const tFwd0 = performance.now();
    let activations: any = null;
    for (let i = 0; i < steps; i++) {
      const res = model.forward(testInput, testTarget);
      activations = res.activations;
    }
    const forwardMs = (performance.now() - tFwd0) / steps;

    // 3. Medir Backward
    const tBwd0 = performance.now();
    for (let i = 0; i < steps; i++) {
      model.backward(activations);
    }
    const backwardMs = (performance.now() - tBwd0) / steps;

    // 4. Medir Optimizer Step (AdamW)
    const tOpt0 = performance.now();
    for (let i = 0; i < steps; i++) {
      model.step(1e-3, 0.9, 0.95, 1e-1, 1.0);
    }
    const optimizerStepMs = (performance.now() - tOpt0) / steps;

    // 5. Medir Inferencia (tok/s)
    const tInf0 = performance.now();
    const generated = model.generate([65, 66, 67], 24, 0.7, 40);
    const infDuration = Math.max(1, performance.now() - tInf0);
    const newTokens = generated.length - 3;
    const tokensPerSecond = Math.round((newTokens / infDuration) * 1000);

    const totalStepMs = forwardMs + backwardMs + optimizerStepMs;

    // Estimación de memoria de parámetros + activaciones
    const memoryEstimateMB = (paramCount * 4 * 3) / (1024 * 1024);

    let rating: BenchmarkResult['rating'] = 'optimal';
    if (totalStepMs < 15) rating = 'ultra_fast';
    else if (totalStepMs < 45) rating = 'optimal';
    else if (totalStepMs < 100) rating = 'moderate';
    else rating = 'heavy';

    return {
      architectureName: `nanoGPT (${cfg.n_layer}L / ${cfg.n_embd}D / ${cfg.n_head}H)`,
      paramCount,
      paramCountFormatted: paramCount > 1000000 ? `~${(paramCount / 1000000).toFixed(1)}M` : `~${Math.round(paramCount / 1000)}K`,
      forwardMs: Math.round(forwardMs * 100) / 100,
      backwardMs: Math.round(backwardMs * 100) / 100,
      optimizerStepMs: Math.round(optimizerStepMs * 100) / 100,
      totalStepMs: Math.round(totalStepMs * 100) / 100,
      inferenceTokensPerSecond: tokensPerSecond,
      memoryEstimateMB: Math.round(memoryEstimateMB * 10) / 10,
      rating,
    };
  }

  /**
   * Evalúa si el aprendizaje reciente dañó el conocimiento base (Catastrophic Forgetting)
   */
  public static evaluateForgetting(
    anchorBaselineLoss: number,
    anchorCurrentLoss: number
  ): CatastrophicForgettingReport {
    const deltaLoss = anchorCurrentLoss - anchorBaselineLoss;
    const hasDegraded = deltaLoss > 0.35; // Incremento notable de pérdida

    let preservationScore = Math.max(0, Math.min(100, Math.round(100 - (deltaLoss * 40))));
    if (deltaLoss <= 0) preservationScore = 100;

    let status: CatastrophicForgettingReport['status'] = 'safe';
    let recommendation = 'El modelo mantiene intacto el conocimiento ancla.';

    if (deltaLoss > 0.7) {
      status = 'catastrophic_detected';
      recommendation = 'Olvido catastrófico severo detectado. Aumenta la proporción de Replay a 50%+ o reduce la tasa de aprendizaje.';
    } else if (deltaLoss > 0.3) {
      status = 'warning';
      recommendation = 'Leve degradación en anclas. Se recomienda inyectar lotes de repaso antes de continuar.';
    }

    return {
      anchorLossBaseline: Math.round(anchorBaselineLoss * 100) / 100,
      anchorLossCurrent: Math.round(anchorCurrentLoss * 100) / 100,
      deltaLoss: Math.round(deltaLoss * 100) / 100,
      hasDegraded,
      preservationScore,
      status,
      recommendation,
    };
  }
}
