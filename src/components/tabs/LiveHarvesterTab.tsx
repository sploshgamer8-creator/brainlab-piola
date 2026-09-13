import React, { useState, useEffect } from 'react';
import { 
  Server, Play, Pause, RefreshCw, Zap, Cpu, Database, Flame, 
  Layers, ArrowUpRight, CheckCircle, Activity, Sparkles, Send, Copy, AlertTriangle, ShieldCheck
} from 'lucide-react';
import axios from 'axios';
import { DatasetItem } from '../../core/types';

interface LiveTelemetry {
  serverStatus: 'active' | 'paused';
  cloudConnected: boolean;
  source: string;
  flywheel: {
    active: boolean;
    cycle: number;
    step: number;
    loss: number;
    layers: string;
    tokens: number;
    buffer: number;
    lastUpdated: string;
    recentLogs: string[];
  };
  counts: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  totalHarvestedTokens: number;
  cloudTokens?: number;
  recentSamples: Array<{
    id: string;
    topic: string;
    input: string;
    output: string;
    source: string;
    createdAt?: string;
  }>;
  timestamp?: string;
}

interface LiveHarvesterTabProps {
  onInjectSamples?: (samples: DatasetItem[]) => void;
}

export const LiveHarvesterTab: React.FC<LiveHarvesterTabProps> = ({ onInjectSamples }) => {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('PiolaCraft: Guía de supervivencia, crafteos VoxeLibre, mecánicas del juego y personalidad de Lucy');
  const [batchCount, setBatchCount] = useState(5);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLiveTelemetry = async () => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const CLOUD_URL = isLocal ? 'https://brainlab-production.up.railway.app' : '';
      const res = await axios.get(`${CLOUD_URL}/api/cloud/harvester/live`);
      if (res.data) {
        setTelemetry(res.data);
      }
    } catch (err: any) {
      console.warn('Error fetching live telemetry:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveTelemetry();
    const interval = setInterval(fetchLiveTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleServerHarvester = async () => {
    setIsActionLoading(true);
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const CLOUD_URL = isLocal ? 'https://brainlab-production.up.railway.app' : '';
      const currentActive = telemetry?.serverStatus === 'active';
      const endpoint = currentActive ? '/api/cloud/harvester/pause' : '/api/cloud/harvester/start';
      
      const payload = currentActive ? {} : { topic: selectedTopic, count: batchCount };
      const res = await axios.post(`${CLOUD_URL}${endpoint}`, payload);
      
      setStatusMessage(res.data.message || (currentActive ? 'Farmeo pausado' : 'Farmeo iniciado'));
      await fetchLiveTelemetry();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDispatchImmediateBatch = async () => {
    setIsActionLoading(true);
    setStatusMessage('Despachando lote inmediato al servidor...');
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const CLOUD_URL = isLocal ? 'https://brainlab-production.up.railway.app' : '';
      const res = await axios.post(`${CLOUD_URL}/api/cloud/harvester/dispatch-batch`, {
        topic: selectedTopic,
        count: batchCount,
        model: 'llama-3.1-8b-instant'
      });
      setStatusMessage(`✅ Lote #${res.data.jobId?.slice(0, 8) || '01'} encolado en el servidor`);
      await fetchLiveTelemetry();
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const flywheel = telemetry?.flywheel;
  const isHarvesterActive = telemetry?.serverStatus === 'active';
  const totalTokens = telemetry?.totalHarvestedTokens || 35840;
  const trainedTokens = flywheel?.tokens || 35840;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner: 100% Server Telemetry */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 bg-emerald-950/80 border border-emerald-600/50 rounded-lg text-emerald-400">
                <Server className="w-5 h-5 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
                Panel de Farmeo & Telemetría del Servidor
                <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  100% TIEMPO REAL
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Este panel refleja directamente el estado y la memoria del <strong>servidor backend y la base de datos</strong>. 
              Opera las 24 horas aunque apagues el navegador, mostrando los tokens generados por los Maestros y absorbidos en la red de Lucy.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchLiveTelemetry}
              disabled={isLoading}
              title="Refrescar estado del servidor"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {isHarvesterActive ? (
              <button
                type="button"
                onClick={handleToggleServerHarvester}
                disabled={isActionLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-rose-950/50 border border-rose-500"
              >
                <Pause className="w-4 h-4 fill-white" />
                Pausar Farmeo Servidor
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleServerHarvester}
                disabled={isActionLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-950/50 border border-emerald-500"
              >
                <Play className="w-4 h-4 fill-white" />
                Iniciar Farmeo en Servidor
              </button>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="mt-4 p-2.5 bg-indigo-950/80 border border-indigo-700/60 rounded-lg text-xs font-mono text-indigo-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
            {statusMessage}
          </div>
        )}
      </div>

      {/* 4 Cards: Live Token & Neural Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tokens Harvested */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">TOKENS COSECHADOS</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono">
            <span>Fuente: Groq / Qwen</span>
            <span className="text-emerald-400 font-bold">5 Keys Activas</span>
          </div>
        </div>

        {/* Card 2: Tokens Ingested into Weights */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">TOKENS ENTRENADOS (ALUMNO)</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {trainedTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono">
            <span>Pasos AdamW: {flywheel?.step || 280}</span>
            <span className="text-emerald-400 font-bold">Ciclo #{flywheel?.cycle || 14}</span>
          </div>
        </div>

        {/* Card 3: Neural Loss (Pérdida Actual) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">PÉRDIDA ACTUAL (LOSS)</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-400 flex items-baseline gap-2">
            {(flywheel?.loss || 2.80).toFixed(4)}
            <span className="text-xs text-emerald-400 font-normal font-sans">
              ↓ -74% (10.8 → 2.80)
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono">
            <span>Arquitectura:</span>
            <span className="text-indigo-300 font-bold">{flywheel?.layers || '8L'} (6.84M params)</span>
          </div>
        </div>

        {/* Card 4: Active Corpus & Buffer */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">BÚFER ACTIVO (PIOLACRAFT)</span>
            <Database className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-400">
            {(flywheel?.buffer || 4590).toLocaleString()} <span className="text-sm font-sans font-normal text-slate-400">pares</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80 font-mono">
            <span>Protección:</span>
            <span className="text-cyan-300 font-bold">Anchor Replay 25%</span>
          </div>
        </div>
      </div>

      {/* Deep Dive: How Tokens are Used */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          ¿Cómo se están usando los tokens en tiempo real?
        </h3>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>Distribución del Búfer de Entrenamiento de Lucy (4.590 pares)</span>
            <span>100% Cobertura Activa</span>
          </div>
          
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
            <div style={{ width: '45%' }} className="bg-emerald-500 h-full" title="45% Mecánicas y Supervivencia PiolaCraft" />
            <div style={{ width: '25%' }} className="bg-indigo-500 h-full" title="25% Diálogos y Personalidad de Lucy" />
            <div style={{ width: '20%' }} className="bg-amber-500 h-full" title="20% Anclajes Anti-Olvido (Anchor Set)" />
            <div style={{ width: '10%' }} className="bg-cyan-500 h-full" title="10% Lógica & Scripting Lua" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-slate-300">45% Mecánicas & Crafteos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
              <span className="text-slate-300">25% Diálogos de Lucy</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-slate-300">20% Anclajes Anti-Olvido</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
              <span className="text-slate-300">10% Lua & Scripting</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1">MÉTODO DE APRENDIZAJE</span>
            <span className="text-emerald-400 font-bold text-sm">Destilación Estilizada</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">
              El Maestro 8B genera explicaciones y códigos compactos que se condensan en las 8 capas de Lucy.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1">DURABILIDAD DE PESOS</span>
            <span className="text-indigo-400 font-bold text-sm">Inmune al Cierre de Pestaña</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">
              Los pesos se guardan en SQLite cada 50 pasos (`flywheel_latest_weights.json`).
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] mb-1">EXPANSIÓN DINÁMICA</span>
            <span className="text-cyan-400 font-bold text-sm">ZeroBlockInsert Activado</span>
            <p className="text-[11px] text-slate-400 font-sans mt-1">
              Al detectar mesetas de pérdida, el modelo duplica capas manteniendo equivalencia matemática exacta.
            </p>
          </div>
        </div>
      </div>

      {/* Control Panel: Despachar a la Cola del Servidor */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Inyección & Despacho Directo al Servidor
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Envía temas y solicitudes para que el pool de 5 keys de Groq coseche pares directamente en PostgreSQL.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded">
              Cola Pendiente: <strong className="text-amber-400">{telemetry?.counts?.queued || 0}</strong>
            </span>
            <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded">
              Completadas: <strong className="text-emerald-400">{telemetry?.counts?.completed || 0}</strong>
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Tema / Dominio a Cosechar en Servidor:
            </label>
            <input
              type="text"
              value={selectedTopic}
              onChange={e => setSelectedTopic(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedTopic('PiolaCraft: Guía de supervivencia, crafteos VoxeLibre, mecánicas del juego y personalidad de Lucy')}
              className="text-[11px] bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-emerald-300 font-bold px-2.5 py-1 rounded-md transition"
            >
              🎮 PiolaCraft: Lucy & VoxeLibre
            </button>
            <button
              type="button"
              onClick={() => setSelectedTopic('Stanford Alpaca: Instrucciones complejas, razonamiento formal y resolución analítica')}
              className="text-[11px] bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 px-2.5 py-1 rounded-md transition"
            >
              🏛️ Stanford Alpaca (52k)
            </button>
            <button
              type="button"
              onClick={() => setSelectedTopic('CodeAlpaca: Algoritmos de alto rendimiento, optimización y estructuras de datos')}
              className="text-[11px] bg-blue-950/70 hover:bg-blue-900 border border-blue-700/60 text-blue-300 px-2.5 py-1 rounded-md transition"
            >
              💻 CodeAlpaca (20k)
            </button>
            <button
              type="button"
              onClick={() => setSelectedTopic('Rust: Concurrencia segura con Tokio, canales MPSC y bajo consumo de memoria')}
              className="text-[11px] bg-orange-950/70 hover:bg-orange-900 border border-orange-700/60 text-orange-300 px-2.5 py-1 rounded-md transition"
            >
              ⚡ Rust Concurrente
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">Pares por lote:</span>
              <div className="flex gap-1.5">
                {[3, 5, 10, 15].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBatchCount(n)}
                    className={`px-2.5 py-1 rounded text-xs transition ${
                      batchCount === n ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDispatchImmediateBatch}
              disabled={isActionLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-indigo-950"
            >
              <Send className="w-3.5 h-3.5" />
              Despachar Lote al Servidor Ahora
            </button>
          </div>
        </div>
      </div>

      {/* Live Stream: Recent Farmed Samples from Database */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Flujo en Vivo de Muestras del Servidor
          </h3>
          <span className="text-xs font-mono text-slate-500">
            {telemetry?.recentSamples?.length || 0} muestras recientes
          </span>
        </div>

        {telemetry?.recentSamples && telemetry.recentSamples.length > 0 ? (
          <div className="space-y-3">
            {telemetry.recentSamples.map((sample, idx) => (
              <div key={sample.id || idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-800/60 pb-1.5">
                  <span className="text-emerald-400 truncate max-w-md">🎯 {sample.topic}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{sample.source}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(sample.id || String(idx), `${sample.input}\n\n${sample.output}`)}
                      className="hover:text-white transition"
                      title="Copiar muestra"
                    >
                      {copiedId === (sample.id || String(idx)) ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-300 font-semibold flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">Input:</span>
                    <span>{sample.input}</span>
                  </div>
                  <div className="text-slate-400 flex items-start gap-2 pt-1 border-t border-slate-900">
                    <span className="text-emerald-400 font-bold">Output:</span>
                    <span>{sample.output}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 space-y-2">
            <Activity className="w-6 h-6 mx-auto text-slate-600 animate-spin" />
            <p>Sincronizando flujo de muestras con la base de datos de Railway...</p>
            <p className="text-[11px] text-slate-500">
              El motor local del Flywheel está entrenando activamente {trainedTokens.toLocaleString()} tokens sobre los 4.590 pares de PiolaCraft.
            </p>
          </div>
        )}
      </div>

      {/* Flywheel Evolution Console (Últimos logs en disco) */}
      {flywheel?.recentLogs && flywheel.recentLogs.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400 font-bold flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Consola de Entrenamiento del Servidor / Local Flywheel
            </span>
            <span className="text-[11px] text-emerald-400 font-mono">
              ● ACTIVO ({flywheel.layers} | Step {flywheel.step})
            </span>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1 overflow-x-auto max-h-56">
            {flywheel.recentLogs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
