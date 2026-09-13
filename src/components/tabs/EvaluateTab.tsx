import React, { useState } from 'react';
import { ShieldCheck, Play, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight, Scale, AlertCircle, Cpu, Gauge, Zap } from 'lucide-react';
import { BrainProject, EvaluationResult } from '../../core/types';
import { NanoGPTModel } from '../../core/nanogpt_engine';
import { NanoTokenizer } from '../../core/tokenizer';
import { runEvaluationSuite, EVALUATION_TEST_SUITES } from '../../evaluation/evaluator';
import { BenchmarkRunner, BenchmarkResult, CatastrophicForgettingReport } from '../../benchmarks/benchmark_runner';

interface EvaluateTabProps {
  currentProject: BrainProject;
  model: NanoGPTModel;
  tokenizer: NanoTokenizer;
}

export const EvaluateTab: React.FC<EvaluateTabProps> = ({
  currentProject,
  model,
  tokenizer,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentEval, setCurrentEval] = useState<EvaluationResult | null>(null);
  const [prevEval, setPrevEval] = useState<EvaluationResult | null>(null);

  // Hardware Benchmark state
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [forgettingReport, setForgettingReport] = useState<CatastrophicForgettingReport | null>(null);

  const activeCp = currentProject.checkpoints.find(c => c.id === currentProject.currentCheckpointId) || currentProject.checkpoints[0];

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    try {
      const res = await BenchmarkRunner.runBenchmark(activeCp.config, 4);
      setBenchmarkResult(res);

      // Evaluar Catastrophic Forgetting usando el loss del checkpoint actual vs baseline
      const report = BenchmarkRunner.evaluateForgetting(1.85, activeCp.metrics?.loss || 1.92);
      setForgettingReport(report);
    } catch (err) {
      console.error('Benchmark error', err);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleRunEvaluation = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      try {
        if (currentEval) {
          setPrevEval(currentEval);
        }
        const result = runEvaluationSuite(model, tokenizer, activeCp.id);
        setCurrentEval(result);
      } catch (err) {
        console.error('Evaluation error', err);
      } finally {
        setIsEvaluating(false);
      }
    }, 50);
  };

  const suiteNames: Record<string, string> = {
    instruction_following: 'Seguimiento de Instrucciones',
    lua: 'Conocimiento y Sintaxis Lua',
    personality: 'Generalización de Personalidad',
    unknown: 'Honestidad (Admitir no saber)',
    language: 'Comprensión Multilingüe',
    consistency: 'Consistencia de Identidad',
  };

  return (
    <div id="evaluate-tab-container" className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Evaluación y Benchmarking Neuronal</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            <strong className="text-white">Regla estricta:</strong> Nunca asumir que el modelo mejoró solo porque bajó la loss. La loss mide perplejidad estadística; los benchmarks evalúan obediencia, consistencia y capacidades funcionales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-run-hardware-benchmark"
            disabled={isBenchmarking}
            onClick={handleRunBenchmark}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-indigo-950"
          >
            {isBenchmarking ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Midiendo Hardware...</span>
              </>
            ) : (
              <>
                <Gauge className="w-3.5 h-3.5" />
                <span>Benchmark Hardware (ms/tok)</span>
              </>
            )}
          </button>

          <button
            id="btn-run-evaluation-suite"
            disabled={isEvaluating}
            onClick={handleRunEvaluation}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
          >
            {isEvaluating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Ejecutando Pruebas...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Batería de Pruebas</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hardware Benchmark & Catastrophic Forgetting HUD */}
      {benchmarkResult && (
        <div id="benchmark-results-card" className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-base font-bold text-white">Telemetría de Cómputo Real (Benchmark de Rendimiento)</h3>
                <p className="text-xs text-slate-400">
                  Medición empírica en navegador: {benchmarkResult.architectureName} ({benchmarkResult.paramCountFormatted} parámetros)
                </p>
              </div>
            </div>
            <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-2.5 py-0.5 rounded font-mono font-bold uppercase">
              Rendimiento: {benchmarkResult.rating}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">FORWARD PASS</span>
              <span className="text-base font-mono font-bold text-white">{benchmarkResult.forwardMs} ms</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">BACKWARD PASS</span>
              <span className="text-base font-mono font-bold text-white">{benchmarkResult.backwardMs} ms</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">ADAMW STEP</span>
              <span className="text-base font-mono font-bold text-white">{benchmarkResult.optimizerStepMs} ms</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">CICLO TOTAL</span>
              <span className="text-base font-mono font-bold text-emerald-400">{benchmarkResult.totalStepMs} ms</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-1">THROUGHPUT</span>
              <span className="text-base font-mono font-bold text-purple-400">{benchmarkResult.inferenceTokensPerSecond} tok/s</span>
            </div>
          </div>

          {forgettingReport && (
            <div className="mt-3 p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Diagnóstico de Olvido Catastrófico (Anchor Test):</span>
                  <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                    forgettingReport.status === 'safe'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : forgettingReport.status === 'warning'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-red-950 text-red-300 border border-red-800'
                  }`}>
                    {forgettingReport.status}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">{forgettingReport.recommendation}</p>
              </div>

              <div className="flex items-center gap-4 text-right font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">SCORE PRESERVACIÓN</span>
                  <span className="text-sm font-bold text-emerald-400">{forgettingReport.preservationScore}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">DELTA LOSS</span>
                  <span className={`text-sm font-bold ${forgettingReport.deltaLoss <= 0.1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {forgettingReport.deltaLoss > 0 ? `+${forgettingReport.deltaLoss}` : forgettingReport.deltaLoss}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scientific Disclaimer */}
      <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <span>
          <strong>Nota de rigor experimental:</strong> Estas métricas son evaluaciones empíricas creadas específicamente para los objetivos del proyecto y no constituyen afirmaciones científicas universales de AGI o inteligencia general.
        </span>
      </div>

      {/* Overall Score & Side-by-Side Comparison */}
      {currentEval && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-mono text-slate-400">EVALUACIÓN DE CHECKPOINT</span>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {currentEval.checkpointId}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block font-mono">PUNTUACIÓN GLOBAL</span>
                <span className="text-2xl font-bold text-emerald-400 font-mono">
                  {currentEval.overallScore}%
                </span>
              </div>
              {prevEval && (
                <div className="flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700">
                  {currentEval.overallScore >= prevEval.overallScore ? (
                    <span className="text-emerald-400 flex items-center">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      +{currentEval.overallScore - prevEval.overallScore}% vs anterior
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center">
                      <ArrowDownRight className="w-3.5 h-3.5" />
                      {currentEval.overallScore - prevEval.overallScore}% vs anterior
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Suite Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
            {Object.entries(currentEval.suiteScores).map(([suite, score]) => {
              const scoreNum = Number(score);
              const prevScore = prevEval?.suiteScores[suite];
              const prevScoreNum = prevScore !== undefined ? Number(prevScore) : null;
              const delta = prevScoreNum !== null ? scoreNum - prevScoreNum : null;

              return (
                <div key={suite} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-sans font-semibold text-xs">
                      {suiteNames[suite] || suite}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">{scoreNum}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, scoreNum))}%` }}
                    />
                  </div>

                  {delta !== null && (
                    <div className="text-[10px] flex items-center justify-between text-slate-400 pt-1">
                      <span>Delta vs anterior:</span>
                      <span className={delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {delta >= 0 ? `+${delta}%` : `${delta}%`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detailed Test Prompts and Responses */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-bold text-white">Detalle de Pruebas Individuales</h4>
            <div className="space-y-3 font-mono text-xs">
              {currentEval.details.map((t) => (
                <div
                  key={t.testId}
                  className={`p-4 rounded-xl border ${
                    t.passed ? 'bg-slate-950/90 border-slate-800' : 'bg-red-950/20 border-red-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {t.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="font-bold text-white font-sans">{t.testId}</span>
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                        {t.suite}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        t.passed ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                      }`}
                    >
                      Puntaje: {t.score}/100
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div>
                      <span className="text-slate-400">Input de evaluación: </span>
                      <span className="text-slate-200">"{t.prompt}"</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Respuesta generada por nanoGPT: </span>
                      <span className="text-emerald-300 font-bold">"{t.response}"</span>
                    </div>
                    <div className="text-slate-500 text-[10px] pt-1">
                      Criterio: {t.feedback}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!currentEval && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-12 text-center text-slate-400 text-xs space-y-3">
          <Scale className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-300 font-semibold">No se han ejecutado benchmarks en esta sesión.</p>
          <p className="text-slate-500 max-w-md mx-auto">
            Haz clic en "Ejecutar Batería de Pruebas" para generar respuestas en tiempo real y calcular el cumplimiento de instrucciones, Lua, honestidad y personalidad.
          </p>
        </div>
      )}
    </div>
  );
};
