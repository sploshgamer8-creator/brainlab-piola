import React, { useState, useEffect } from 'react';
import { Database, PackageCheck, Send, RefreshCw, GitFork, KeyRound, CheckCircle2, Clock, Globe, Shield, Download, Server, UploadCloud, AlertCircle } from 'lucide-react';
import { BrainProject, CheckpointMetadata } from '../core/types';

interface PackagingQueueItem {
  id: string;
  project_id: string;
  checkpoint_id: string;
  format: string;
  status: 'pending' | 'packaging' | 'ready' | 'distributed' | 'failed';
  artifact_name: string;
  size_bytes: number;
  download_url?: string;
  destination_target: string;
  created_at: string;
  completed_at?: string;
}

interface DistributionNode {
  id: string;
  name: string;
  channel_type: string;
  endpoint_url: string;
  status: 'active' | 'standby' | 'offline';
  last_sync: string | null;
}

interface PackagingQueuePanelProps {
  currentProject: BrainProject;
  activeCheckpoint: CheckpointMetadata;
}

export const PackagingQueuePanel: React.FC<PackagingQueuePanelProps> = ({
  currentProject,
  activeCheckpoint,
}) => {
  const [queue, setQueue] = useState<PackagingQueueItem[]>([]);
  const [nodes, setNodes] = useState<DistributionNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'safetensors' | 'brain_bundle' | 'standalone_html' | 'cli' | 'farmed_corpus_100m'>('safetensors');
  const [targetDestination, setTargetDestination] = useState<string>('gitlab_repo');
  const [gitProvider, setGitProvider] = useState<'gitlab' | 'github'>('gitlab');
  const [gitRepo, setGitRepo] = useState(() => localStorage.getItem('local_brain_git_repo') || 'brainlab-group/brainlab');
  const [gitBranch, setGitBranch] = useState(() => localStorage.getItem('local_brain_git_branch') || 'main');
  const [gitUrl, setGitUrl] = useState(() => localStorage.getItem('local_brain_git_url') || 'https://gitlab.com/brainlab-group/brainlab.git');
  const [gitToken, setGitToken] = useState(() => localStorage.getItem('local_brain_git_token') || '');
  const [isPushing, setIsPushing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Cargar estado de la base de datos SQLite del backend
  const fetchQueueAndNodes = async () => {
    setIsLoading(true);
    try {
      const [qRes, nRes] = await Promise.all([
        fetch('/api/packaging/queue'),
        fetch('/api/distribution/nodes'),
      ]);
      if (qRes.ok) {
        const qData = await qRes.json();
        setQueue(qData.queue || []);
      }
      if (nRes.ok) {
        const nData = await nRes.json();
        setNodes(nData.nodes || []);
      }
    } catch (err) {
      console.warn('Backend SQLite offline o inicializando:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueAndNodes();
    const interval = setInterval(fetchQueueAndNodes, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleEnqueue = async () => {
    try {
      setFeedback('Encolando tarea de empaquetado en backend SQLite...');
      const ext =
        selectedFormat === 'safetensors'
          ? 'safetensors'
          : selectedFormat === 'brain_bundle'
          ? 'brain.json'
          : selectedFormat === 'farmed_corpus_100m'
          ? 'farmed_100m.json'
          : selectedFormat === 'standalone_html'
          ? 'html'
          : 'cjs';

      const res = await fetch('/api/packaging/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          checkpointId: activeCheckpoint.id,
          format: selectedFormat,
          destinationTarget: targetDestination,
          artifactName: `${currentProject.name.toLowerCase().replace(/\s+/g, '_')}_${activeCheckpoint.id}.${ext}`,
          sizeBytes: activeCheckpoint.paramCount ? activeCheckpoint.paramCount * 4 : 870000,
        }),
      });

      if (res.ok) {
        setFeedback('¡Trabajo de empaquetado registrado en la tabla SQLite con éxito!');
        setTimeout(fetchQueueAndNodes, 500);
      }
    } catch (err: any) {
      setFeedback('Error al encolar: ' + err.message);
    }
  };

  const handleRedistribute = async (queueId: string, dest: string) => {
    try {
      const res = await fetch('/api/packaging/redistribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, destinationTarget: dest }),
      });
      if (res.ok) {
        setFeedback(`Artefacto redistribuido exitosamente a ${dest}`);
        fetchQueueAndNodes();
      }
    } catch (err: any) {
      setFeedback('Error al redistribuir: ' + err.message);
    }
  };

  const handleSaveGitSync = () => {
    localStorage.setItem('local_brain_git_repo', gitRepo);
    localStorage.setItem('local_brain_git_branch', gitBranch);
    localStorage.setItem('local_brain_git_url', gitUrl);
    localStorage.setItem('local_brain_git_provider', gitProvider);
    if (gitToken) {
      localStorage.setItem('local_brain_git_token', gitToken);
    }
    setFeedback(`Perfil de Git guardado: ${gitRepo} en ${gitUrl} (${gitBranch}). Listo para sincronizar artefactos.`);
  };

  const handleDirectGitPush = async () => {
    if (!gitToken.trim()) {
      setFeedback('Error: Ingresa tu Personal Access Token (PAT) de GitLab para autorizar el push.');
      return;
    }

    setIsPushing(true);
    setFeedback('Iniciando sincronización interna hacia ' + gitUrl + '...');
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: gitUrl,
          branch: gitBranch,
          token: gitToken.trim(),
          authorName: 'BrainLab Engineer',
          authorEmail: 'brainlab@local.internal',
          commitMessage: `sync: migración y actualización desde Local Brain Lab [${new Date().toISOString()}]`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Fallo desconocido al sincronizar con Git');
      }

      setFeedback(`¡Éxito! ${data.message}`);
      localStorage.setItem('local_brain_git_token', gitToken);
    } catch (err: any) {
      setFeedback(`Error al sincronizar: ${err.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div id="packaging-distribution-section" className="space-y-6">
      {/* Encabezado del Backend SQL */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-950 border border-indigo-500/30 text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Fila de Empaquetado & Redistribución (SQLite Backend)
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-mono">
                  SQL RELACIONAL
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pipeline de empaquetado asíncrono para redistribuir pesos y metadatos de <strong className="text-slate-200">{currentProject.name}</strong> a GitHub Privado, Hugging Face o nodos locales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchQueueAndNodes}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition border border-slate-700"
              title="Refrescar estado de SQLite"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refrescar</span>
            </button>
            <a
              href="/api/database/download"
              download="local_brain_registry.sqlite"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
              title="Descargar base de datos SQLite cruda para migrar entre sesiones"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar SQLite</span>
            </a>
          </div>
        </div>

        {feedback && (
          <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white text-[11px]">✕</button>
          </div>
        )}
      </div>

      {/* Grid: Formulario de Encolado + Perfil de GitHub Privado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formulario para Crear Trabajo en la Fila */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-400" />
            Nuevo Trabajo de Empaquetado
          </h4>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Checkpoint Activo Seleccionado:</label>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-slate-200 font-mono">
                <span>{activeCheckpoint.name} ({activeCheckpoint.id})</span>
                <span className="text-emerald-400 text-[11px]">Step {activeCheckpoint.step} • Loss {activeCheckpoint.loss.toFixed(4)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Formato de Empaque:</label>
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="safetensors">SafeTensors (.safetensors)</option>
                  <option value="brain_bundle">Paquete (.brain.json)</option>
                  <option value="farmed_corpus_100m">🌾 Todo lo Farmeado 100M (.json)</option>
                  <option value="standalone_html">BrainRunner (HTML Autónomo)</option>
                  <option value="cli">Node.js CLI Runner (.cjs)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Destino de Redistribución:</label>
                <select
                  value={targetDestination}
                  onChange={(e) => setTargetDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="gitlab_repo">GitLab Repo (brainlab-group/brainlab)</option>
                  <option value="github_release">GitHub Releases / Repo Privado</option>
                  <option value="huggingface_hub">Hugging Face Model Hub</option>
                  <option value="local_download">Descarga Local Directa</option>
                  <option value="peer_mesh">Peer-to-Peer Edge Mesh</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleEnqueue}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Encolar en Fila de Empaquetado SQL</span>
            </button>
          </div>
        </div>

        {/* Configuración de GitLab / GitHub para Migración Entre Sesiones */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <GitFork className="w-4 h-4 text-orange-400" />
              Sincronización con Repositorio Git
            </h4>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setGitProvider('gitlab');
                  setGitRepo('brainlab-group/brainlab');
                  setGitUrl('https://gitlab.com/brainlab-group/brainlab.git');
                }}
                className={`text-[10px] px-2 py-0.5 rounded border transition ${gitProvider === 'gitlab' ? 'bg-orange-950/80 text-orange-300 border-orange-500/50 font-bold' : 'text-slate-400 border-slate-700'}`}
              >
                GitLab
              </button>
              <button
                type="button"
                onClick={() => {
                  setGitProvider('github');
                  setGitRepo('mistificacionlondres-cmd/brainlab');
                  setGitUrl('https://github.com/mistificacionlondres-cmd/brainlab.git');
                }}
                className={`text-[10px] px-2 py-0.5 rounded border transition ${gitProvider === 'github' ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50 font-bold' : 'text-slate-400 border-slate-700'}`}
              >
                GitHub
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Vinculado a <strong className="text-orange-300 font-mono">brainlab-group/brainlab</strong> en GitLab para clonar checkpoints, datasets y la base SQLite entre instancias:
          </p>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">URL del Repositorio (.git):</label>
              <input
                type="text"
                value={gitUrl}
                onChange={(e) => {
                  setGitUrl(e.target.value);
                  const m = e.target.value.match(/(?:gitlab\.com|github\.com)\/([^/]+\/[^/.]+)/);
                  if (m) setGitRepo(m[1]);
                }}
                placeholder="https://gitlab.com/brainlab-group/brainlab.git"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Espacio / Repo:</label>
                <input
                  type="text"
                  value={gitRepo}
                  onChange={(e) => setGitRepo(e.target.value)}
                  placeholder="brainlab-group/brainlab"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Rama de Trabajo:</label>
                <input
                  type="text"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-400">Personal Access Token ({gitProvider === 'gitlab' ? 'GitLab PAT' : 'GitHub PAT'}):</label>
                <span className="text-[10px] text-slate-500">Permiso write_repository</span>
              </div>
              <input
                type="password"
                value={gitToken}
                onChange={(e) => setGitToken(e.target.value)}
                placeholder={gitProvider === 'gitlab' ? 'glpat-xxxxxxxxxxxxxxxxxxxx' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveGitSync}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition text-xs"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Guardar Perfil</span>
              </button>

              <button
                type="button"
                disabled={isPushing}
                onClick={handleDirectGitPush}
                className="bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-orange-950/40"
              >
                {isPushing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-200" />
                    <span>Haciendo Push Interno...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Migrar / Push Directo a GitLab</span>
                  </>
                )}
              </button>
            </div>

            {/* Aviso de compatibilidad con 100M+ parámetros y Git LFS */}
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-orange-300 font-semibold">
                <Shield className="w-3.5 h-3.5" />
                <span>GitLab LFS & Package Registry (Hasta 7B Parámetros)</span>
              </div>
              <p className="leading-relaxed">
                GitLab soporta almacenamiento de gran capacidad con <strong>Git LFS nativo</strong> y <strong>Generic Package Registry</strong>, permitiendo subir SafeTensors y shards binarios de 100M a 7B sin restricciones de 100MB.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de la Fila de Empaquetado (SQLite) */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4 text-amber-400" />
            Cola de Trabajos Activos en SQLite ({queue.length})
          </h4>
          <span className="text-[11px] text-slate-400">Actualización en tiempo real</span>
        </div>

        {queue.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs">
            No hay elementos en la cola. Haz clic en "Encolar en Fila de Empaquetado" para registrar un artefacto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">ID / Artefacto</th>
                  <th className="py-2.5 px-3">Formato</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">Destino</th>
                  <th className="py-2.5 px-3">Creado</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-200 font-medium">
                      <div className="flex flex-col">
                        <span className="text-slate-100">{item.artifact_name}</span>
                        <span className="text-[10px] text-slate-500">{item.id}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                        {item.format}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {item.status === 'ready' && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Listo
                        </span>
                      )}
                      {item.status === 'packaging' && (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                          <Clock className="w-3 h-3 animate-spin" /> Empaquetando
                        </span>
                      )}
                      {item.status === 'distributed' && (
                        <span className="inline-flex items-center gap-1 text-indigo-400 text-[11px] bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/30">
                          <Globe className="w-3 h-3" /> Redistribuido
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                      {item.destination_target}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                      {new Date(item.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'ready' && (
                          <button
                            onClick={() => handleRedistribute(item.id, 'github_release')}
                            className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 text-[11px] transition flex items-center gap-1"
                            title="Distribuir a repositorio GitHub"
                          >
                            <Send className="w-3 h-3" />
                            <span>Redistribuir</span>
                          </button>
                        )}
                        {item.status === 'distributed' && (
                          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Sincronizado
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nodos de Distribución Activos */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          Canales de Redistribución Conectados ({nodes.length})
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {nodes.map((node) => (
            <div key={node.id} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-white">{node.name}</span>
                <span className={`w-2 h-2 rounded-full ${node.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </div>
              <p className="text-[11px] text-slate-400 truncate font-mono">{node.endpoint_url || 'N/A'}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                <span>Canal: {node.channel_type}</span>
                <span>{node.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
