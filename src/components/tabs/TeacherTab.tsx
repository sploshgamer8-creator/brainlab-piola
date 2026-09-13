import React, { useState } from 'react';
import { Zap, Bot, ShieldAlert, Check, X, Edit2, Sparkles, Filter, CheckCircle2, ArrowRight, Cpu, Sliders, Server } from 'lucide-react';
import { PersonalityTraits, DatasetItem } from '../../core/types';
import { GeneratedCandidate, generateSyntheticSamples, requestTeacherGemini } from '../../teacher/teacher_service';
import { TeacherManager, TeacherProvider } from '../../harvesting/teacher_provider';
import { DistillationEngine } from '../../training/distillation_engine';

interface TeacherTabProps {
  traits: PersonalityTraits;
  onAddDatasetItems: (items: DatasetItem[]) => void;
  onSetTeacherActive: (active: boolean) => void;
}

export const TeacherTab: React.FC<TeacherTabProps> = ({
  traits,
  onAddDatasetItems,
  onSetTeacherActive,
}) => {
  const [teacherMode, setTeacherMode] = useState<'synthetic' | 'gemini' | 'llamacpp'>('synthetic');
  const [topic, setTopic] = useState('Lua game scripting & table management');
  const [category, setCategory] = useState<DatasetItem['category']>('lua');
  const [sampleCount, setSampleCount] = useState(4);
  const [promptContext, setPromptContext] = useState('Respuestas de código limpias, sintaxis moderna de Lua 5.1/Luau, sin bibliotecas externas complejas.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');

  // Distillation hyperparameters
  const [distillAlpha, setDistillAlpha] = useState(0.5);
  const [distillTemp, setDistillTemp] = useState(2.5);

  // Editing modal/state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [editOutput, setEditOutput] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    onSetTeacherActive(true);
    try {
      let results: GeneratedCandidate[] = [];
      if (teacherMode === 'synthetic') {
        results = await generateSyntheticSamples(topic, category, sampleCount, traits);
      } else if (teacherMode === 'gemini') {
        results = await requestTeacherGemini(promptContext, topic, category, sampleCount, traits);
      } else {
        // Local llama.cpp 7B Teacher
        const provider = TeacherManager.getActiveProvider();
        const resp = await provider.generateSamples({
          topic,
          category,
          count: sampleCount,
          traits,
          promptContext,
        });
        results = resp.candidates.map((c, i) => ({
          id: c.id,
          topic,
          category,
          input: c.input,
          output: c.output,
          status: 'pending_review' as const,
          source: 'teacher_synthetic' as const,
          createdAt: new Date().toISOString(),
          tags: c.tags || ['llamacpp', '7b_local'],
        }));
      }
      setCandidates(prev => [...results, ...prev]);
      setNotification(`Se generaron ${results.length} ejemplos candidatos para revisión con ${teacherMode}.`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error('Teacher generation error', err);
    } finally {
      setIsGenerating(false);
      onSetTeacherActive(false);
    }
  };

  const handleApprove = (id: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: 'accepted' } : c));
  };

  const handleReject = (id: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' } : c));
  };

  const startEdit = (c: GeneratedCandidate) => {
    setEditingId(c.id);
    setEditInput(c.input);
    setEditOutput(c.output);
  };

  const saveEdit = (id: string) => {
    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          input: editInput,
          output: editOutput,
          status: 'accepted',
        };
      }
      return c;
    }));
    setEditingId(null);
  };

  const handleCommitAccepted = () => {
    const accepted = candidates.filter(c => c.status === 'accepted');
    if (accepted.length === 0) return;

    const datasetItems: DatasetItem[] = accepted.map(a => ({
      id: a.id,
      category: a.category,
      input: a.input,
      output: a.output,
      source: a.source === 'teacher_gemini' ? 'synthetic_api' : 'synthetic_rule',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: [...a.tags, 'teacher_qa_approved'],
    }));

    onAddDatasetItems(datasetItems);
    setCandidates(prev => prev.filter(c => c.status !== 'accepted'));
    setNotification(`¡Se inyectaron ${datasetItems.length} ejemplos aprobados al dataset de entrenamiento!`);
    setTimeout(() => setNotification(null), 4000);
  };

  const counts = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === 'pending_review').length,
    accepted: candidates.filter(c => c.status === 'accepted').length,
    rejected: candidates.filter(c => c.status === 'rejected').length,
  };

  const filteredCandidates = candidates.filter(c => {
    if (filterStatus === 'pending') return c.status === 'pending_review';
    if (filterStatus === 'accepted') return c.status === 'accepted';
    if (filterStatus === 'rejected') return c.status === 'rejected';
    return true;
  });

  return (
    <div id="teacher-tab-container" className="space-y-6">
      {/* Strict Principles Banner */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Profesor IA / Generador de Datos (Teacher Layer)</h2>
          </div>
          <span className="text-xs bg-blue-950/60 text-blue-300 border border-blue-800 px-2.5 py-1 rounded font-mono">
            Uso Exclusivo: Generación de Datasets
          </span>
        </div>

        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <ShieldAlert className="w-4 h-4" />
            REGLA DE ARQUITECTURA:
          </div>
          <p className="leading-relaxed">
            El profesor <strong>NUNCA</strong> responde al usuario final durante el chat ni se conecta durante la inferencia local.
            Su único propósito es generar pares sintéticos de alta calidad para alimentar el dataset con el cual se entrena el modelo local nanoGPT.
            Todos los ejemplos pasan por una <strong>Cola de Aprobación (QA Review)</strong> humana antes de tocar los pesos.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Generator Configuration Card */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-400" />
          Configurar Generador del Profesor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Tipo de Profesor</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="btn-teacher-mode-synthetic"
                onClick={() => setTeacherMode('synthetic')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  teacherMode === 'synthetic'
                    ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-white">Sintético Offline</div>
                <div className="text-[10px] text-slate-400">Heurístico local</div>
              </button>

              <button
                type="button"
                id="btn-teacher-mode-gemini"
                onClick={() => setTeacherMode('gemini')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  teacherMode === 'gemini'
                    ? 'bg-blue-950/50 border-blue-500 text-blue-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-white">Gemini 2.5</div>
                <div className="text-[10px] text-slate-400">Frontier Teacher</div>
              </button>

              <button
                type="button"
                id="btn-teacher-mode-llamacpp"
                onClick={() => setTeacherMode('llamacpp')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  teacherMode === 'llamacpp'
                    ? 'bg-purple-950/50 border-purple-500 text-purple-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-bold text-white">llama.cpp 7B</div>
                <div className="text-[10px] text-slate-400">Local Offline</div>
              </button>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Categoría de Destino</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none"
            >
              <option value="lua">Lua Programming</option>
              <option value="spanish">Español Dialógico</option>
              <option value="english">Inglés Técnico</option>
              <option value="personality">Rasgos de Personalidad</option>
              <option value="behavior">Comportamiento / Admitir desconocimiento</option>
            </select>
          </div>
        </div>

        {/* Knowledge Distillation Hyperparameters Panel */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              Parámetros de Destilación de Conocimiento (KD Loss)
            </span>
            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5 rounded">
              L_total = (1-α)·L_CE + α·T²·L_KL
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Ponderación Alpha (α):</span>
                <span className="font-mono text-indigo-300">{distillAlpha}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={distillAlpha}
                onChange={e => setDistillAlpha(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                0 = Solo etiquetas duras (CrossEntropy) | 1 = 100% Imita al Maestro (KL Divergence).
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Temperatura de Suavizado (T):</span>
                <span className="font-mono text-indigo-300">{distillTemp}</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={distillTemp}
                onChange={e => setDistillTemp(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                Valores altos (2.0-3.5) suavizan logits y revelan relaciones sutiles entre tokens.
              </p>
            </div>
          </div>
        </div>

        {/* Topic and Context */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-300 block">Tema Específico a Enseñar</label>
            <input
              id="input-teacher-topic"
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="ej. Metatables en Lua y herencia orientada a objetos"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 block">Cantidad de Muestras</label>
            <input
              type="number"
              min={1}
              max={10}
              value={sampleCount}
              onChange={e => setSampleCount(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            id="btn-trigger-teacher-generate"
            disabled={isGenerating}
            onClick={handleGenerate}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-md shadow-blue-950"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generando con Profesor...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generar Ejemplos Candidatos</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* QA Review Queue Header & Filter */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              Cola de Revisión y Curación (QA Approval Queue)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Revisa cada ejemplo generado. Puedes aprobarlo, editarlo para corregir detalles o descartarlo.
            </p>
          </div>

          {counts.accepted > 0 && (
            <button
              id="btn-commit-accepted-samples"
              onClick={handleCommitAccepted}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
            >
              <CheckCircle2 className="w-4 h-4" />
              Inyectar Aprobados ({counts.accepted}) al Dataset
            </button>
          )}
        </div>

        {/* Counter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1 rounded-md transition ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
          >
            Todos ({counts.total})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1 rounded-md transition ${filterStatus === 'pending' ? 'bg-blue-900/60 text-blue-300' : 'text-slate-400'}`}
          >
            Pendientes ({counts.pending})
          </button>
          <button
            onClick={() => setFilterStatus('accepted')}
            className={`px-3 py-1 rounded-md transition ${filterStatus === 'accepted' ? 'bg-emerald-900/60 text-emerald-300' : 'text-slate-400'}`}
          >
            Aprobados ({counts.accepted})
          </button>
          <button
            onClick={() => setFilterStatus('rejected')}
            className={`px-3 py-1 rounded-md transition ${filterStatus === 'rejected' ? 'bg-red-900/60 text-red-300' : 'text-slate-400'}`}
          >
            Rechazados ({counts.rejected})
          </button>
        </div>

        {/* Candidates Cards */}
        {filteredCandidates.length > 0 ? (
          <div className="space-y-3 pt-2">
            {filteredCandidates.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl border transition ${
                    c.status === 'accepted'
                      ? 'bg-emerald-950/20 border-emerald-600/40'
                      : c.status === 'rejected'
                      ? 'bg-red-950/20 border-red-600/30 opacity-60'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-400 font-mono">EDITAR ENTRADA:</label>
                        <input
                          type="text"
                          value={editInput}
                          onChange={e => setEditInput(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-mono">EDITAR RESPUESTA OBJETIVO:</label>
                        <textarea
                          rows={3}
                          value={editOutput}
                          onChange={e => setEditOutput(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white font-mono"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-slate-800 text-slate-400 rounded text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => saveEdit(c.id)}
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold"
                        >
                          Guardar y Aprobar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                            {c.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Origen: {c.source}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            title="Editar"
                            onClick={() => startEdit(c)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Aprobar"
                            onClick={() => handleApprove(c.id)}
                            className={`p-1.5 rounded text-xs transition ${
                              c.status === 'accepted'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            title="Rechazar"
                            onClick={() => handleReject(c.id)}
                            className={`p-1.5 rounded text-xs transition ${
                              c.status === 'rejected'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-semibold text-white">
                        {c.input}
                      </div>
                      <div className="text-xs font-mono text-slate-300 bg-slate-900 p-2.5 rounded border border-slate-800/80 whitespace-pre-wrap">
                        {c.output}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-slate-800/60">
            No hay candidatos en la cola. Configura el generador arriba y presiona "Generar Ejemplos Candidatos".
          </div>
        )}
      </div>
    </div>
  );
};
