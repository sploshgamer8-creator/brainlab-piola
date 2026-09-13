import React, { useState, useEffect } from 'react';
import { Cpu, Layers, CheckCircle2, Play, AlertCircle, Eye, Sparkles, Terminal, HardDrive, Shield, Server, Zap } from 'lucide-react';
import { BrainProject } from '../../core/types';
import { runNanoGPTCoreAudit, FullAuditReport } from '../../core/verification';
import { ModelRegistry, RegisteredModel } from '../../models/model_registry';
import { BackendSelector, SystemCapabilities } from '../../runtime/BackendSelector';
import { StorageManager } from '../../storage/storage_manager';

interface ModelTabProps {
  currentProject: BrainProject;
  onSwitchStudentArchitecture?: (model: RegisteredModel) => void;
}

export const ModelTab: React.FC<ModelTabProps> = ({ currentProject, onSwitchStudentArchitecture }) => {
  const [activeLayer, setActiveLayer] = useState<string>('c_attn');
  const [auditReport, setAuditReport] = useState<FullAuditReport | null>(null);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [modelsList, setModelsList] = useState<RegisteredModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('nanogpt-218k-default');
  const [systemCaps, setSystemCaps] = useState<SystemCapabilities | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usageMB: number; quotaMB: number; percentage: number }>({ usageMB: 0, quotaMB: 1024, percentage: 0 });

  useEffect(() => {
    setModelsList(ModelRegistry.listModels());
    BackendSelector.initializeAll().then(caps => setSystemCaps(caps));
    StorageManager.getStorageEstimate().then(est => setStorageUsage(est));
  }, []);

  const activeCp = currentProject.checkpoints.find(c => c.id === currentProject.currentCheckpointId) || currentProject.checkpoints[0];
  const cfg = activeCp.config;

  const handleRunAudit = async () => {
    setIsRunningAudit(true);
    try {
      const report = await runNanoGPTCoreAudit();
      setAuditReport(report);
    } catch (err) {
      console.error('Audit failed', err);
    } finally {
      setIsRunningAudit(false);
    }
  };

  return (
    <div id="model-tab-container" className="space-y-6">
      {/* Top Overview Bar */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Arquitectura Neuronal nanoGPT (Andrej Karpathy)</h2>
            <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">
              GPT-2 Decoder-Only
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Estructura idéntica al repositorio oficial de Karpathy, ejecutada con matemática pura de tensores y arrays tipados Float32.
          </p>
        </div>

        <button
          id="btn-run-core-audit"
          onClick={handleRunAudit}
          disabled={isRunningAudit}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-950"
        >
          {isRunningAudit ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Auditando Núcleo nanoGPT...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Ejecutar Auditoría Fase 0</span>
            </>
          )}
        </button>
      </div>

      {/* Phase 0 Audit Results Banner */}
      {auditReport && (
        <div
          id="audit-results-panel"
          className={`p-5 rounded-xl border ${
            auditReport.allPassed
              ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200'
              : 'bg-red-950/30 border-red-600/40 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              {auditReport.allPassed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
              Informe de Auditoría Automática (Fase 0 - Núcleo Funcional)
            </h3>
            <span className="text-xs font-mono opacity-75">
              Duración total: {auditReport.totalDurationMs.toFixed(1)}ms
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {auditReport.results.map((res, i) => (
              <div
                key={i}
                className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{res.step}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      res.passed ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                    }`}
                  >
                    {res.passed ? 'PASADO' : 'FALLO'}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] font-sans leading-relaxed">{res.message}</p>
                <div className="text-[10px] text-slate-500 pt-1">
                  Latencia: {res.durationMs.toFixed(1)}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Visual Block Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Diagram */}
        <div className="lg:col-span-2 bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-5">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Flujo Computacional de nanoGPT
          </h3>

          <div className="space-y-3 font-mono text-xs">
            {/* Input & Embeddings */}
            <div
              onClick={() => setActiveLayer('embeddings')}
              className={`p-4 rounded-lg border transition cursor-pointer ${
                activeLayer === 'embeddings'
                  ? 'bg-slate-800 border-emerald-500 shadow-md shadow-emerald-950'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-200 font-bold mb-1">
                <span>1. Token & Position Embeddings</span>
                <span className="text-[10px] text-emerald-400">wte + wpe</span>
              </div>
              <p className="text-[11px] font-sans text-slate-400">
                Suma del embedding de token ({cfg.vocab_size} × {cfg.n_embd}) y el embedding posicional aprendido ({cfg.block_size} × {cfg.n_embd}).
              </p>
            </div>

            {/* Transformer Blocks Container */}
            <div className="p-4 rounded-lg border border-slate-700/60 bg-slate-950/80 space-y-3">
              <div className="flex items-center justify-between text-slate-200 font-bold">
                <span>2. Bloques Transformer repetidos ({cfg.n_layer} capas)</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                  Block 0 .. {cfg.n_layer - 1}
                </span>
              </div>

              {/* Sub-block 1: LN1 & Causal Self Attention */}
              <div className="pl-4 border-l-2 border-emerald-500/40 space-y-2">
                <div
                  onClick={() => setActiveLayer('ln_1')}
                  className={`p-2.5 rounded border transition cursor-pointer ${
                    activeLayer === 'ln_1' ? 'bg-slate-800 border-emerald-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>Pre-LayerNorm 1 (ln_1)</span>
                    <span className="text-slate-500">dim = {cfg.n_embd}</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveLayer('c_attn')}
                  className={`p-3 rounded border transition cursor-pointer ${
                    activeLayer === 'c_attn' ? 'bg-slate-800 border-emerald-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-bold text-emerald-300 mb-1">
                    <span>Causal Self-Attention (Multi-Head)</span>
                    <span className="text-emerald-400">{cfg.n_head} heads</span>
                  </div>
                  <p className="text-[11px] font-sans text-slate-400">
                    Q, K, V proyectados en c_attn ({cfg.n_embd} → {3 * cfg.n_embd}). Máscara causal triangular inferior. Proyección de salida c_proj.
                  </p>
                </div>

                <div className="text-[10px] text-slate-500 italic pl-2">
                  ↳ Conexión Residual: x = x + Attention(ln_1(x))
                </div>
              </div>

              {/* Sub-block 2: LN2 & MLP */}
              <div className="pl-4 border-l-2 border-blue-500/40 space-y-2 pt-1">
                <div
                  onClick={() => setActiveLayer('ln_2')}
                  className={`p-2.5 rounded border transition cursor-pointer ${
                    activeLayer === 'ln_2' ? 'bg-slate-800 border-emerald-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>Pre-LayerNorm 2 (ln_2)</span>
                    <span className="text-slate-500">dim = {cfg.n_embd}</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveLayer('mlp')}
                  className={`p-3 rounded border transition cursor-pointer ${
                    activeLayer === 'mlp' ? 'bg-slate-800 border-emerald-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-bold text-blue-300 mb-1">
                    <span>MLP FeedForward con GELU</span>
                    <span className="text-blue-400">4× expansión ({4 * cfg.n_embd})</span>
                  </div>
                  <p className="text-[11px] font-sans text-slate-400">
                    Expansión c_fc ({cfg.n_embd} → {4 * cfg.n_embd}), activación exacta GELU de Karpathy, compresión c_proj ({4 * cfg.n_embd} → {cfg.n_embd}).
                  </p>
                </div>

                <div className="text-[10px] text-slate-500 italic pl-2">
                  ↳ Conexión Residual: x = x + MLP(ln_2(x))
                </div>
              </div>
            </div>

            {/* Final LayerNorm & LM Head */}
            <div
              onClick={() => setActiveLayer('lm_head')}
              className={`p-4 rounded-lg border transition cursor-pointer ${
                activeLayer === 'lm_head'
                  ? 'bg-slate-800 border-emerald-500 shadow-md shadow-emerald-950'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-slate-200 font-bold mb-1">
                <span>3. Final LayerNorm (ln_f) & LM Head</span>
                <span className="text-[10px] text-amber-400">{cfg.n_embd} → {cfg.vocab_size} logits</span>
              </div>
              <p className="text-[11px] font-sans text-slate-400">
                Normalización final y proyección lineal que produce la distribución de probabilidades para el siguiente token.
              </p>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Component Inspector & Tensor Shapes */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" />
            Inspector de Tensores & Dimensiones
          </h3>

          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs space-y-3">
            <div className="border-b border-slate-800 pb-2">
              <span className="text-slate-400 text-[10px]">COMPONENTE SELECCIONADO</span>
              <div className="text-sm font-bold text-emerald-300 uppercase">{activeLayer}</div>
            </div>

            {activeLayer === 'c_attn' && (
              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_attn.weight:</span>
                  <span className="text-white font-bold">[{cfg.n_embd}, {3 * cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_attn.bias:</span>
                  <span className="text-white font-bold">[{3 * cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_proj.weight:</span>
                  <span className="text-white font-bold">[{cfg.n_embd}, {cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dimensión por Head (d_k):</span>
                  <span className="text-white font-bold">{cfg.n_embd / cfg.n_head}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Máscara Causal:</span>
                  <span className="text-emerald-400">Triangular j ≤ i</span>
                </div>
              </div>
            )}

            {activeLayer === 'mlp' && (
              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_fc.weight:</span>
                  <span className="text-white font-bold">[{cfg.n_embd}, {4 * cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_fc.bias:</span>
                  <span className="text-white font-bold">[{4 * cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Función de activación:</span>
                  <span className="text-blue-400 font-bold">GELU Aproximada</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tensor c_proj.weight:</span>
                  <span className="text-white font-bold">[{4 * cfg.n_embd}, {cfg.n_embd}]</span>
                </div>
              </div>
            )}

            {activeLayer === 'embeddings' && (
              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">wte (Tokens):</span>
                  <span className="text-white font-bold">[{cfg.vocab_size}, {cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">wpe (Posiciones):</span>
                  <span className="text-white font-bold">[{cfg.block_size}, {cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tamaño Contexto:</span>
                  <span className="text-emerald-400">{cfg.block_size} tokens</span>
                </div>
              </div>
            )}

            {activeLayer === 'lm_head' && (
              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">lm_head.weight:</span>
                  <span className="text-white font-bold">[{cfg.n_embd}, {cfg.vocab_size}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ln_f.weight / bias:</span>
                  <span className="text-white font-bold">[{cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Distribución de salida:</span>
                  <span className="text-amber-400 font-bold">Logits Vocabulario</span>
                </div>
              </div>
            )}

            {(activeLayer === 'ln_1' || activeLayer === 'ln_2') && (
              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Gamma (weight):</span>
                  <span className="text-white font-bold">[{cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Beta (bias):</span>
                  <span className="text-white font-bold">[{cfg.n_embd}]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Epsilon numérico:</span>
                  <span className="text-white font-bold">1e-5</span>
                </div>
              </div>
            )}
          </div>

          {/* Hyperparameters Card */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs space-y-2 font-mono">
            <span className="text-slate-400 text-[10px] block">PARÁMETROS GLOBALES DEL CHECKPOINT</span>
            <div className="flex justify-between text-slate-300">
              <span>Capas (n_layer):</span>
              <span className="font-bold text-white">{cfg.n_layer}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Heads (n_head):</span>
              <span className="font-bold text-white">{cfg.n_head}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Embedding (n_embd):</span>
              <span className="font-bold text-white">{cfg.n_embd}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Contexto (block_size):</span>
              <span className="font-bold text-white">{cfg.block_size}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Vocabulario:</span>
              <span className="font-bold text-white">{cfg.vocab_size} tokens</span>
            </div>
            <div className="flex justify-between text-emerald-400 pt-2 border-t border-slate-800 font-bold">
              <span>Total de Parámetros:</span>
              <span>{(activeCp.paramCount).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware & Runtime Detection HUD */}
      <div id="hardware-detection-hud" className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Detección de Hardware & Runtimes de Ejecución</h3>
          </div>
          <span className="text-xs bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 px-2.5 py-0.5 rounded font-mono">
            BackendSelector Activo: {selectedModelId}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">WebGPU:</span>
            <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${systemCaps?.hasWebGPU ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
              {systemCaps?.hasWebGPU ? 'DISPONIBLE' : 'FALLBACK CPU'}
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">WASM SIMD:</span>
            <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              {systemCaps?.hasWASM ? 'ACTIVO' : 'NO'}
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Núcleos CPU:</span>
            <span className="font-mono font-bold text-white">
              {systemCaps?.hardwareConcurrency || 4} Hilos
            </span>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Disco IndexedDB:</span>
            <span className="font-mono font-bold text-emerald-400">
              {storageUsage.quotaMB > 0 ? `${storageUsage.quotaMB} MB cuota` : 'Ilimitado'}
            </span>
          </div>
        </div>
      </div>

      {/* Benchmark Summary Table & Architectural Trade-offs */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Métricas de Rendimiento Empírico en CPU (Modelos Alumnos)</h3>
          </div>
          <span className="text-xs bg-amber-950/70 text-amber-300 border border-amber-800 px-2.5 py-0.5 rounded font-mono">
            Calibrado en Tiempo Real
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2">Arquitectura</th>
                <th className="pb-2">Parámetros</th>
                <th className="pb-2">RAM Entreno</th>
                <th className="pb-2">Forward</th>
                <th className="pb-2">Backward</th>
                <th className="pb-2 text-emerald-400">Step Total</th>
                <th className="pb-2 text-indigo-400">Inferencia</th>
                <th className="pb-2">Perfil Óptimo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 font-bold text-white">Nano Student (Karpathy)</td>
                <td>~221K</td>
                <td className="text-emerald-400">2.94 MB</td>
                <td>68.6 ms</td>
                <td>77.7 ms</td>
                <td className="text-emerald-400 font-bold">~150 ms</td>
                <td className="text-indigo-300">156 tok/s</td>
                <td className="text-slate-400">Ultra-ágil en navegador</td>
              </tr>
              <tr className="hover:bg-slate-800/30 bg-emerald-950/20">
                <td className="py-2.5 font-bold text-emerald-300">Micro Student ★ Sweet Spot</td>
                <td className="text-emerald-300 font-bold">~503K</td>
                <td className="text-emerald-400">6.71 MB</td>
                <td>72.2 ms</td>
                <td>160.5 ms</td>
                <td className="text-emerald-400 font-bold">~240 ms</td>
                <td className="text-indigo-300">100 tok/s</td>
                <td className="text-emerald-400">Equilibrio ideal (4 pasos/s)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 font-bold text-white">Medium Student</td>
                <td>~1.60M</td>
                <td>21.32 MB</td>
                <td>483.1 ms</td>
                <td>932.6 ms</td>
                <td className="text-amber-400 font-bold">~1.45 s</td>
                <td className="text-indigo-300">26 tok/s</td>
                <td className="text-slate-400">Sintaxis profunda y Lua</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 font-bold text-white">Scaled Student</td>
                <td>~2.89M</td>
                <td>38.60 MB</td>
                <td>901.0 ms</td>
                <td>1,955.6 ms</td>
                <td className="text-red-400 font-bold">~2.91 s</td>
                <td className="text-indigo-300">15 tok/s</td>
                <td className="text-slate-400">Entrenamiento asíncrono</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Registry (Unified Catalog) */}
      <div id="model-registry-section" className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-400" />
              Catálogo Unificado de Modelos (Model Registry)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestión desacoplada: Selecciona y activa el modelo alumno deseado, o conecta profesores de frontera para destilación.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {modelsList.length} Modelos Registrados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modelsList.map((m) => {
            const isSelected = selectedModelId === m.id;
            const isCurrentActiveStudent = m.role === 'student_trainable' && m.gptConfig &&
              m.gptConfig.n_embd === cfg.n_embd && m.gptConfig.n_layer === cfg.n_layer;

            return (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedModelId(m.id);
                  BackendSelector.selectBackend(m.id);
                }}
                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isCurrentActiveStudent
                    ? 'bg-emerald-950/20 border-emerald-500/80 ring-1 ring-emerald-500/30'
                    : isSelected
                    ? 'bg-slate-800/80 border-indigo-500/80 ring-1 ring-indigo-500/30'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                      {m.role === 'student_trainable' ? (
                        <Cpu className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Zap className="w-4 h-4 text-purple-400" />
                      )}
                      {m.name}
                    </h4>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                      m.role === 'student_trainable'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-purple-950 text-purple-300 border border-purple-800'
                    }`}>
                      {m.parameterCountFormatted}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                    {m.description}
                  </p>

                  {/* Empirical benchmark stats badge row */}
                  {m.benchmark && (
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 mb-3 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-400 block text-[9px]">PASO TOTAL</span>
                        <span className="text-emerald-400 font-bold">{m.benchmark.stepMs} ms</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">INFERENCIA</span>
                        <span className="text-indigo-400 font-bold">{m.benchmark.tokPerSec} tok/s</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">RAM ENTRENO</span>
                        <span className="text-slate-200 font-bold">{m.benchmark.trainRAM_MB} MB</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      Runtime: <strong className="text-slate-200">{m.runtime}</strong>
                    </span>
                  </div>

                  {m.role === 'student_trainable' ? (
                    isCurrentActiveStudent ? (
                      <span className="text-emerald-400 bg-emerald-950/80 border border-emerald-700/80 px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ALUMNO ACTIVO
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSwitchStudentArchitecture) {
                            onSwitchStudentArchitecture(m);
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded text-xs flex items-center gap-1 transition shadow-md shadow-emerald-950"
                      >
                        <Zap className="w-3 h-3" />
                        Activar este Alumno
                      </button>
                    )
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold text-purple-300 bg-purple-950/60 border border-purple-800">
                      Profesor de Destilación
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
