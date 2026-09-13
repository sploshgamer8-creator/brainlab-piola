import React, { useState, useEffect } from 'react';
import { Cpu, ShieldCheck, Zap, Sparkles, FolderKanban, GitBranch, Menu, X, Check, Hammer, Server, Flame } from 'lucide-react';
import { BrainProject } from '../core/types';

interface HeaderProps {
  currentProject: BrainProject;
  projects: BrainProject[];
  onSelectProject: (proj: BrainProject) => void;
  isTraining: boolean;
  trainingStep: number;
  currentLoss: number;
  teacherActive: boolean;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  projects,
  onSelectProject,
  isTraining,
  trainingStep,
  currentLoss,
  teacherActive,
  activeTab,
  onSelectTab,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const tabs = [
    {
      id: 'chat',
      label: 'Chat Local',
      icon: Cpu,
      category: 'Inferencia & Farmeo',
      description: 'Chatea offline con nanoGPT y activa el Farmeador de 100M de parámetros.',
    },
    {
      id: 'train',
      label: 'Entrenar',
      icon: Zap,
      category: 'Optimización',
      description: 'Entrenamiento con AdamW, backprop analítico y curva de loss en tiempo real.',
    },
    {
      id: 'harvester',
      label: 'Live Farmeo (Servidor)',
      icon: Server,
      category: 'Servidor 24/7',
      description: 'Telemetría 100% en tiempo real del servidor, uso de tokens y control de farmeo.',
    },
    {
      id: 'model',
      label: 'nanoGPT Core',
      icon: Cpu,
      category: 'Arquitectura',
      description: 'Configuración tensorial, capas de atención causal y auditoría matemática.',
    },
    {
      id: 'data',
      label: 'Datasets & Lua',
      icon: Sparkles,
      category: 'Datos',
      description: 'Gestión de corpus en español, ejemplos sintéticos y scripts en Lua.',
    },
    {
      id: 'teacher',
      label: 'Profesor IA',
      icon: Zap,
      category: 'Destilación',
      description: 'Generación sintética asistida y destilación de conocimiento de frontera.',
    },
    {
      id: 'personality',
      label: 'Personalidad',
      icon: Sparkles,
      category: 'Alineación',
      description: 'Ajuste de curiosidad, humor, paciencia, formalidad y directrices.',
    },
    {
      id: 'evaluate',
      label: 'Evaluar',
      icon: ShieldCheck,
      category: 'Benchmarks',
      description: 'Cálculo de perplejidad y auditoría de coherencia sintáctica.',
    },
    {
      id: 'memory',
      label: 'Memoria',
      icon: FolderKanban,
      category: 'Contexto',
      description: 'Memoria declarativa persistente inyectada en ventana de contexto.',
    },
    {
      id: 'projects',
      label: 'Proyectos',
      icon: FolderKanban,
      category: 'Versiones',
      description: 'Gestión de cerebros, ramas de experimentación y checkpoints inmutables.',
    },
    {
      id: 'export',
      label: 'Exportar & Runner',
      icon: GitBranch,
      category: 'Despliegue',
      description: 'Exportador de paquetes .brain, scripts PyTorch y runner standalone.',
    },
    {
      id: 'forge',
      label: 'La Forja (Compiler)',
      icon: Hammer,
      category: 'Despliegue',
      description: 'Compilador GGUF. Cuantización hiper-optimizada con llama.cpp.',
    },
  ];

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header id="app-header" className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Logo & Identity */}
        <div className="flex items-center gap-3">
          {/* Hamburger Trigger Button */}
          <button
            id="btn-hamburger-toggle"
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-white transition text-xs font-semibold shadow-sm group cursor-pointer"
            aria-label="Abrir menú de navegación de módulos"
            title="Abrir menú de hamburguesa con los 10 módulos del laboratorio"
          >
            <Menu className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline font-medium">Módulos</span>
            <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 text-[10px] rounded border border-emerald-500/30 font-mono">
              10
            </span>
          </button>

          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shadow-inner">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Local Brain Lab</h1>
              <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
                nanoGPT Core
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Laboratorio de Redes Neuronales 100% Offline
            </p>
          </div>
        </div>

        {/* Brain Selector & Status */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Active Brain Selector */}
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
            <span className="text-slate-400">Cerebro:</span>
            <select
              id="brain-selector-dropdown"
              value={currentProject.id}
              onChange={(e) => {
                const found = projects.find(p => p.id === e.target.value);
                if (found) onSelectProject(found);
              }}
              className="bg-transparent text-emerald-300 font-semibold focus:outline-none cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
              {currentProject.activeBranch}
            </span>
          </div>

          {/* Dynamic Status Pill */}
          {isTraining ? (
            <div id="status-pill-training" className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>ENTRENANDO: Paso {trainingStep} | Loss: {currentLoss.toFixed(3)}</span>
            </div>
          ) : teacherActive ? (
            <div id="status-pill-teacher" className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 border border-blue-500/40 text-blue-300">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>PROFESOR EXTERNO ACTIVO</span>
            </div>
          ) : (
            <div id="status-pill-offline" className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-mono">nanoGPT • 100% OFFLINE</span>
            </div>
          )}
        </div>
      </div>

      {/* Hamburger Drawer / Modal Overlay (Contains all 10 Modules) */}
      {isMenuOpen && (
        <div id="hamburger-menu-modal" className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div
            id="hamburger-drawer-panel"
            className="relative w-full max-w-md bg-slate-900 border-r border-slate-800 shadow-2xl z-10 flex flex-col h-full animate-in slide-in-from-left duration-200"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Menu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Módulos del Laboratorio</h2>
                  <p className="text-[11px] text-slate-400">10 Módulos de Local Brain Lab</p>
                </div>
              </div>
              <button
                id="btn-close-hamburger"
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Project Info */}
            <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="text-slate-400">Cerebro:</span>
                <span className="font-semibold text-emerald-400">{currentProject.name}</span>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
                Rama: {currentProject.activeBranch}
              </span>
            </div>

            {/* Modules List (All 10 Modules) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider px-1 pb-1">
                Selecciona un Módulo
              </div>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`hamburger-item-${tab.id}`}
                    onClick={() => {
                      onSelectTab(tab.id);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-3 group cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500/50 shadow-md shadow-emerald-950/20 text-white'
                        : 'bg-slate-800/40 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-inner'
                          : 'bg-slate-800 border border-slate-700 text-slate-400 group-hover:text-emerald-400 group-hover:border-slate-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold ${isSelected ? 'text-emerald-300' : 'text-slate-200'}`}>
                          {tab.label}
                        </span>
                        {isSelected ? (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded">
                            <Check className="w-2.5 h-2.5" /> Activo
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {tab.category}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
                        {tab.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="font-mono text-emerald-400">nanoGPT • 100% Offline</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-300 hover:text-white px-2.5 py-1 rounded bg-slate-800 text-xs transition"
              >
                Cerrar Menú
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
