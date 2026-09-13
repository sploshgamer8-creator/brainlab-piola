import React, { useState } from 'react';
import { Plus, GitBranch, History, Cpu, CheckCircle2, ChevronRight, Layers, FileText, Download, Sparkles } from 'lucide-react';
import { BrainProject, CheckpointMetadata } from '../../core/types';
import { DEFAULT_TRAITS } from '../../personality/traits_manager';
import { createBrainBundle } from '../../core/checkpoint_manager';

interface ProjectsTabProps {
  projects: BrainProject[];
  currentProject: BrainProject;
  onSelectProject: (p: BrainProject) => void;
  onSaveProjects: (p: BrainProject[]) => void;
  onSwitchCheckpoint: (cpId: string) => void;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onSaveProjects,
  onSwitchCheckpoint,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [newBrainName, setNewBrainName] = useState('');
  const [newBrainDesc, setNewBrainDesc] = useState('');
  const [newPreset, setNewPreset] = useState<'tiny' | 'small' | 'medium'>('small');

  const [newBranchName, setNewBranchName] = useState('');

  const handleCreateBrain = () => {
    if (!newBrainName.trim()) return;

    const presetConfigs = {
      tiny: { n_layer: 2, n_head: 2, n_embd: 32, block_size: 32, params: 54000 },
      small: { n_layer: 4, n_head: 4, n_embd: 64, block_size: 64, params: 218000 },
      medium: { n_layer: 6, n_head: 6, n_embd: 96, block_size: 128, params: 680000 },
    };

    const cfg = presetConfigs[newPreset];

    const initialCp: CheckpointMetadata = {
      id: `brain_${Date.now().toString().slice(-4)}_0001`,
      name: 'Checkpoint 1 - Scratch Inicial',
      version: 1,
      createdAt: new Date().toISOString(),
      branch: 'main',
      step: 0,
      loss: 4.85,
      totalTokensTrained: 0,
      config: {
        block_size: cfg.block_size,
        vocab_size: 110,
        n_layer: cfg.n_layer,
        n_head: cfg.n_head,
        n_embd: cfg.n_embd,
        dropout: 0.0,
        bias: false,
      },
      paramCount: cfg.params,
      history: [{ step: 0, loss: 4.85 }],
      traits: { ...DEFAULT_TRAITS },
      notes: `Inicialización desde cero (${newPreset}). Arquitectura nanoGPT.`,
    };

    const newProj: BrainProject = {
      id: `proj_${Date.now()}`,
      name: newBrainName.trim(),
      description: newBrainDesc.trim() || 'Cerebro local nanoGPT personalizable.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentCheckpointId: initialCp.id,
      activeBranch: 'main',
      branches: ['main'],
      traits: { ...DEFAULT_TRAITS },
      multilingualRatio: { spanish: 60, english: 30, portuguese: 10 },
      checkpoints: [initialCp],
    };

    const updated = [...projects, newProj];
    onSaveProjects(updated);
    onSelectProject(newProj);
    setShowNewModal(false);
    setNewBrainName('');
    setNewBrainDesc('');
  };

  const handleAddBranch = () => {
    if (!newBranchName.trim()) return;
    const clean = newBranchName.trim().toLowerCase().replace(/\s+/g, '_');
    if (currentProject.branches.includes(clean)) return;

    const updatedProject: BrainProject = {
      ...currentProject,
      branches: [...currentProject.branches, clean],
      activeBranch: clean,
      updatedAt: new Date().toISOString(),
    };

    const updatedAll = projects.map(p => p.id === updatedProject.id ? updatedProject : p);
    onSaveProjects(updatedAll);
    onSelectProject(updatedProject);
    setNewBranchName('');
  };

