import React, { useState, useRef } from 'react';
import { Sparkles, Plus, Trash2, Edit3, Filter, Code2, Globe, CheckCircle2, AlertTriangle, Search, Download, Upload, ShieldCheck, Check } from 'lucide-react';
import { DatasetItem, BrainProject } from '../../core/types';
import { inspectDatasetQuality } from '../../training/datasets_store';
import { WebHarvesterHub } from '../WebHarvesterHub';

interface DatasetsTabProps {
  datasets: DatasetItem[];
  currentProject: BrainProject;
  onUpdateDatasets: (items: DatasetItem[]) => void;
  onUpdateProjectRatios: (ratios: { spanish: number; english: number; portuguese: number }) => void;
}

export const DatasetsTab: React.FC<DatasetsTabProps> = ({
  datasets,
  currentProject,
  onUpdateDatasets,
  onUpdateProjectRatios,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Add Item State
  const [showAddModal, setShowAddModal] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [outputVal, setOutputVal] = useState('');
  const [catVal, setCatVal] = useState<DatasetItem['category']>('spanish');
  const [tagsVal, setTagsVal] = useState('');

  // Multilingual ratios
  const ratios = currentProject.multilingualRatio || { spanish: 50, english: 30, portuguese: 20 };

  const filtered = datasets.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      searchTerm.trim() === '' ||
      item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.output.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const quality = inspectDatasetQuality(datasets);

  const handleAddItem = () => {
    if (!inputVal.trim() || !outputVal.trim()) return;

    const newItem: DatasetItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: catVal,
      input: inputVal.trim(),
      output: outputVal.trim(),
      source: 'manual',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: tagsVal.split(',').map(t => t.trim()).filter(Boolean),
    };

    onUpdateDatasets([newItem, ...datasets]);
    setShowAddModal(false);
    setInputVal('');
    setOutputVal('');
    setTagsVal('');
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleDeleteItem = (id: string) => {
    onUpdateDatasets(datasets.filter(d => d.id !== id));
  };

  const handleToggleApproved = (id: string) => {
    onUpdateDatasets(
      datasets.map(d => d.id === id ? { ...d, approved: !d.approved } : d)
    );
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(datasets, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dataset_${currentProject.name.toLowerCase().replace(/\s+/g, '_')}_${datasets.length}samples.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedbackMsg(`Dataset exportado (${datasets.length} ejemplos).`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(parsed)) {
          alert('El archivo debe contener un array JSON de ejemplos: [{ input, output }]');
          return;
        }

        const validItems: DatasetItem[] = parsed.map((item, idx) => ({
          id: item.id || `imported_${Date.now()}_${idx}`,
          category: item.category || 'spanish',
          input: String(item.input || ''),
          output: String(item.output || ''),
          source: item.source || 'external_json',
          approved: item.approved !== false,
          createdAt: item.createdAt || new Date().toISOString(),
          tags: Array.isArray(item.tags) ? item.tags : ['imported'],
        })).filter(it => it.input && it.output);

        if (validItems.length === 0) {
          alert('No se encontraron ejemplos válidos con input y output en el archivo.');
          return;
        }

        onUpdateDatasets([...validItems, ...datasets]);
        setFeedbackMsg(`¡Éxito! Se importaron ${validItems.length} ejemplos al dataset.`);
        setTimeout(() => setFeedbackMsg(null), 4000);
      } catch (err: any) {
        alert('Error al leer el archivo JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeduplicate = () => {
    const seen = new Set<string>();
    const deduplicated: DatasetItem[] = [];
    for (const item of datasets) {
      const key = `${item.category}:::${item.input.trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }
    const removedCount = datasets.length - deduplicated.length;
    onUpdateDatasets(deduplicated);
    setFeedbackMsg(removedCount > 0 ? `Se eliminaron ${removedCount} ejemplos duplicados.` : 'No se encontraron duplicados.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div id="datasets-tab-container" className="space-y-6">
      {/* OneBrain Web Harvester & Ingestion Hub (Scrapling, Agent Reach, ScrapeGraphAI) */}
      <WebHarvesterHub onAddDatasetItems={(items) => onUpdateDatasets([...items, ...datasets])} />

      {/* Top Banner & QA Report */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Gestión y Curación de Datasets
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Los datos se transforman en secuencias formateadas con tokens especiales (<code className="text-emerald-400 font-mono text-xs">&lt;|user|&gt;</code> y <code className="text-emerald-400 font-mono text-xs">&lt;|assistant|&gt;</code>) para entrenar las matrices de atención causal de nanoGPT.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json"
              className="hidden"
            />
            <button
              id="btn-import-dataset-json"
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
              title="Importar archivo JSON de ejemplos"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              Importar JSON
            </button>
            <button
              id="btn-export-dataset-json"
              onClick={handleExportJSON}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
              title="Descargar dataset completo como archivo JSON"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Exportar JSON
            </button>
            <button
              id="btn-deduplicate-dataset"
              onClick={handleDeduplicate}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition"
              title="Detectar y eliminar duplicados exactos"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              Deduplicar
            </button>
            <button
              id="btn-add-dataset-item"
              onClick={() => setShowAddModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
            >
              <Plus className="w-4 h-4" />
              Agregar Ejemplo Manual
            </button>
          </div>
        </div>

        {feedbackMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Quality Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-xs font-mono">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-400 text-[11px] block">TOTAL EJEMPLOS</span>
            <span className="text-base font-bold text-white">{quality.total}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-emerald-400 text-[11px] block">APROBADOS</span>
            <span className="text-base font-bold text-emerald-300">{quality.accepted}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-amber-400 text-[11px] block">MODIFICADOS / PENDIENTES</span>
            <span className="text-base font-bold text-amber-300">{quality.modified}</span>
          </div>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
            <span className="text-red-400 text-[11px] block">DUPLICADOS / RECHAZADOS</span>
            <span className="text-base font-bold text-red-300">{quality.duplicateCount}</span>
          </div>
        </div>
      </div>

      {/* Multilingual Proportions & Lua Specialized Training Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Multilingual Proportions */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            Proporciones Multilingües del Dataset
          </h3>
          <p className="text-xs text-slate-400">
            Define el balance de datos lingüísticos para que el modelo aprenda múltiples idiomas sin sesgo accidental.
          </p>

          <div className="space-y-4 text-xs font-mono">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Español:</span>
                <span className="font-bold text-emerald-400">{ratios.spanish}%</span>
              </div>
              <input
                id="slider-spanish"
                type="range"
                min={0}
                max={100}
                value={ratios.spanish}
                onChange={e => onUpdateProjectRatios({ ...ratios, spanish: Number(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Inglés:</span>
                <span className="font-bold text-blue-400">{ratios.english}%</span>
              </div>
              <input
                id="slider-english"
                type="range"
                min={0}
                max={100}
                value={ratios.english}
                onChange={e => onUpdateProjectRatios({ ...ratios, english: Number(e.target.value) })}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Portugués:</span>
                <span className="font-bold text-amber-400">{ratios.portuguese}%</span>
              </div>
              <input
                id="slider-portuguese"
                type="range"
                min={0}
                max={100}
                value={ratios.portuguese}
                onChange={e => onUpdateProjectRatios({ ...ratios, portuguese: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Lua Programming Datasets Highlights */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              Módulo Especializado: Lua Programming
            </h3>
            <span className="text-xs font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
              {datasets.filter(d => d.category === 'lua').length} ejemplos
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Soporta funciones, tablas asociativas e indexadas con ipairs, metatables (__index, __add), bucles y scripts de videojuegos (VoxeLibre / Love2D).
          </p>

          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-xs font-mono space-y-2 text-slate-300">
            <div className="text-emerald-400 font-bold">-- Muestra de sintaxis de entrenamiento:</div>
            <pre className="text-slate-300 whitespace-pre overflow-x-auto text-[11px] leading-relaxed">
{`local function calcular_distancia(p1, p2)
    local dx = p2.x - p1.x
    local dy = p2.y - p1.y
    return math.sqrt(dx * dx + dy * dy)
end`}
            </pre>
          </div>
        </div>
      </div>

      {/* Dataset Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Filter className="w-3 h-3" /> Categoría:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'spanish', label: 'Español' },
            { id: 'english', label: 'Inglés' },
            { id: 'portuguese', label: 'Portugués' },
            { id: 'lua', label: 'Lua' },
            { id: 'personality', label: 'Personalidad' },
            { id: 'behavior', label: 'Comportamiento' },
          ].map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedCategory === c.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="search-dataset-input"
            type="text"
            placeholder="Buscar por texto o tag..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs pl-8 pr-3 py-1.5 rounded-lg text-white w-56 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Dataset Items Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 w-28">Categoría</th>
                <th className="py-3 px-4 w-1/3">Entrada Usuario</th>
                <th className="py-3 px-4">Respuesta Objetivo</th>
                <th className="py-3 px-4 w-24">Origen</th>
                <th className="py-3 px-4 w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-white">{item.input}</td>
                  <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                    {item.output}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[10px] font-mono">
                    {item.source}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        title={item.approved ? 'Desactivar' : 'Aprobar'}
                        onClick={() => handleToggleApproved(item.id)}
                        className={`p-1 rounded ${
                          item.approved ? 'text-emerald-400 hover:bg-emerald-950' : 'text-slate-500 hover:bg-slate-800'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        title="Eliminar"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-red-400 hover:bg-red-950 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Example Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Agregar Ejemplo al Dataset
            </h3>
            <p className="text-xs text-slate-400">
              Crea un par de entrenamiento explícito. Entrenará a las matrices neuronales a asociar la entrada con la salida.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Categoría</label>
                <select
                  value={catVal}
                  onChange={e => setCatVal(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="spanish">Español</option>
                  <option value="english">Inglés</option>
                  <option value="portuguese">Portugués</option>
                  <option value="lua">Lua</option>
                  <option value="personality">Personalidad</option>
                  <option value="behavior">Comportamiento</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Entrada del Usuario (Prompt)</label>
                <input
                  id="input-dataset-user"
                  type="text"
                  placeholder="ej. ¿Cómo declaro una variable local en Lua?"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Respuesta Esperada del Asistente</label>
                <textarea
                  id="input-dataset-assistant"
                  rows={3}
                  placeholder="ej. Se usa la palabra clave local: local nombre = 'valor'"
                  value={outputVal}
                  onChange={e => setOutputVal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tags (separados por coma)</label>
                <input
                  type="text"
                  placeholder="ej. lua, variables, sintaxis"
                  value={tagsVal}
                  onChange={e => setTagsVal(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-add-dataset"
                onClick={handleAddItem}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Guardar Ejemplo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
