import React, { useState } from 'react';
import { FolderKanban, Plus, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, Database, Cpu, Share2, Search, Link2, Clock, GitCommit } from 'lucide-react';
import { ExternalMemoryItem, EntityNode, RelationEdge, EpisodicMemoryGraph, EntityType, RelationType } from '../../core/types';
import { STARTER_GRAPH, queryKnowledgeGraph, buildGraphContextPrompt } from '../../memory/memory_store';

interface MemoryTabProps {
  memoryItems: ExternalMemoryItem[];
  onUpdateMemory: (items: ExternalMemoryItem[]) => void;
}

export const MemoryTab: React.FC<MemoryTabProps> = ({
  memoryItems,
  onUpdateMemory,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'facts' | 'graph'>('graph');

  // Facts Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCat, setNewCat] = useState<ExternalMemoryItem['category']>('user_fact');

  // Graph State (Graphify AST + Graphiti Episodic Memory)
  const [graph, setGraph] = useState<EpisodicMemoryGraph>(STARTER_GRAPH);
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<EntityType>('concept');
  const [nodeSummary, setNodeSummary] = useState('');

  const [showAddEdgeModal, setShowAddEdgeModal] = useState(false);
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const [edgeRelation, setEdgeRelation] = useState<RelationType>('relates_to');

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

  const handleAddNode = () => {
    if (!nodeName.trim() || !nodeSummary.trim()) return;
    const newNode: EntityNode = {
      id: `ent_${Date.now()}`,
      name: nodeName.trim(),
      type: nodeType,
      summary: nodeSummary.trim(),
      createdAt: new Date().toISOString(),
    };
    setGraph(prev => ({
      ...prev,
      entities: [...prev.entities, newNode]
    }));
    setShowAddNodeModal(false);
    setNodeName('');
    setNodeSummary('');
  };

  const handleAddEdge = () => {
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget) return;
    const newEdge: RelationEdge = {
      id: `edge_${Date.now()}`,
      sourceId: edgeSource,
      targetId: edgeTarget,
      relation: edgeRelation,
      validFrom: new Date().toISOString(),
      status: 'active'
    };
    setGraph(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge]
    }));
    setShowAddEdgeModal(false);
    setEdgeSource('');
    setEdgeTarget('');
  };

  const handleToggleEdgeStatus = (edgeId: string) => {
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.map(e => {
        if (e.id === edgeId) {
          const newStatus = e.status === 'active' ? 'invalidated' : 'active';
          return {
            ...e,
            status: newStatus,
            validTo: newStatus === 'invalidated' ? new Date().toISOString() : undefined
          };
        }
        return e;
      })
    }));
  };

  // Filtered graph based on search query
  const queryResult = graphSearchQuery.trim()
    ? queryKnowledgeGraph(graph, graphSearchQuery, 1)
    : { entities: graph.entities, edges: graph.edges };

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
              GRAFO DE CONOCIMIENTO (Graphify + Graphiti)
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Entidades del sistema (AST de código, dependencias) y relaciones temporales episódicas con validez temporal (<strong className="text-blue-300">validFrom / validTo</strong>) e invalidación de hechos pasados.
            </p>
            <div className="text-[11px] font-mono text-blue-300 bg-slate-950 p-2 rounded border border-slate-800">
              {'Ejemplo: "(Ponytail Discipline -[supersedes]-> Cloud Harvester) [active]"'}
            </div>
          </div>
        </div>
      </div>

      {/* Mode Sub-Tabs */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
        <button
          onClick={() => setActiveSubTab('graph')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === 'graph'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          Grafo de Conocimiento Episódico (Graphify / Graphiti)
        </button>
        <button
          onClick={() => setActiveSubTab('facts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === 'facts'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Hechos Clave-Valor Simples ({memoryItems.length})
        </button>
      </div>

      {/* VIEW 1: Knowledge Graph (Graphify / Graphiti) */}
      {activeSubTab === 'graph' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-blue-400" />
                  Red de Entidades & Grafo Temporal
                </h3>
                <p className="text-xs text-slate-400">
                  AST de código, dependencias funcionales y memoria episódica temporal con soporte de saltos (Multi-Hop Traversal).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddNodeModal(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-md shadow-blue-950"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva Entidad
                </button>
                <button
                  onClick={() => setShowAddEdgeModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-md shadow-indigo-950"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Nueva Relación
                </button>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar entidad en el grafo (ej. Harvester, Obscura, Ponytail, Lua)..."
                value={graphSearchQuery}
                onChange={e => setGraphSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {/* Entities Grid */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Nodos / Entidades Registradas ({queryResult.entities.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {queryResult.entities.map(ent => (
                  <div key={ent.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs truncate">{ent.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                        ent.type === 'concept' ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60' :
                        ent.type === 'agent' ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60' :
                        ent.type === 'file' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60' :
                        ent.type === 'function' ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60' :
                        'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                      }`}>
                        {ent.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {ent.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Relations List */}
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Aristas de Relación Episódica Temporal ({queryResult.edges.length})
              </h4>
              <div className="space-y-2">
                {queryResult.edges.map(edge => {
                  const source = graph.entities.find(e => e.id === edge.sourceId);
                  const target = graph.entities.find(e => e.id === edge.targetId);
                  return (
                    <div
                      key={edge.id}
                      className={`p-3 rounded-lg border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        edge.status === 'active'
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950/40 border-slate-900 text-slate-600 line-through'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-white font-sans">{source?.name || edge.sourceId}</span>
                        <span className="text-[11px] text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded">
                          --[{edge.relation}]--&gt;
                        </span>
                        <span className="font-bold text-cyan-300 font-sans">{target?.name || edge.targetId}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>Desde: {new Date(edge.validFrom).toLocaleDateString()}</span>
                          {edge.validTo && <span>| Hasta: {new Date(edge.validTo).toLocaleDateString()}</span>}
                        </div>

                        <button
                          onClick={() => handleToggleEdgeStatus(edge.id)}
                          className={`text-[10px] px-2 py-0.5 rounded transition ${
                            edge.status === 'active'
                              ? 'bg-emerald-950/70 border border-emerald-800/60 text-emerald-300'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {edge.status === 'active' ? 'Activo (Válido)' : 'Invalidado (Histórico)'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Simple Key-Value Facts */}
      {activeSubTab === 'facts' && (
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
      )}

      {/* Add Entity Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Nueva Entidad del Grafo (Graphify)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nombre de la Entidad</label>
                <input
                  type="text"
                  placeholder="ej. ObscuraEngine, Ponytail, Juan..."
                  value={nodeName}
                  onChange={e => setNodeName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tipo de Entidad</label>
                <select
                  value={nodeType}
                  onChange={e => setNodeType(e.target.value as EntityType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="concept">Concepto / Filosofía</option>
                  <option value="file">Archivo de Código</option>
                  <option value="function">Función / Método AST</option>
                  <option value="agent">Agente / Worker</option>
                  <option value="user_fact">Hecho de Usuario</option>
                  <option value="system">Subsistema Core</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Resumen / Propósito</label>
                <textarea
                  rows={3}
                  placeholder="Descripción de la función o rol dentro de OneBrain..."
                  value={nodeSummary}
                  onChange={e => setNodeSummary(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddNodeModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddNode}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Guardar Entidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Edge Modal */}
      {showAddEdgeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-400" />
              Nueva Relación Temporal (Graphiti)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Entidad Origen</label>
                <select
                  value={edgeSource}
                  onChange={e => setEdgeSource(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="">Seleccionar origen...</option>
                  {graph.entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name} ({ent.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tipo de Relación</label>
                <select
                  value={edgeRelation}
                  onChange={e => setEdgeRelation(e.target.value as RelationType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="relates_to">se relaciona con (relates_to)</option>
                  <option value="calls">invoca / llama a (calls)</option>
                  <option value="depends_on">depende de (depends_on)</option>
                  <option value="defines">define a (defines)</option>
                  <option value="supersedes">invalida / reemplaza a (supersedes)</option>
                  <option value="interacts_with">interactúa con (interacts_with)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Entidad Destino</label>
                <select
                  value={edgeTarget}
                  onChange={e => setEdgeTarget(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="">Seleccionar destino...</option>
                  {graph.entities.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name} ({ent.type})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddEdgeModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddEdge}
                disabled={!edgeSource || !edgeTarget || edgeSource === edgeTarget}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Conectar Relación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Fact Item Modal */}
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
