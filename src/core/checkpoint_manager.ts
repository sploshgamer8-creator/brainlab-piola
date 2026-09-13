/**
 * Checkpoint & Project Management for Local Brain Lab.
 * 
 * Rules:
 * - Never overwrite a checkpoint silently.
 * - Always record metadata: date, loss, step, config, branch, traits, notes.
 * - Supports branch experiments (e.g. Base, Base + Persona, Base + Lua).
 * - Exports and imports valid .brain bundles with integrity verification.
 */

import { BrainProject, BrainCheckpoint, CheckpointMetadata, GPTConfig, PersonalityTraits, ExternalMemoryItem } from './types';
import { DEFAULT_TRAITS } from '../personality/traits_manager';
import { StorageManager } from '../storage/storage_manager';

export interface BrainBundleFile {
  format: 'local_brain_v1';
  exportedAt: string;
  name: string;
  version: number;
  config: GPTConfig;
  paramCount: number;
  vocab: string[];
  weightsSerialized: string;
  traits: PersonalityTraits;
  metadata: {
    step: number;
    loss: number;
    branch: string;
    notes: string;
  };
  optionalMemory?: ExternalMemoryItem[];
}

const STORAGE_KEY_PROJECTS = 'local_brain_lab_projects_v1';
const STORAGE_KEY_CHECKPOINTS = 'local_brain_lab_checkpoints_v1';

export function getInitialProjects(): BrainProject[] {
  const defaultProject: BrainProject = {
    id: 'proj_brain_a',
    name: 'Brain A (General & Dialógico)',
    description: 'Cerebro base para conversación fluida en español e inglés con traits equilibrados.',
    createdAt: '2026-09-10T12:00:00Z',
    updatedAt: '2026-09-11T18:00:00Z',
    currentCheckpointId: 'brain_0001',
    activeBranch: 'main',
    branches: ['main', 'experimento_curioso', 'rama_lua'],
    traits: { ...DEFAULT_TRAITS },
    multilingualRatio: { spanish: 50, english: 30, portuguese: 20 },
    checkpoints: [
      {
        id: 'brain_0001',
        name: 'Checkpoint 1 - Base Scratch',
        version: 1,
        createdAt: '2026-09-10T12:00:00Z',
        branch: 'main',
        step: 0,
        loss: 4.82,
        totalTokensTrained: 0,
        config: {
          block_size: 64,
          vocab_size: 110,
          n_layer: 4,
          n_head: 4,
          n_embd: 64,
          dropout: 0.0,
          bias: false,
        },
        paramCount: 218432,
        history: [{ step: 0, loss: 4.82 }],
        traits: { ...DEFAULT_TRAITS },
        notes: 'Inicialización con pesos gaussianos y arquitectura nanoGPT.',
      },
      {
        id: 'brain_0002',
        name: 'Checkpoint 2 - Saludos & Diálogo',
        version: 2,
        createdAt: '2026-09-11T14:30:00Z',
        branch: 'main',
        step: 350,
        loss: 1.84,
        totalTokensTrained: 22400,
        config: {
          block_size: 64,
          vocab_size: 110,
          n_layer: 4,
          n_head: 4,
          n_embd: 64,
          dropout: 0.0,
          bias: false,
        },
        paramCount: 218432,
        history: [
          { step: 0, loss: 4.82 },
          { step: 100, loss: 3.21 },
          { step: 200, loss: 2.38 },
          { step: 350, loss: 1.84 },
        ],
        traits: { ...DEFAULT_TRAITS },
        notes: 'Entrenado sobre dataset conversacional español e inglés.',
      }
    ],
  };

  const brainB: BrainProject = {
    id: 'proj_brain_b',
    name: 'Brain B (Lua & Programación)',
    description: 'Especialista en sintaxis Lua, tables, metatables y scripting de juegos.',
    createdAt: '2026-09-11T10:00:00Z',
    updatedAt: '2026-09-11T16:00:00Z',
    currentCheckpointId: 'brain_lua_0001',
    activeBranch: 'rama_lua',
    branches: ['main', 'rama_lua'],
    traits: {
      ...DEFAULT_TRAITS,
      directness: 0.9,
      formality: 0.2,
      curiosity: 0.8,
      naturalDescription: 'Programador Lua directo, enfocado en código limpio y eficiente.',
    },
    multilingualRatio: { spanish: 60, english: 40, portuguese: 0 },
    checkpoints: [
      {
        id: 'brain_lua_0001',
        name: 'Checkpoint Lua 1 - Funciones & Tablas',
        version: 1,
        createdAt: '2026-09-11T10:30:00Z',
        branch: 'rama_lua',
        step: 200,
        loss: 2.12,
        totalTokensTrained: 14000,
        config: {
          block_size: 64,
          vocab_size: 110,
          n_layer: 4,
          n_head: 4,
          n_embd: 64,
          dropout: 0.0,
          bias: false,
        },
        paramCount: 218432,
        history: [
          { step: 0, loss: 4.79 },
          { step: 100, loss: 3.10 },
          { step: 200, loss: 2.12 },
        ],
        traits: { ...DEFAULT_TRAITS, directness: 0.9 },
        notes: 'Fine-tuning especializado sobre dataset Lua.',
      }
    ],
  };

  return [defaultProject, brainB];
}

