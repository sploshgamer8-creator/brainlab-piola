import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, StepForward, Save, Zap, AlertCircle, TrendingDown, Gauge, Repeat, SlidersHorizontal, Sparkles, Copy } from 'lucide-react';
import { BrainProject, CheckpointMetadata, DatasetItem, PersonalityTraits, TrainingHyperparameters } from '../../core/types';
import { OmniDistillPanel } from '../OmniDistillPanel';
import { fetchDistillationBatch } from '../../core/distill_service';
import axios from 'axios';

interface TrainTabProps {
  currentProject: BrainProject;
  traits: PersonalityTraits;
  isTraining: boolean;
  currentStep: number;
  currentLoss: number;
  tokensProcessed: number;
  tokensPerSec: number;
  lossHistory: { step: number; loss: number }[];
  hyperparams: TrainingHyperparameters;
  onUpdateHyperparams: (hp: TrainingHyperparameters) => void;
  onStartTraining: (steps: number) => void;
  onPauseTraining: () => void;
  onStepOnce: () => void;
  onSaveCheckpoint: (notes: string) => void;
  onInjectSamplesAndTrain: (samples: DatasetItem[]) => void;
  onLoadPretrainedWeights: (type: 'spanish' | 'lua') => void;
}

export const TrainTab: React.FC<TrainTabProps> = ({
  currentProject,
  traits,
  isTraining,
  currentStep,
  currentLoss,
  tokensProcessed,
  tokensPerSec,
  lossHistory,
  hyperparams,
  onUpdateHyperparams,
  onStartTraining,
  onPauseTraining,
  onStepOnce,
  onSaveCheckpoint,
  onInjectSamplesAndTrain,
  onLoadPretrainedWeights,
}) => {
  const [stepsToRun, setStepsToRun] = useState(100);
  const [checkpointNotes, setCheckpointNotes] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isAutoFarming, setIsAutoFarming] = useState(() => {
    return localStorage.getItem('brainlab_autofarming_active') === 'true';
  });
  const autoFarmingRef = useRef(false);
  const [autoFarmingTopic, setAutoFarmingTopic] = useState(() => {
    return localStorage.getItem('brainlab_autofarming_topic') || 'PiolaCraft: Guía de supervivencia, crafteos VoxeLibre, mecánicas del juego y personalidad de Lucy';
  });
  const [autoFarmingRounds, setAutoFarmingRounds] = useState(() => {
    return Number(localStorage.getItem('brainlab_autofarming_rounds')) || 0;
  });
  const [autoFarmingStatus, setAutoFarmingStatus] = useState<string | null>(null);
  const [autoFarmingLogs, setAutoFarmingLogs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('brainlab_autofarming_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [autoFarmingStepsPerBatch, setAutoFarmingStepsPerBatch] = useState(() => {
    return Number(localStorage.getItem('brainlab_autofarming_steps')) || 30;
  });
  const [autoFarmingBatchSize, setAutoFarmingBatchSize] = useState(() => {
    return Number(localStorage.getItem('brainlab_autofarming_batch')) || 4;
  });
  const [autoFarmingSource, setAutoFarmingSource] = useState<'omniroute' | 'railway'>(() => {
    return (localStorage.getItem('brainlab_autofarming_source') as 'omniroute' | 'railway') || 'railway';
  });

  useEffect(() => {
    localStorage.setItem('brainlab_autofarming_topic', autoFarmingTopic);
  }, [autoFarmingTopic]);

  useEffect(() => {
    localStorage.setItem('brainlab_autofarming_steps', String(autoFarmingStepsPerBatch));
  }, [autoFarmingStepsPerBatch]);

  useEffect(() => {
    localStorage.setItem('brainlab_autofarming_batch', String(autoFarmingBatchSize));
  }, [autoFarmingBatchSize]);

  useEffect(() => {
    localStorage.setItem('brainlab_autofarming_source', autoFarmingSource);
  }, [autoFarmingSource]);

  const addLog = (msg: string | null) => { 
    setAutoFarmingStatus(msg); 
    if (msg) {
      setAutoFarmingLogs(prev => {
        const next = [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`];
        try {
          localStorage.setItem('brainlab_autofarming_logs', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  const fetchBatchFromSource = async (): Promise<DatasetItem[]> => {
    if (autoFarmingSource === 'railway') {
      try {
        const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        const CLOUD_URL = isLocal ? 'https://brainlab-production.up.railway.app' : '';
        
        const dispatchRes = await axios.post(`${CLOUD_URL}/api/cloud/teacher-pool/dispatch`, {
          topic: autoFarmingTopic,
          count: autoFarmingBatchSize,
          model: 'openai/gpt-oss-20b'
        }, { timeout: 6000 });

        const jobId = dispatchRes.data?.jobId;
        if (jobId) {
          let jobStatus = 'queued';
          let attempts = 0;
          while (jobStatus !== 'completed' && jobStatus !== 'failed' && autoFarmingRef.current && attempts < 8) {
            attempts++;
            await new Promise(r => setTimeout(r, 1500));
            const statusRes = await axios.get(`${CLOUD_URL}/api/cloud/teacher-pool/status/${jobId}`, { timeout: 5000 });
            jobStatus = statusRes.data?.status;
            if (jobStatus === 'completed' && statusRes.data?.samples) {
              const parsed = typeof statusRes.data.samples === 'string' ? JSON.parse(statusRes.data.samples) : statusRes.data.samples;
              if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed as DatasetItem[];
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Railway Teacher Pool en espera, activando destilador de alta velocidad:', err.message);
      }

      // Fallback instantáneo a destilador garantizado si Railway tarda más de 12s
      const distillRes = await fetchDistillationBatch({
        topic: autoFarmingTopic,
        category: 'spanish',
        count: autoFarmingBatchSize,
        traits,
        complexity: 'conversational',
      });
      return distillRes.candidates || [];
    } else {
      const omniRouteUrl = localStorage.getItem('local_brain_omniroute_url') || '';
      const omniRouteApiKey = localStorage.getItem('local_brain_omniroute_key') || localStorage.getItem('local_brain_openai_key') || '';
      const omniRouteModel = localStorage.getItem('local_brain_omniroute_model') || localStorage.getItem('local_brain_openai_model') || 'gpt-4o-mini';

      const distillRes = await fetchDistillationBatch({
        topic: autoFarmingTopic,
        category: 'spanish',
        count: autoFarmingBatchSize,
        traits,
        complexity: 'conversational',
        omniRouteUrl: omniRouteUrl || undefined,
        omniRouteApiKey: omniRouteApiKey || undefined,
        omniRouteModel: omniRouteModel || undefined,
      });
      return distillRes.candidates || [];
    }
  };

  const startAutoFarming = async () => {
    setIsAutoFarming(true);
    autoFarmingRef.current = true;
    localStorage.setItem('brainlab_autofarming_active', 'true');
    addLog('Iniciando pipeline paralelo (Inferencia Cloud + Entrenamiento Local)...');

    let round = autoFarmingRounds;
    
    // Iniciar el pre-fetch del primer lote en paralelo
    let nextBatchPromise = fetchBatchFromSource();

    while (autoFarmingRef.current) {
      round++;
      setAutoFarmingRounds(round);
      localStorage.setItem('brainlab_autofarming_rounds', String(round));
      
      addLog(`[Ronda ${round}] Esperando lote de generación del Maestro...`);
      
      try {
        const candidates = await nextBatchPromise;
        if (!autoFarmingRef.current) break;

        if (candidates && candidates.length > 0) {
          // Iniciar Inmediatamente la búsqueda de la SIGUIENTE ronda
          nextBatchPromise = fetchBatchFromSource();

          // Inyectar a la base de datos de React/Entrenamiento
          onInjectSamplesAndTrain(candidates);
          
          // Iniciar el backpropagation local de esta ronda (bloquea hasta terminar)
          addLog(`[Ronda ${round}] Entrenando red local (${autoFarmingStepsPerBatch} pasos) mientras la nube genera la Ronda ${round + 1}...`);
          await onStartTraining(autoFarmingStepsPerBatch);
        } else {
          addLog(`[Ronda ${round}] Lote vacío o fallido. Reintentando en 3s...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          nextBatchPromise = fetchBatchFromSource();
        }
      } catch (err: any) {
        addLog(`Error en ronda ${round}: ${err.message}. Reintentando en 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        nextBatchPromise = fetchBatchFromSource();
      }

      if (autoFarmingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsAutoFarming(false);
    addLog(null);
  };

  const stopAutoFarming = () => {
    autoFarmingRef.current = false;
    setIsAutoFarming(false);
    localStorage.setItem('brainlab_autofarming_active', 'false');
    addLog(null);
    onPauseTraining();
  };

  // Auto-resume continuous farming across page refreshes if previously active
  useEffect(() => {
    if (localStorage.getItem('brainlab_autofarming_active') === 'true' && !autoFarmingRef.current) {
      const timer = setTimeout(() => {
        if (!autoFarmingRef.current && localStorage.getItem('brainlab_autofarming_active') === 'true') {
          startAutoFarming();
        }
      }, 700);
      return () => clearTimeout(timer);
    }
  }, []);

  // SVG Chart points calculation (Resistente a NaN)
  const chartHeight = 160;
  const chartWidth = 600;
  const validHistory = lossHistory
    .filter(h => h && typeof h.loss === 'number' && Number.isFinite(h.loss))
    .slice(-60); // Last 60 valid points

  const rawMax = validHistory.length > 0 ? Math.max(...validHistory.map(h => h.loss)) : 5.0;
  const rawMin = validHistory.length > 0 ? Math.min(...validHistory.map(h => h.loss)) : 0.1;

  const maxLoss = Number.isFinite(rawMax) ? Math.max(5.0, rawMax) : 5.0;
  const minLoss = Number.isFinite(rawMin) ? Math.max(0.1, Math.min(1.0, rawMin)) : 0.1;
  const range = Math.max(1e-4, maxLoss - minLoss);

  const points = validHistory.map((h, index) => {
    const x = validHistory.length <= 1 ? 0 : (index / (validHistory.length - 1)) * chartWidth;
    const safeLoss = Number.isFinite(h.loss) ? h.loss : minLoss;
    const norm = Math.min(1, Math.max(0, (safeLoss - minLoss) / range));
    const y = chartHeight - norm * (chartHeight - 30) - 15;
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : chartHeight / 2;
    return `${safeX.toFixed(1)},${safeY.toFixed(1)}`;
  }).join(' ');

  return (
    <div id="train-tab-container" className="space-y-6">
      {/* OmniRoute Distillation & Knowledge Transfer Panel */}
      <OmniDistillPanel
        traits={traits}
        isTraining={isTraining}
        onInjectSamplesAndTrain={onInjectSamplesAndTrain}
        onLoadPretrainedWeights={onLoadPretrainedWeights}
      />

      {/* Auto-Farming & Continuous Distillation Loop HUD */}
      <div className="bg-slate-900/90 rounded-xl border border-emerald-500/40 p-6 space-y-4 shadow-lg shadow-emerald-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Auto-Farming & DestilaciÃ³n Continua Supervisada (GPT-4)
                {isAutoFarming && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Ciclo autÃ³nomo de extracciÃ³n de pares sintÃ©ticos de alta densidad y absorciÃ³n en los pesos del alumno con buffer anti-olvido (25% Replay).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {autoFarmingLogs.length > 0 && (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(autoFarmingLogs.join('\n'))}
                title="Copiar Logs"
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition border border-slate-700"
              >
                <Copy className="w-3.5 h-3.5" />
                Logs
              </button>
            )}
            {isAutoFarming ? (
              <button
                type="button"
                onClick={stopAutoFarming}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-rose-950"
              >
                <Pause className="w-3.5 h-3.5" />
                Detener Auto-Farming
              </button>
            ) : (
              <button
                type="button"
                disabled={isTraining}
                onClick={startAutoFarming}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
              >
                <Play className="w-3.5 h-3.5" />
                Iniciar Auto-Farming Continuo
              </button>
            )}
          </div>
        </div>

        {/* Configuration inputs when idle, or live metrics when active */}
        {!isAutoFarming ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-4">
              <label className="block text-slate-400 mb-1">Fuente del Maestro:</label>
              <select
                value={autoFarmingSource}
                onChange={e => setAutoFarmingSource(e.target.value as 'omniroute' | 'railway')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 mb-2"
              >
                <option value="omniroute">OmniRoute / OpenAI / GPT-4</option>
                <option value="railway">Railway Cloud Qwen-7B (Background Worker)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-400">Tema / Dominio a Destilar:</label>
                <span className="text-[10px] text-emerald-400 font-mono">Piso Mínimo de Frontera</span>
              </div>
              <input
                type="text"
                value={autoFarmingTopic}
                onChange={e => setAutoFarmingTopic(e.target.value)}
                placeholder="Ej. Stanford Alpaca o CodeAlpaca"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs font-mono focus:outline-none focus:border-emerald-500 mb-1.5"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoFarmingTopic('PiolaCraft: Guía de supervivencia, crafteos VoxeLibre, mecánicas del juego y personalidad de Lucy')}
                  className="text-[10px] bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-300 font-bold px-2 py-0.5 rounded transition shadow-sm"
                >
                  🎮 PiolaCraft: Lucy & VoxeLibre
                </button>
                <button
                  type="button"
                  onClick={() => setAutoFarmingTopic('Stanford Alpaca: Instrucciones complejas, razonamiento formal y resolución analítica')}
                  className="text-[10px] bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 px-2 py-0.5 rounded transition"
                >
                  🏛️ Stanford Alpaca (52k)
                </button>
                <button
                  type="button"
                  onClick={() => setAutoFarmingTopic('CodeAlpaca: Algoritmos de alto rendimiento, optimización y estructuras de datos')}
                  className="text-[10px] bg-blue-950/70 hover:bg-blue-900 border border-blue-700/60 text-blue-300 px-2 py-0.5 rounded transition"
                >
                  💻 CodeAlpaca (20k)
                </button>
                <button
                  type="button"
                  onClick={() => setAutoFarmingTopic('Matemáticas: Optimización bajo restricciones múltiples KKT y derivadas analíticas')}
                  className="text-[10px] bg-amber-950/70 hover:bg-amber-900 border border-amber-700/60 text-amber-300 px-2 py-0.5 rounded transition"
                >
                  📐 Lógica KKT
                </button>
                <button
                  type="button"
                  onClick={() => setAutoFarmingTopic('Rust: Concurrencia segura con Tokio, canales MPSC y bajo consumo de memoria')}
                  className="text-[10px] bg-orange-950/70 hover:bg-orange-900 border border-orange-700/60 text-orange-300 px-2 py-0.5 rounded transition"
                >
                  ⚡ Rust Concurrente
                </button>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Muestras (Pares/Ronda):</label>
              <input
                type="number"
                min={1}
                max={20}
                value={autoFarmingBatchSize}
                onChange={e => setAutoFarmingBatchSize(parseInt(e.target.value) || 4)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Pasos (AdamW/Ronda):</label>
              <input
                type="number"
                min={10}
                max={200}
                value={autoFarmingStepsPerBatch}
                onChange={e => setAutoFarmingStepsPerBatch(parseInt(e.target.value) || 30)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div className="text-xs font-mono text-emerald-300">
                {autoFarmingStatus || 'Destilando conocimiento...'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">RONDAS COMPLETADAS</span>
                <span className="text-white font-bold text-base">{autoFarmingRounds}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">PÃ‰RDIDA ACTUAL (LOSS)</span>
                <span className="text-emerald-400 font-bold text-base">{currentLoss.toFixed(3)}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">PASO ACUMULADO</span>
                <span className="text-indigo-400 font-bold text-base">{currentStep}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top Banner */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Entrenamiento Neuronal Local (nanoGPT)</h2>
            <span className="text-xs bg-amber-950/70 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-mono">
              AdamW Optimizer
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Optimizador AdamW acoplado a backpropagation analÃ­tico calculando gradientes de atenciÃ³n causal y capas MLP completamente en el navegador.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isTraining ? (
            <button
              id="btn-pause-training"
              onClick={onPauseTraining}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-amber-950"
            >
              <Pause className="w-4 h-4" />
              Pausar Entrenamiento
            </button>
          ) : (
            <>
              <button
                id="btn-step-once"
                onClick={onStepOnce}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                title="Ejecutar exactamente 1 paso de entrenamiento"
              >
                <StepForward className="w-3.5 h-3.5" />
                Paso Ãšnico (1 iter)
              </button>
              <button
                id="btn-start-training"
                onClick={() => onStartTraining(stepsToRun)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
              >
                <Play className="w-4 h-4" />
                Entrenar {stepsToRun} Pasos
              </button>
            </>
          )}

          <button
            id="btn-open-save-checkpoint"
            onClick={() => setShowSaveModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            Guardar Checkpoint
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono">
          <span className="text-slate-400 text-xs block">PASO ACTUAL (STEP)</span>
          <span className="text-2xl font-bold text-white">{currentStep.toLocaleString()}</span>
          <div className="text-[10px] text-slate-500 mt-1">Iteraciones acumuladas</div>
        </div>

        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono">
          <span className="text-amber-400 text-xs block flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> PÃ‰RDIDA (LOSS)
          </span>
          <span className="text-2xl font-bold text-amber-300">{currentLoss.toFixed(4)}</span>
          <div className="text-[10px] text-slate-500 mt-1">Cross-Entropy Causal</div>
        </div>

        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono">
          <span className="text-emerald-400 text-xs block flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" /> VELOCIDAD LOCAL
          </span>
          <span className="text-2xl font-bold text-emerald-300">{tokensPerSec} <span className="text-xs font-normal text-slate-400">tok/s</span></span>
          <div className="text-[10px] text-slate-500 mt-1">Tokens procesados por segundo</div>
        </div>

        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono">
          <span className="text-blue-400 text-xs block">TOKENS TOTALES</span>
          <span className="text-2xl font-bold text-blue-300">{tokensProcessed.toLocaleString()}</span>
          <div className="text-[10px] text-slate-500 mt-1">Ventana causal de 64 tokens</div>
        </div>
      </div>

      {/* Live Loss Graph & Hyperparameters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Loss Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              Curva de PÃ©rdida en Tiempo Real (Cross-Entropy Loss)
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Últimos {validHistory.length} pasos
            </span>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-hidden">
            {validHistory.length > 1 && points.length > 0 ? (
              <div className="relative w-full h-44">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  <line x1="0" y1={chartHeight / 4} x2={chartWidth} y2={chartHeight / 4} stroke="#1e293b" strokeDasharray="4 4" />
                  <line x1="0" y1={chartHeight / 2} x2={chartWidth} y2={chartHeight / 2} stroke="#1e293b" strokeDasharray="4 4" />
                  <line x1="0" y1={(3 * chartHeight) / 4} x2={chartWidth} y2={(3 * chartHeight) / 4} stroke="#1e293b" strokeDasharray="4 4" />

                  {/* Gradient Area */}
                  <defs>
                    <linearGradient id="lossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <polygon
                    points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`}
                    fill="url(#lossGradient)"
                  />

                  {/* Path line */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />
                </svg>

                <div className="absolute top-2 left-2 text-[10px] font-mono text-slate-500">
                  Max: {maxLoss.toFixed(2)}
                </div>
                <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-500">
                  Min: {minLoss.toFixed(2)}
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500 font-mono">
                Presiona "Entrenar" para iniciar el loop y registrar la curva de pÃ©rdida.
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Hyperparameter Controls */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4 font-mono text-xs">
          <h3 className="text-base font-bold text-white flex items-center gap-2 font-sans">
            <Gauge className="w-4 h-4 text-emerald-400" />
            HiperparÃ¡metros de AdamW
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Learning Rate (lr):</span>
                <span className="text-emerald-400 font-bold">{hyperparams.learningRate}</span>
              </div>
              <input
                id="input-learning-rate"
                type="number"
                step="0.0001"
                min="0.00001"
                max="0.01"
                value={hyperparams.learningRate}
                onChange={e => onUpdateHyperparams({ ...hyperparams, learningRate: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Weight Decay:</span>
                <span className="text-slate-300">{hyperparams.weightDecay}</span>
              </div>
              <input
                type="number"
                step="0.005"
                min="0.0"
                max="0.2"
                value={hyperparams.weightDecay}
                onChange={e => onUpdateHyperparams({ ...hyperparams, weightDecay: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Grad Clip (MÃ¡x Norma):</span>
                <span className="text-slate-300">{hyperparams.gradClip}</span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={hyperparams.gradClip}
                onChange={e => onUpdateHyperparams({ ...hyperparams, gradClip: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Pasos por Lote (Steps to run):</span>
                <span className="text-amber-400 font-bold">{stepsToRun}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[50, 100, 250, 500].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStepsToRun(s)}
                    className={`py-1 rounded text-center transition ${
                      stepsToRun === s ? 'bg-amber-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Presets de RÃ©gimen de Aprendizaje */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-slate-400 block mb-2 font-sans font-semibold">Preajustes de RÃ©gimen:</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateHyperparams({ ...hyperparams, learningRate: 0.0003, weightDecay: 0.01, gradClip: 0.5 })}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded text-[10px] text-center transition border border-slate-700"
                  title="Ajuste fino conservador para no descalibrar pesos estables"
                >
                  Fine-tuning
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateHyperparams({ ...hyperparams, learningRate: 0.001, weightDecay: 0.1, gradClip: 1.0 })}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded text-[10px] text-center transition border border-slate-700"
                  title="Balance Ã³ptimo para aprender nuevos patrones rÃ¡pidamente"
                >
                  Equilibrado
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateHyperparams({ ...hyperparams, learningRate: 0.0025, weightDecay: 0.05, gradClip: 1.5 })}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded text-[10px] text-center transition border border-slate-700"
                  title="Tasa acelerada para salir de mÃ­nimos locales planos"
                >
                  Agresivo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Prioritized Experience Replay (PER) & Anti-Catastrophic Forgetting Card */}
      <div id="replay-buffer-card" className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">Buffer de Replay Priorizado (PER) & ProtecciÃ³n Anti-Olvido</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Muestreo ponderado por pÃ©rdida (loss) con conjunto de anclajes (Anchor Set) para prevenir el olvido catastrÃ³fico.
              </p>
            </div>
          </div>
          <span className="text-xs bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2.5 py-0.5 rounded font-mono">
            RÃ©gimen: 30% Nuevo | 50% Replay | 20% Ancla
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block">DEDUPLICACIÃ“N HASH (FNV-1a)</span>
            <span className="text-emerald-400 font-bold text-sm">ACTIVA (En Memoria & Disco)</span>
            <p className="text-[10px] text-slate-500 font-sans mt-1">
              Descarta pares idÃ©nticos y recalibra prioridades sin duplicar espacio.
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block">CONJUNTO ANCLA (ANCHOR DATASET)</span>
            <span className="text-amber-400 font-bold text-sm">PROTECCIÃ“N PERMANENTE</span>
            <p className="text-[10px] text-slate-500 font-sans mt-1">
              Los ejemplos sintÃ¡cticos esenciales nunca son desalojados del buffer.
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block">MOTOR DE ENTRENAMIENTO</span>
            <span className="text-blue-400 font-bold text-sm">HILO SECUNDARIO (WEB WORKER)</span>
            <p className="text-[10px] text-slate-500 font-sans mt-1">
              Descenso de gradiente asÃ­ncrono para mantener fluidez a 60 FPS en el cliente.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Save Checkpoint */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Save className="w-5 h-5 text-emerald-400" />
              Guardar Nuevo Checkpoint
            </h3>
            <p className="text-xs text-slate-400">
              Crea una instantÃ¡nea inmutable de los pesos neuronales, configuraciÃ³n y estado del paso {currentStep}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Notas del Checkpoint</label>
                <textarea
                  rows={3}
                  placeholder="ej. Entrenado sobre 45 ejemplos de Lua. PÃ©rdida reducida a 1.72."
                  value={checkpointNotes}
                  onChange={e => setCheckpointNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-save-checkpoint"
                onClick={() => {
                  onSaveCheckpoint(checkpointNotes);
                  setShowSaveModal(false);
                  setCheckpointNotes('');
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Guardar Checkpoint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


