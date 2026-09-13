import React, { useState } from 'react';
import { Sparkles, Sliders, MessageSquare, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { PersonalityTraits, DatasetItem, BrainProject } from '../../core/types';
import { parseNaturalLanguageTraits, generateTrainingItemsFromTraits } from '../../personality/traits_manager';

interface PersonalityTabProps {
  currentProject: BrainProject;
  traits: PersonalityTraits;
  onUpdateTraits: (t: PersonalityTraits) => void;
  onAddDatasetItems: (items: DatasetItem[]) => void;
}

export const PersonalityTab: React.FC<PersonalityTabProps> = ({
  currentProject,
  traits,
  onUpdateTraits,
  onAddDatasetItems,
}) => {
  const [naturalText, setNaturalText] = useState(traits.naturalDescription || '');
  const [generatedScenarios, setGeneratedScenarios] = useState<DatasetItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const handleParseNatural = () => {
    if (!naturalText.trim()) return;
    const parsed = parseNaturalLanguageTraits(naturalText);
    const merged: PersonalityTraits = {
      ...traits,
      ...parsed,
      naturalDescription: naturalText,
    };
    onUpdateTraits(merged);
    setNotice('¡Rasgos analizados y calibrados exitosamente desde tu descripción!');
    setTimeout(() => setNotice(null), 4000);
  };

  const handleGenerateScenarios = () => {
    const items = generateTrainingItemsFromTraits(traits);
    setGeneratedScenarios(items);
  };

  const handleInjectIntoDataset = () => {
    if (generatedScenarios.length === 0) return;
    onAddDatasetItems(generatedScenarios);
    setNotice(`Se añadieron ${generatedScenarios.length} pares de entrenamiento basados en personalidad al dataset.`);
    setGeneratedScenarios([]);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div id="personality-tab-container" className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Personalidad y Comportamiento Neuronal</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          <strong className="text-white">Principio fundamental:</strong> Las instrucciones y rasgos de personalidad <strong className="text-emerald-400">NO</strong> actúan como un simple system prompt estático ni mediante condiciones if/else.
          El sistema traduce cada rasgo en situaciones y diálogos variados que luego se entrenan en los pesos neuronales de nanoGPT.
        </p>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* Natural Language Prompt to Traits Converter */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          1. Descripción en Lenguaje Natural
        </h3>
        <p className="text-xs text-slate-400">
          Describe cómo deseas que se comporte el modelo. El sistema extraerá los coeficientes de comportamiento de forma estructurada.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            id="natural-language-traits-input"
            rows={3}
            value={naturalText}
            onChange={e => setNaturalText(e.target.value)}
            placeholder="ej. Es bastante curioso pero no demasiado impulsivo. Habla de manera informal. No inventa información cuando no sabe algo. Es muy directo y paciente explicando..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
          <button
            id="btn-parse-traits"
            onClick={handleParseNatural}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition self-end sm:self-auto h-10"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Calibrar Rasgos
          </button>
        </div>
      </div>

      {/* Structured Traits Sliders */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          2. Coeficientes Estructurados (Traits)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs font-mono">
          {/* Curiosity */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span className="font-bold">Curiosidad:</span>
              <span className="text-emerald-400 font-bold">{(traits.curiosity * 100).toFixed(0)}%</span>
            </div>
            <input
              id="slider-trait-curiosity"
              type="range"
              min={0}
              max={100}
              value={traits.curiosity * 100}
              onChange={e => onUpdateTraits({ ...traits, curiosity: Number(e.target.value) / 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 font-sans">
              Indaga activamente, realiza repreguntas y explora detalles.
            </p>
          </div>

          {/* Directness */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span className="font-bold">Directo / Conciso:</span>
              <span className="text-emerald-400 font-bold">{(traits.directness * 100).toFixed(0)}%</span>
            </div>
            <input
              id="slider-trait-directness"
              type="range"
              min={0}
              max={100}
              value={traits.directness * 100}
              onChange={e => onUpdateTraits({ ...traits, directness: Number(e.target.value) / 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 font-sans">
              Respuestas breves y al grano sin rodeos superfluos.
            </p>
          </div>

          {/* Patience */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span className="font-bold">Paciencia:</span>
              <span className="text-emerald-400 font-bold">{(traits.patience * 100).toFixed(0)}%</span>
            </div>
            <input
              id="slider-trait-patience"
              type="range"
              min={0}
              max={100}
              value={traits.patience * 100}
              onChange={e => onUpdateTraits({ ...traits, patience: Number(e.target.value) / 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 font-sans">
              Explica paso a paso con tono calmado y pedagógico.
            </p>
          </div>

          {/* Formality */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span className="font-bold">Formalidad:</span>
              <span className="text-emerald-400 font-bold">{(traits.formality * 100).toFixed(0)}%</span>
            </div>
            <input
              id="slider-trait-formality"
              type="range"
              min={0}
              max={100}
              value={traits.formality * 100}
              onChange={e => onUpdateTraits({ ...traits, formality: Number(e.target.value) / 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 font-sans">
              Bajo = informal/coloquial; Alto = riguroso y protocolar.
            </p>
          </div>

          {/* Humor */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-300">
              <span className="font-bold">Humor / Ingenio:</span>
              <span className="text-emerald-400 font-bold">{(traits.humor * 100).toFixed(0)}%</span>
            </div>
            <input
              id="slider-trait-humor"
              type="range"
              min={0}
              max={100}
              value={traits.humor * 100}
              onChange={e => onUpdateTraits({ ...traits, humor: Number(e.target.value) / 100 })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500 font-sans">
              Comentarios ligeros y toques de ironía sutil.
            </p>
          </div>

          {/* Admit Unknown */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300">Admitir Desconocimiento:</span>
              <input
                id="checkbox-trait-admit-unknown"
                type="checkbox"
                checked={traits.admitUnknown}
                onChange={e => onUpdateTraits({ ...traits, admitUnknown: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
            </div>
            <p className="text-[10px] text-slate-500 font-sans mt-2">
              Si no tiene la información, responde explícitamente "No lo sé" en lugar de alucinar.
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Generation Pipeline */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-emerald-400" />
              3. Transformador de Rasgos a Material de Entrenamiento
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Genera pares de conversación de prueba donde la respuesta modela el comportamiento deseado.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-generate-scenarios"
              onClick={handleGenerateScenarios}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-medium transition"
            >
              Generar Escenarios Candidatos
            </button>
            {generatedScenarios.length > 0 && (
              <button
                id="btn-inject-scenarios-dataset"
                onClick={handleInjectIntoDataset}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Inyectar {generatedScenarios.length} Ejemplos al Dataset
              </button>
            )}
          </div>
        </div>

        {/* Generated Scenarios List */}
        {generatedScenarios.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {generatedScenarios.map((s, i) => (
              <div key={i} className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] font-mono">Pregunta del usuario:</span>
                  <span className="bg-slate-800 text-emerald-400 text-[10px] font-mono px-1.5 py-0.5 rounded">
                    {s.tags.join(', ')}
                  </span>
                </div>
                <div className="font-semibold text-white">"{s.input}"</div>
                <div className="text-slate-400 text-[10px] font-mono pt-1">Respuesta objetivo modelada:</div>
                <div className="text-slate-300 font-mono text-[11px] bg-slate-900 p-2 rounded border border-slate-800/80">
                  {s.output}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-slate-800/60">
            Haz clic en "Generar Escenarios Candidatos" para visualizar las situaciones que se crearán a partir de tus traits.
          </div>
        )}
      </div>
    </div>
  );
};