  return (
    <div id="projects-tab-container" className="space-y-6">
      {/* Top Header / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            Gestión de Cerebros Neuronales (nanoGPT)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Cada cerebro es un proyecto independiente con sus propios pesos, configuración, checkpoints y experimentos de branching.
          </p>
        </div>
        <button
          id="btn-create-brain"
          onClick={() => setShowNewModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition shadow-md shadow-emerald-950"
        >
          <Plus className="w-4 h-4" />
          Crear Nuevo Cerebro
        </button>
      </div>

      {/* Grid of Brain Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((proj) => {
          const isSelected = proj.id === currentProject.id;
          const cpCount = proj.checkpoints.length;
          const activeCp = proj.checkpoints.find(c => c.id === proj.currentCheckpointId) || proj.checkpoints[0];

          return (
            <div
              key={proj.id}
              id={`brain-card-${proj.id}`}
              className={`p-5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-800/90 border-emerald-500/80 shadow-lg shadow-emerald-950/30'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
              }`}
              onClick={() => onSelectProject(proj)}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {proj.checkpoints[0]?.config?.n_layer ?? 4}L / {proj.checkpoints[0]?.config?.n_head ?? 4}H
                  </span>
                  {isSelected && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Activo
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mb-1.5">{proj.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                  {proj.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 text-xs space-y-2 text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Checkpoint actual:</span>
                  <span className="font-mono text-emerald-300 font-medium">{activeCp?.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Parámetros:</span>
                  <span className="font-mono text-slate-200">{(activeCp?.paramCount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pérdida (Loss):</span>
                  <span className="font-mono text-amber-300 font-medium">{activeCp?.loss?.toFixed(3) ?? '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ramas activas:</span>
                  <span className="font-mono text-slate-300">{proj.branches.length} rama(s)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Brain Detail: Checkpoints & Branches */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-400" />
              Historial de Checkpoints: {currentProject.name}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Los checkpoints registran los pesos neuronales, pasos de entrenamiento y funciones de pérdida sin sobrescritura destructiva.
            </p>
          </div>

          {/* Branch management */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5 text-slate-400" /> Rama:
            </span>
            <select
              id="branch-selector"
              value={currentProject.activeBranch}
              onChange={(e) => {
                const updated = { ...currentProject, activeBranch: e.target.value };
                onSaveProjects(projects.map(p => p.id === updated.id ? updated : p));
                onSelectProject(updated);
              }}
              className="bg-slate-800 text-xs text-slate-200 border border-slate-700 px-2.5 py-1 rounded focus:outline-none"
            >
              {currentProject.branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                id="new-branch-input"
                type="text"
                placeholder="Nueva rama..."
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-xs px-2 py-1 rounded text-white w-28 focus:outline-none"
              />
              <button
                id="btn-add-branch"
                onClick={handleAddBranch}
                className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Checkpoint list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">ID Checkpoint</th>
                <th className="py-3 px-4">Versión</th>
                <th className="py-3 px-4">Rama</th>
                <th className="py-3 px-4">Pasos (Steps)</th>
                <th className="py-3 px-4">Loss</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Notas</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {currentProject.checkpoints.map((cp) => {
                const isCurrent = cp.id === currentProject.currentCheckpointId;
                return (
                  <tr
                    key={cp.id}
                    className={`hover:bg-slate-800/40 transition ${isCurrent ? 'bg-emerald-950/20' : ''}`}
                  >
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                      {cp.id}
                    </td>
                    <td className="py-3 px-4 text-slate-400">v{cp.version}</td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px]">
                        {cp.branch}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-200">{cp.step.toLocaleString()}</td>
                    <td className="py-3 px-4 text-amber-300 font-bold">{cp.loss.toFixed(3)}</td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(cp.createdAt).toLocaleDateString()} {new Date(cp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate" title={cp.notes}>
                      {cp.notes}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-sans">
                        <button
                          id={`btn-download-cp-${cp.id}`}
                          onClick={() => {
                            const bundle = createBrainBundle(currentProject, cp, []);
                            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${currentProject.name.toLowerCase().replace(/\s+/g, '_')}_${cp.id}.brain.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs transition flex items-center gap-1"
                          title="Descargar este archivo de pesos .brain.json a tu máquina"
                        >
                          <Download className="w-3 h-3 text-slate-400" />
                          .brain
                        </button>
                        {isCurrent ? (
                          <span className="text-emerald-400 font-medium text-xs px-2 py-1">Activo</span>
                        ) : (
                          <button
                            id={`btn-load-cp-${cp.id}`}
                            onClick={() => onSwitchCheckpoint(cp.id)}
                            className="bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white px-2.5 py-1 rounded text-xs transition"
                          >
                            Cargar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Brain */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Crear Nuevo Cerebro nanoGPT
            </h3>
            <p className="text-xs text-slate-400">
              Configura un nuevo modelo transformer decoder-only local desde cero.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nombre del Cerebro</label>
                <input
                  id="input-new-brain-name"
                  type="text"
                  placeholder="ej. Brain C (Lua & Game Scripting)"
                  value={newBrainName}
                  onChange={e => setNewBrainName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Descripción / Propósito</label>
                <textarea
                  id="input-new-brain-desc"
                  rows={2}
                  placeholder="ej. Especializado en sintaxis de Lua y respuestas concisas..."
                  value={newBrainDesc}
                  onChange={e => setNewBrainDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Perfil de Arquitectura</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'tiny', name: 'Micro (2L/32E)', desc: '~54K params' },
                    { id: 'small', name: 'Estándar (4L/64E)', desc: '~218K params' },
                    { id: 'medium', name: 'Avanzado (6L/96E)', desc: '~680K params' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNewPreset(p.id as any)}
                      className={`p-2.5 rounded-lg border text-left transition ${
                        newPreset === p.id
                          ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{p.name}</div>
                      <div className="text-[10px] text-slate-400">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-create-brain"
                onClick={handleCreateBrain}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                Crear Cerebro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
