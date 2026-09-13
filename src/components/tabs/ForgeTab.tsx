import React, { useState } from 'react';
import { Hammer, Cpu, Database, Save, Zap, Settings2, Download, AlertTriangle, Layers, Activity } from 'lucide-react';
import { BrainProject } from '../../core/types';

interface ForgeTabProps {
  currentProject: BrainProject;
}

export function ForgeTab({ currentProject }: ForgeTabProps) {
  const [baseModel, setBaseModel] = useState('unsloth/Qwen2.5-7B-Instruct');
  const [targetRam, setTargetRam] = useState<'8GB' | '16GB' | '32GB' | '64GB'>('16GB');
  const [quantProfile, setQuantProfile] = useState<'UltraLite' | 'Balanced' | 'Pro'>('Balanced');
  
  const [logs, setLogs] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);

  const handleStartForge = async () => {
    setIsCompiling(true);
    setLogs(['> Iniciando subsistema Python...', '> Conectando con servidor local...']);
    
    try {
      const response = await fetch('http://localhost:8080/api/forge/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseModel, targetRam, quantProfile })
      });

      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr.trim()) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'progress') {
                setLogs(prev => [...prev, `[${(data.progress * 100).toFixed(0)}%] ${data.message}`]);
              } else if (data.type === 'finish') {
                setLogs(prev => [...prev, `[SISTEMA] Compilación finalizada con código ${data.code}`]);
                setIsCompiling(false);
              } else if (data.type === 'error') {
                setLogs(prev => [...prev, `[ERROR] ${data.message}`]);
                setIsCompiling(false);
              }
            } catch (e) {
              setLogs(prev => [...prev, dataStr]);
            }
          }
        }
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `[ERROR] Falló la conexión: ${err.message}`]);
      setIsCompiling(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 p-6 overflow-y-auto">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 pb-4 border-b border-slate-800">
        <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl">
          <Hammer className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            La Forja <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">OneBrain Compiler</span>
          </h2>
          <p className="text-sm text-slate-500">Fundición local de modelos GGUF. Destila el conocimiento de la nube en tu propio motor offline.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Left Column: Configuration */}
        <div className="flex flex-col gap-6">
          
          {/* Base Model */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-emerald-400" />
              Modelo Base (HuggingFace)
            </h3>
            <p className="text-xs text-slate-500 mb-3">El cerebro "crudo" sobre el cual inyectaremos el conocimiento farmeado.</p>
            <input
              type="text"
              value={baseModel}
              onChange={e => setBaseModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition"
              placeholder="Ej: unsloth/Qwen2.5-7B-Instruct"
            />
          </div>

          {/* Hardware Target */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-blue-400" />
              Hardware Objetivo (Tu PC)
            </h3>
            <p className="text-xs text-slate-500 mb-4">¿Cuánta memoria RAM/VRAM quieres que consuma el archivo GGUF final?</p>
            <div className="grid grid-cols-4 gap-2">
              {(['8GB', '16GB', '32GB', '64GB'] as const).map(ram => (
                <button
                  key={ram}
                  onClick={() => setTargetRam(ram)}
                  className={`py-2 rounded-lg text-xs font-bold transition border ${
                    targetRam === ram 
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/50' 
                      : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                  }`}
                >
                  {ram}
                </button>
              ))}
            </div>
          </div>

          {/* Quantization Profile */}
          <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-purple-400" />
              Perfil de Cuantización
            </h3>
            <div className="flex flex-col gap-3">
              {[
                { id: 'UltraLite', desc: 'Máxima compresión (Q3_K). Menor inteligencia, súper rápido.', icon: Zap },
                { id: 'Balanced', desc: 'Precisión mixta (Q4_K_M). El estándar de la industria.', icon: Activity },
                { id: 'Pro', desc: 'Alta retención (Q6_K). Requiere mucha VRAM, máxima inteligencia.', icon: Settings2 }
              ].map(profile => (
                <button
                  key={profile.id}
                  onClick={() => setQuantProfile(profile.id as any)}
                  className={`flex items-center gap-3 p-3 rounded-lg text-left transition border ${
                    quantProfile === profile.id
                      ? 'bg-purple-600/20 border-purple-500/50'
                      : 'bg-slate-900 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <profile.icon className={`w-5 h-5 ${quantProfile === profile.id ? 'text-purple-400' : 'text-slate-500'}`} />
                  <div>
                    <div className={`text-sm font-bold ${quantProfile === profile.id ? 'text-purple-300' : 'text-slate-400'}`}>{profile.id}</div>
                    <div className="text-xs text-slate-500">{profile.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Execution */}
        <div className="flex flex-col gap-6">
          <div className="bg-slate-800/80 p-6 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-900/10 flex-1 flex flex-col">
            <h3 className="text-lg font-bold text-amber-400 mb-2">Compilador OneBrain</h3>
            <p className="text-sm text-slate-400 mb-6">
              Este proceso usará el conocimiento farmeado en Railway para aplicar Fine-Tuning (LoRA) al modelo base, y luego lo cuantizará a GGUF según el hardware que seleccionaste.
            </p>

            <div className="bg-slate-950 rounded-lg p-4 font-mono text-xs text-slate-500 flex-1 mb-6 flex flex-col overflow-hidden relative">
              <div className="text-slate-600 mb-2">// Registro del Compilador (Python)</div>
              {logs.length > 0 ? (
                <div className="text-emerald-400 font-mono text-[10px] sm:text-xs overflow-y-auto flex-1 flex flex-col gap-1">
                  {logs.map((log, i) => (
                    <div key={i} className={`${log.includes('[ERROR]') ? 'text-rose-400' : log.includes('SISTEMA') ? 'text-amber-400' : ''}`}>
                      {log}
                    </div>
                  ))}
                  {isCompiling && <div className="animate-pulse">_</div>}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full opacity-50 flex-col gap-2">
                  <Cpu className="w-8 h-8" />
                  <span>Sistema en espera</span>
                </div>
              )}
            </div>

            <button
              onClick={handleStartForge}
              disabled={isCompiling}
              className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                isCompiling 
                  ? 'bg-amber-600/50 text-amber-200 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-900/50'
              }`}
            >
              {isCompiling ? (
                <>
                  <Activity className="w-5 h-5 animate-spin" />
                  Forjando Cerebro...
                </>
              ) : (
                <>
                  <Hammer className="w-5 h-5" />
                  Iniciar Forja (Descargar & Compilar)
                </>
              )}
            </button>
            <p className="text-[10px] text-center text-slate-500 mt-3">
              <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500/50" />
              Requiere Python local, Llama.cpp y dependencias CUDA.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
