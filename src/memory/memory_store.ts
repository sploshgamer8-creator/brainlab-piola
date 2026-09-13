/**
 * External Conversational Memory Module.
 * 
 * CRITICAL ARCHITECTURAL DISTINCTION:
 * - Neural Weights (nanoGPT): General learned patterns, syntax, traits, behaviors.
 * - External Memory: Ephemeral or persistent key-value facts (e.g. "User name is Juan",
 *   "Favorite game engine: VoxeLibre").
 * 
 * Never confused with weight tensors!
 */

import { ExternalMemoryItem } from '../core/types';

export const STARTER_MEMORY: ExternalMemoryItem[] = [
  {
    id: 'mem_01',
    key: 'Nombre del usuario',
    value: 'Juan',
    enabled: true,
    category: 'user_fact',
    createdAt: '2026-09-11T12:00:00Z',
  },
  {
    id: 'mem_02',
    key: 'Lenguaje favorito',
    value: 'Lua',
    enabled: true,
    category: 'preference',
    createdAt: '2026-09-11T12:00:00Z',
  },
  {
    id: 'mem_03',
    key: 'Proyecto actual',
    value: 'Local Brain Lab con nanoGPT',
    enabled: true,
    category: 'temporary_context',
    createdAt: '2026-09-11T12:00:00Z',
  },
];

export function buildMemoryContextPrompt(items: ExternalMemoryItem[]): string {
  const activeItems = items.filter(i => i.enabled && i.value.trim().length > 0);
  if (activeItems.length === 0) return '';

  const facts = activeItems.map(i => `${i.key}: ${i.value}`).join('; ');
  return `[Memoria externa: ${facts}] `;
}