export function loadProjectsFromStorage(): BrainProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading projects from storage', e);
  }
  const initial = getInitialProjects();
  saveProjectsToStorage(initial);
  return initial;
}

export function saveProjectsToStorage(projects: BrainProject[]): void {
  try {
    // 1. Guardar pesos pesados en IndexedDB y construir versión ligera para localStorage
    const lightweightProjects = projects.map(p => ({
      ...p,
      checkpoints: p.checkpoints.map(cp => {
        if (cp.weightsSerialized) {
          // Asíncronamente guardar los pesos en IndexedDB
          StorageManager.saveCheckpointWeights(cp.id, cp.weightsSerialized).catch(err => {
            console.warn(`[Storage] Error guardando pesos de ${cp.id} en IndexedDB:`, err);
          });
        }
        // Desacoplar pesos pesados de localStorage para no exceder cuota de 5MB
        const { weightsSerialized, ...metadataOnly } = cp;
        return metadataOnly;
      })
    }));

    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(lightweightProjects));

    // 2. Sincronización asíncrona no bloqueante con la nube (PostgreSQL en Railway)
    syncProjectsWithCloud(projects).catch(() => {
      // Offline o backend no disponible: silencioso
    });
  } catch (e) {
    console.error('Error saving projects to storage', e);
  }
}

/**
 * Carga los pesos serializados de un checkpoint, buscando en orden:
 * 1. IndexedDB local (rápido y sin límite de tamaño)
 * 2. Nube (/api/cloud/sync?checkpointId=...)
 */
export async function loadCheckpointWeights(checkpointId: string): Promise<string | null> {
  try {
    // 1. Intentar IndexedDB
    const cached = await StorageManager.getCheckpointWeights(checkpointId);
    if (cached) return cached;

    // 2. Intentar Nube
    const res = await fetch(`/api/cloud/sync?checkpointId=${encodeURIComponent(checkpointId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.checkpoint?.weightsSerialized) {
        // Almacenar en caché local de IndexedDB para futuros arranques instantáneos
        await StorageManager.saveCheckpointWeights(checkpointId, data.checkpoint.weightsSerialized);
        return data.checkpoint.weightsSerialized;
      }
    }
  } catch (err) {
    console.warn(`[Storage] No se pudieron recuperar los pesos para ${checkpointId}:`, err);
  }
  return null;
}

/**
 * Sincroniza proyectos y checkpoints con la nube (Railway PostgreSQL)
 */
export async function syncProjectsWithCloud(projects: BrainProject[]): Promise<{ success: boolean; projects?: BrainProject[] }> {
  try {
    const checkpointsWithWeights: any[] = [];
    for (const p of projects) {
      for (const cp of p.checkpoints) {
        if (cp.weightsSerialized) {
          checkpointsWithWeights.push({ ...cp, projectId: p.id });
        }
      }
    }

    const res = await fetch('/api/cloud/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projects: projects.map(p => ({
          ...p,
          checkpoints: p.checkpoints.map(({ weightsSerialized, ...rest }) => rest)
        })),
        checkpoints: checkpointsWithWeights
      })
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true };
    }
  } catch (e) {
    // Modo offline o sin conexión
  }
  return { success: false };
}

export function createBrainBundle(
  project: BrainProject,
  checkpoint: BrainCheckpoint,
  optionalMemory?: ExternalMemoryItem[]
): BrainBundleFile {
  return {
    format: 'local_brain_v1',
    exportedAt: new Date().toISOString(),
    name: project.name,
    version: checkpoint.version,
    config: checkpoint.config,
    paramCount: checkpoint.paramCount,
    vocab: checkpoint.vocab,
    weightsSerialized: checkpoint.weightsSerialized,
    traits: checkpoint.traits,
    metadata: {
      step: checkpoint.step,
      loss: checkpoint.loss,
      branch: checkpoint.branch,
      notes: checkpoint.notes,
    },
    optionalMemory,
  };
}

export function validateBrainBundle(bundle: any): { valid: boolean; error?: string } {
  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' };
  }
  if (bundle.format !== 'local_brain_v1') {
    return { valid: false, error: 'Formato desconocido: se requiere "local_brain_v1".' };
  }
  if (!bundle.config || typeof bundle.config.n_layer !== 'number') {
    return { valid: false, error: 'Falta la configuración de arquitectura nanoGPT válida.' };
  }
  if (!bundle.weightsSerialized || typeof bundle.weightsSerialized !== 'string') {
    return { valid: false, error: 'Faltan los pesos neuronales serializados en el bundle.' };
  }
  if (!Array.isArray(bundle.vocab) || bundle.vocab.length === 0) {
    return { valid: false, error: 'Falta la tabla de vocabulario del tokenizer.' };
  }
  return { valid: true };
}
