import React, { useState } from 'react';
import { FolderKanban, Plus, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Database, Cpu } from 'lucide-react';
import { ExternalMemoryItem } from '../../core/types';

interface MemoryTabProps {
  memoryItems: ExternalMemoryItem[];
  onUpdateMemory: (items: ExternalMemoryItem[]) => void;
}

export const MemoryTab: React.FC<MemoryTabProps> = ({
  memoryItems,
  onUpdateMemory,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCat, setNewCat] = useState<ExternalMemoryItem['category']>('user_fact');

  const handleAddItem = () => {
    if (!newKey.trim() || !newValue.trim()) return;

    const newItem: ExternalMemoryItem = {
      id: `mem_${Date.now()}`,
      key: newKey.trim(),
      value: newValue.trim(),
      enabled: true,
      category: newCat,
      createdAt: new Date().toISOString(),
    };

    onUpdateMemory([newItem, ...memoryItems]);
    setShowAddModal(false);
    setNewKey('');
    setNewValue('');
  };

  const handleDeleteItem = (id: string) => {
    onUpdateMemory(memoryItems.filter(m => m.id !== id));
  };

  const handleToggle = (id: string) => {
    onUpdateMemory(
      memoryItems.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m)
    );
  };

  return (
    <div id="memory-tab-container" className="space-y-6">
      {/* Top Crucial Architectural Distinction */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Memoria Externa vs Pesos Neuronales</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Neural Weights Card */}
          <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              APRENDIDO EN LOS PESOS (nanoGPT)
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              El modelo aprende <strong className="text-white">un patrón general</strong> de comportamiento, sintaxis de Lua, gramática y capacidad de seguir instrucciones mediante gradientes y optimización AdamW.
            </p>
            <div className="text-[11px] font-mono text-emerald-300 bg-slate-950 p-2 rounded border border-slate-800">
              Ejemplo: "Sabe estructurar una función en Lua y responder con tono conciso."
            </div>
          </div>

          {/* External Memory Card */}
          <div className="p-4 rounded-xl border border-blue-500/40 bg-blue-950/20 space-y-2">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <Database className="w-4 h-4" />
              ALMACENADO COMO MEMORIA EXTERNA
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Datos puntuales del usuario, preferencias o acontecimientos que se mantienen fuera de las matrices de pesos y se inyectan como contexto dinámico.
            </p>
            <div className="text-[11px] font-mono text-blue-300 bg-slate-950 p-2 rounded border border-slate-800">
              Ejemplo: "El usuario se llama Juan y su juego favorito es VoxeLibre."
            </div>
          </div>
        </div>
      </div>

      {/* Memory Items Management */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Hechos y Preferencias Registradas</h3>
            <p className="text-xs text-slate-400">
              Los elementos activos se inyectan como prefijo en el prompt de inferencia del chat local.
            </p>
          </div>

          <button
            id="btn-add-memory-item"
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-2 transition shadow-md shadow-emerald-950"
          >
            <Plus className="w-4 h-4" />
            Agregar Dato a la Memoria
          </button>
        </div>

        {/* List of items */}
        <div className="space-y-3 font-mono text-xs pt-2">
          {memoryItems.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition flex items-center justify-between gap-4 ${
                item.enabled
                  ? 'bg-slate-950 border-slate-800 text-slate-200'
                  : 'bg-slate-950/40 border-slate-900 text-slate-500'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white font-sans">{item.key}:</span>
                  <span className="text-emerald-400 font-bold">{item.value}</span>
                </div>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  {item.category}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(item.id)}
                  className={`text-xs px-2.5 py-1 rounded transition font-sans ${
                    item.enabled ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {item.enabled ? 'Activo en prompt' : 'Desactivado'}
                </button>

                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-1.5 text-red-400 hover:bg-red-950/50 rounded transition"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Nuevo Hecho de Memoria Externa
            </h3>
            <p className="text-xs text-slate-400">
              Registra un dato que el cerebro debe recordar sin modificar los pesos neuronales.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Clave (Concepto)</label>
                <input
                  type="text"
                  placeholder="ej. Nombre de usuario, Lenguaje principal..."
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Valor (Dato específico)</label>
                <input
                  type="text"
                  placeholder="ej. Juan, Lua, Proyecto Local Brain Lab..."
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Categoría</label>
                <select
                  value={newCat}
                  onChange={e => setNewCat(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="user_fact">Dato del Usuario</option>
                  <option value="preference">Preferencia</option>
                  <option value="temporary_context">Contexto Temporal</option>
                </select>
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
                id="btn-confirm-add-memory"
                onClick={handleAddItem}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Guardar Memoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
