/**
 * External Conversational & Episodic Knowledge Graph Memory Module.
 * Inspired by Graphify (AST Code Knowledge Graphs) & Graphiti (Temporal Episodic Memory).
 * 
 * CRITICAL ARCHITECTURAL DISTINCTION:
 * - Neural Weights (nanoGPT): General learned patterns, syntax, traits, behaviors.
 * - Knowledge Graph Memory: Explicit entities, AST relationships, and temporal episodic facts
 *   with validFrom / validTo timestamps and invalidation tracking.
 */

import { ExternalMemoryItem, EntityNode, RelationEdge, EpisodicMemoryGraph } from '../core/types';

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

export const STARTER_GRAPH: EpisodicMemoryGraph = {
  entities: [
    {
      id: 'ent_user',
      name: 'Usuario (Juan)',
      type: 'user_fact',
      summary: 'Desarrollador principal de OneBrain y BrainLabPiola',
      createdAt: '2026-09-11T12:00:00Z'
    },
    {
      id: 'ent_nanogpt',
      name: 'NanoGPT Core',
      type: 'system',
      summary: 'Motor neuronal autorregresivo ligero en TypeScript/Wasm',
      createdAt: '2026-09-11T12:00:00Z'
    },
    {
      id: 'ent_harvester',
      name: 'Cloud Harvester (Railway)',
      type: 'agent',
      summary: 'Worker 24/7 con rotación de 5 Groq keys y PostgreSQL',
      createdAt: '2026-09-11T12:00:00Z'
    },
    {
      id: 'ent_ponytail',
      name: 'Ponytail Discipline',
      type: 'concept',
      summary: 'Regla anti-sobreingeniería y Escalera de Pereza (Laziness Ladder)',
      createdAt: '2026-09-13T04:00:00Z'
    },
    {
      id: 'ent_obscura',
      name: 'Obscura Engine',
      type: 'file',
      summary: 'Headless browser en Rust + V8 JS engine para extracción ultraligera (~30MB RAM)',
      createdAt: '2026-09-13T06:00:00Z'
    },
    {
      id: 'ent_scrapling',
      name: 'Scrapling Stealth',
      type: 'function',
      summary: 'Bypass de protecciones Cloudflare Turnstile con emulación TLS',
      createdAt: '2026-09-13T06:30:00Z'
    }
  ],
  edges: [
    {
      id: 'edge_01',
      sourceId: 'ent_user',
      targetId: 'ent_nanogpt',
      relation: 'defines',
      validFrom: '2026-09-11T12:00:00Z',
      status: 'active'
    },
    {
      id: 'edge_02',
      sourceId: 'ent_harvester',
      targetId: 'ent_nanogpt',
      relation: 'interacts_with',
      validFrom: '2026-09-12T00:00:00Z',
      status: 'active'
    },
    {
      id: 'edge_03',
      sourceId: 'ent_ponytail',
      targetId: 'ent_harvester',
      relation: 'supersedes',
      validFrom: '2026-09-13T04:00:00Z',
      status: 'active'
    },
    {
      id: 'edge_04',
      sourceId: 'ent_harvester',
      targetId: 'ent_obscura',
      relation: 'calls',
      validFrom: '2026-09-13T06:00:00Z',
      status: 'active'
    },
    {
      id: 'edge_05',
      sourceId: 'ent_harvester',
      targetId: 'ent_scrapling',
      relation: 'calls',
      validFrom: '2026-09-13T06:30:00Z',
      status: 'active'
    }
  ]
};

export function buildMemoryContextPrompt(items: ExternalMemoryItem[]): string {
  const activeItems = items.filter(i => i.enabled && i.value.trim().length > 0);
  if (activeItems.length === 0) return '';

  const facts = activeItems.map(i => `${i.key}: ${i.value}`).join('; ');
  return `[Memoria externa: ${facts}] `;
}

/**
 * Recorre el grafo de conocimiento temporal buscando entidades y aristas relevantes.
 */
export function queryKnowledgeGraph(
  graph: EpisodicMemoryGraph,
  query: string,
  hops: number = 1
): { entities: EntityNode[]; edges: RelationEdge[] } {
  const q = query.toLowerCase();
  const matchedEntities = graph.entities.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.summary.toLowerCase().includes(q) ||
    e.type.toLowerCase().includes(q)
  );

  if (matchedEntities.length === 0) {
    return { entities: [], edges: [] };
  }

  const entityIds = new Set<string>(matchedEntities.map(e => e.id));
  
  // Hop expansion
  for (let h = 0; h < hops; h++) {
    const currentIds = Array.from(entityIds);
    for (const edge of graph.edges) {
      if (edge.status !== 'active') continue;
      if (currentIds.includes(edge.sourceId)) {
        entityIds.add(edge.targetId);
      }
      if (currentIds.includes(edge.targetId)) {
        entityIds.add(edge.sourceId);
      }
    }
  }

  const resultEntities = graph.entities.filter(e => entityIds.has(e.id));
  const resultEdges = graph.edges.filter(
    edge => edge.status === 'active' && entityIds.has(edge.sourceId) && entityIds.has(edge.targetId)
  );

  return { entities: resultEntities, edges: resultEdges };
}

/**
 * Convierte el subgrafo en un formato de prompt episódico para inyectar en el LLM.
 */
export function buildGraphContextPrompt(
  graph: EpisodicMemoryGraph,
  query?: string
): string {
  const activeEdges = graph.edges.filter(e => e.status === 'active');
  if (graph.entities.length === 0) return '';

  const entityMap = new Map<string, EntityNode>(graph.entities.map(e => [e.id, e]));
  const edgeDescriptions: string[] = [];

  for (const edge of activeEdges) {
    const src = entityMap.get(edge.sourceId);
    const tgt = entityMap.get(edge.targetId);
    if (src && tgt) {
      edgeDescriptions.push(`(${src.name} -[${edge.relation}]-> ${tgt.name})`);
    }
  }

  const entitySummaries = graph.entities.slice(0, 8).map(e => `${e.name} [${e.type}]: ${e.summary}`);

  return `[Grafo de Memoria Episódica: Entidades={${entitySummaries.join(' | ')}} Relaciones={${edgeDescriptions.join(', ')}}] `;
}
