import React, { useState } from 'react';
import { Sparkles, ArrowDownToLine, RefreshCw, Zap, CheckCircle2, ShieldCheck, Settings, Cpu } from 'lucide-react';
import { DatasetItem, PersonalityTraits } from '../core/types';
import { fetchDistillationBatch } from '../core/distill_service';

interface OmniDistillPanelProps {
  traits: PersonalityTraits;
  isTraining: boolean;
  onInjectSamplesAndTrain: (samples: DatasetItem[]) => void;
  onLoadPretrainedWeights: (type: 'spanish' | 'lua') => void;
}

export const OmniDistillPanel: React.FC<OmniDistillPanelProps> = ({
  traits,
  isTraining,
  onInjectSamplesAndTrain,
  onLoadPretrainedWeights,
}) => {
  const [topic, setTopic] = useState('Diálogos frecuentes en español y comandos de ayuda');
  const [category, setCategory] = useState<DatasetItem['category']>('spanish');
  const [targetScale, setTargetScale] = useState<'100M' | '1B' | '7B'>('100M');
  const [batchCount, setBatchCount] = useState(6);
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [omniRouteUrl, setOmniRouteUrl] = useState(() => localStorage.getItem('local_brain_omniroute_url') || '');
  const [omniRouteApiKey, setOmniRouteApiKey] = useState(() => localStorage.getItem('local_brain_omniroute_key') || '');
  const [omniRouteModel, setOmniRouteModel] = useState(() => localStorage.getItem('local_brain_omniroute_model') || 'omniroute-auto');
  const [isDistilling, setIsDistilling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number; hint?: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastDistillStats, setLastDistillStats] = useState<{ source: string; ratio: string; count: number } | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/gateway/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          omniRouteUrl: omniRouteUrl.trim(),
          omniRouteApiKey: omniRouteApiKey.trim(),
          omniRouteModel: omniRouteModel.trim(),
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Fallo de red al probar conexión.',
        hint: 'Verifica que la URL sea accesible desde internet si este laboratorio corre en la nube.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveGatewaySettings = () => {
    localStorage.setItem('local_brain_omniroute_url', omniRouteUrl);
    localStorage.setItem('local_brain_omniroute_key', omniRouteApiKey);
    localStorage.setItem('local_brain_omniroute_model', omniRouteModel);
    setShowGatewayConfig(false);
    setStatusMessage('Configuración de Gateway OmniRoute guardada.');
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExtractAndAbsorb = async () => {
    setIsDistilling(true);
    setStatusMessage(`Extrayendo conocimiento a escala ${targetScale} desde OmniRoute / Frontier Teacher...`);
    try {
      const res = await fetchDistillationBatch({
        topic,
        category,
        count: batchCount,
        traits,
        targetScale,
        omniRouteUrl: omniRouteUrl.trim() || undefined,
        omniRouteApiKey: omniRouteApiKey.trim() || undefined,
        omniRouteModel: omniRouteModel.trim() || undefined,
        complexity: category === 'lua' ? 'lua_code' : targetScale === '7B' ? 'reasoning_steps' : 'conversational',
      });

      if (res.candidates.length > 0) {
        onInjectSamplesAndTrain(res.candidates);
        setLastDistillStats({
          source: res.sourceModel,
          ratio: res.distillRatio,
          count: res.candidates.length,
        });
        setStatusMessage(`¡Éxito! Se destilaron ${res.candidates.length} ejemplos adaptados para escala ${targetScale}.`);
      } else {
        setStatusMessage('No se recibieron ejemplos en este lote.');
      }
    } catch (err: any) {
      setStatusMessage(`Error en destilación: ${err.message}`);
    } finally {
      setIsDistilling(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  return (
    <div id="omni-distill-panel" className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 rounded-xl border border-indigo-500/30 p-5 space-y-4 shadow-lg shadow-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                OmniRoute Distillation & Escalera de Modelos (100M ➔ 1B ➔ 7B)
              </h3>
              <span className="text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded font-mono">
                Escala: {targetScale}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Destilación continua asistida por OmniRoute (352+ proveedores / 150+ tiers gratuitos) inyectada directo al optimizador.
            </p>
          </div>
        </div>

        {/* Carga rápida de pesos pre-entrenados y Gateway toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGatewayConfig(!showGatewayConfig)}
            className={`border px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              omniRouteUrl
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Configurar OmniRoute Gateway (OpenAI-compatible URL)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{omniRouteUrl ? 'OmniRoute Activo' : 'Conectar OmniRoute'}</span>
          </button>

          <button
            id="btn-load-spanish-weights"
            onClick={() => onLoadPretrainedWeights('spanish')}
            disabled={isTraining}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            title="Cargar inmediatamente pesos entrenados en español"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
            Pesos Español
          </button>
          <button
            id="btn-load-lua-weights"
            onClick={() => onLoadPretrainedWeights('lua')}
            disabled={isTraining}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            title="Cargar inmediatamente pesos entrenados en sintaxis Lua"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
            Pesos Lua
          </button>
        </div>
      </div>

      {/* Panel desplegable de configuración de OmniRoute Gateway */}
      {showGatewayConfig && (
        <div className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Configurar Pasarela OmniRoute (352 Proveedores / Formato OpenAI /v1)
            </span>
            <span className="text-[10px] text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              Zero Cost Farmeo
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">OmniRoute URL Base:</label>
              <input
                type="text"
                value={omniRouteUrl}
                onChange={e => setOmniRouteUrl(e.target.value)}
                placeholder="http://localhost:8000/v1 o túnel"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">API Key (opcional en local):</label>
              <input
                type="password"
                value={omniRouteApiKey}
                onChange={e => setOmniRouteApiKey(e.target.value)}
                placeholder="Bearer token o sk-..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Modelo / Enrutador:</label>
              <input
                type="text"
                value={omniRouteModel}
                onChange={e => setOmniRouteModel(e.target.value)}
                placeholder="omniroute-auto o groq/llama-3"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          {testResult && (
            <div className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-600/40 text-rose-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Zap className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{testResult.message || (testResult.success ? 'Conexión Exitosa' : 'Error de Conexión')}</p>
                {testResult.latencyMs && (
                  <p className="text-[11px] text-emerald-400">Latencia: {testResult.latencyMs}ms</p>
                )}
                {testResult.hint && (
                  <p className="text-[11px] text-slate-300 opacity-90">{testResult.hint}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="border border-indigo-500/40 hover:bg-indigo-950/50 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Probando Enlace...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 text-amber-400" />
                  Probar Conexión
                </>
              )}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOmniRouteUrl('');
                  setOmniRouteApiKey('');
                  localStorage.removeItem('local_brain_omniroute_url');
                  localStorage.removeItem('local_brain_omniroute_key');
                  setTestResult(null);
                }}
                className="text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded text-xs"
              >
                Restablecer a Nativo
              </button>
              <button
                type="button"
                onClick={handleSaveGatewaySettings}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-1.5 rounded-lg text-xs transition"
              >
                Guardar Gateway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inputs de destilación */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
        <div className="md:col-span-2">
          <label className="text-[11px] font-mono text-slate-400 block mb-1">TEMA A DESTILAR</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Ej: Saludos cordiales, manejo de errores en Lua, cortesía..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div>
          <label className="text-[11px] font-mono text-slate-400 block mb-1">CATEGORÍA</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as DatasetItem['category'])}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="spanish">Español Conversacional</option>
            <option value="lua">Programación Lua</option>
            <option value="personality">Personalidad & Rasgos</option>
            <option value="general">Conocimiento General</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-mono text-slate-400 block mb-1">ESCALA OBJETIVO</label>
          <select
            value={targetScale}
            onChange={e => setTargetScale(e.target.value as '100M' | '1B' | '7B')}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-indigo-300 font-bold focus:outline-none focus:border-indigo-500"
          >
            <option value="100M">Tier 100M (Micro-Harvester)</option>
            <option value="1B">Tier 1B (Técnico / Estructurado)</option>
            <option value="7B">Tier 7B (Razonamiento / CoT)</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            id="btn-trigger-distillation"
            onClick={handleExtractAndAbsorb}
            disabled={isDistilling}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition shadow-md shadow-indigo-950"
          >
            {isDistilling ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Destilando {targetScale}...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                Extraer y Absorber
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status & Metrics */}
      {(statusMessage || lastDistillStats) && (
        <div className="bg-slate-950/80 border border-indigo-900/50 rounded-lg p-3 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{statusMessage || `Última extracción: ${lastDistillStats?.count} pares absorbidos`}</span>
          </div>
          {lastDistillStats && (
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>Fuente: <strong className="text-indigo-300">{lastDistillStats.source}</strong></span>
              <span>Compresión: <strong className="text-emerald-300">{lastDistillStats.ratio}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
