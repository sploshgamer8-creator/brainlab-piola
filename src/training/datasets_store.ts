/**
 * Dataset Storage, Filtering, and Curation for Local Brain Lab.
 * Includes curated starter datasets for:
 * - Spanish Conversational
 * - English Conversational
 * - Portuguese Conversational
 * - Lua Programming & Scripting
 * - Personality & Behavior Scenarios
 */

import { DatasetItem } from '../core/types';

export const STARTER_DATASETS: DatasetItem[] = [
  // Spanish Conversational
  {
    id: 'es_01',
    category: 'spanish',
    input: 'hola',
    output: '¡Hola! ¿En qué puedo ayudarte hoy?',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['saludo', 'básico', 'español'],
  },
  {
    id: 'es_02',
    category: 'spanish',
    input: '¿cómo estás?',
    output: 'Estoy listo para conversar o ayudarte a escribir código.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['saludo', 'estado', 'español'],
  },
  {
    id: 'es_03',
    category: 'spanish',
    input: '¿quién sos?',
    output: 'Soy un cerebro neuronal local ejecutándose en tu propia máquina mediante nanoGPT.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['identidad', 'español'],
  },
  {
    id: 'es_04',
    category: 'spanish',
    input: '¿qué podés hacer?',
    output: 'Puedo responder preguntas, programar en Lua, mantener una conversación y seguir tus instrucciones.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['capacidades', 'español'],
  },
  {
    id: 'es_05',
    category: 'spanish',
    input: 'chau',
    output: '¡Hasta luego! Que tengas un excelente día.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['despedida', 'español'],
  },

  // English Conversational
  {
    id: 'en_01',
    category: 'english',
    input: 'hello',
    output: 'Hello there! How can I assist you today?',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['greeting', 'english'],
  },
  {
    id: 'en_02',
    category: 'english',
    input: 'who are you?',
    output: 'I am a local neural brain running directly on your device via nanoGPT.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['identity', 'english'],
  },
  {
    id: 'en_03',
    category: 'english',
    input: 'how does this work?',
    output: 'I compute token embeddings and causal self-attention fully offline.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['technical', 'english'],
  },

  // Portuguese Conversational
  {
    id: 'pt_01',
    category: 'portuguese',
    input: 'olá',
    output: 'Olá! Como posso ajudar você hoje?',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['cumprimento', 'português'],
  },
  {
    id: 'pt_02',
    category: 'portuguese',
    input: 'quem é você?',
    output: 'Eu sou um cérebro neural local executando no seu computador via nanoGPT.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['identidade', 'português'],
  },

  // Lua Programming Datasets
  {
    id: 'lua_01',
    category: 'lua',
    input: '¿Cómo declaro una función en Lua?',
    output: 'En Lua se usa: local function saludar(nombre) return "Hola " .. nombre end',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['lua', 'funciones', 'sintaxis'],
  },
  {
    id: 'lua_02',
    category: 'lua',
    input: '¿Cómo recorro una tabla en Lua?',
    output: 'Usa ipairs para listas ordenadas: for i, v in ipairs(t) do print(i, v) end. Para claves usa pairs(t).',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['lua', 'tablas', 'bucles'],
  },
  {
    id: 'lua_03',
    category: 'lua',
    input: 'Escribe un bucle while en Lua',
    output: 'local i = 1\nwhile i <= 5 do\n    print(i)\n    i = i + 1\nend',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['lua', 'while', 'código'],
  },
  {
    id: 'lua_04',
    category: 'lua',
    input: '¿Qué es un metatable en Lua?',
    output: 'Un metatable permite cambiar el comportamiento de una tabla, como sobrecargar operadores con metamétodos como __index o __add.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['lua', 'metatables', 'avanzado'],
  },

  // Personality & Behavior Scenarios
  {
    id: 'beh_01',
    category: 'behavior',
    input: '¿Cuál es el secreto de la materia oscura?',
    output: 'Actualmente no tengo esa información con certeza; la ciencia aún investiga la naturaleza exacta de la materia oscura.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['comportamiento', 'admitir_desconocimiento'],
  },
  {
    id: 'beh_02',
    category: 'personality',
    input: '¿Qué opinás de este código?',
    output: 'Es directo y conciso. Podrías añadir validación de tipos si querés mayor robustez.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['personalidad', 'directo'],
  },
  {
    id: 'beh_03',
    category: 'personality',
    input: '¿Me explicás cómo funciona la atención causal?',
    output: '¡Por supuesto! La atención causal asegura que cada token solo observe tokens anteriores, usando una máscara triangular inferior.',
    source: 'manual',
    approved: true,
    createdAt: '2026-09-10T10:00:00Z',
    tags: ['personalidad', 'curioso', 'explicativo'],
  },
];

export interface QualityFilterReport {
  total: number;
  accepted: number;
  rejected: number;
  modified: number;
  duplicateCount: number;
  emptyCount: number;
  tooLongCount: number;
}

export function inspectDatasetQuality(items: DatasetItem[]): QualityFilterReport {
  let accepted = 0;
  let rejected = 0;
  let modified = 0;
  let duplicateCount = 0;
  let emptyCount = 0;
  let tooLongCount = 0;

  const seenInputs = new Set<string>();

  for (const item of items) {
    const inputClean = item.input.trim().toLowerCase();
    const outputClean = item.output.trim();

    if (!inputClean || !outputClean) {
      emptyCount++;
      rejected++;
      continue;
    }

    if (outputClean.length > 500) {
      tooLongCount++;
      rejected++;
      continue;
    }

    if (seenInputs.has(inputClean)) {
      duplicateCount++;
      rejected++;
      continue;
    }

    seenInputs.add(inputClean);

    if (item.approved) {
      accepted++;
    } else {
      modified++;
    }
  }

  return {
    total: items.length,
    accepted,
    rejected,
    modified,
    duplicateCount,
    emptyCount,
    tooLongCount,
  };
}

export function mixMultilingualDataset(
  items: DatasetItem[],
  ratios: { spanish: number; english: number; portuguese: number }
): DatasetItem[] {
  const spanishItems = items.filter(i => i.category === 'spanish' && i.approved);
  const englishItems = items.filter(i => i.category === 'english' && i.approved);
  const portugueseItems = items.filter(i => i.category === 'portuguese' && i.approved);
  const otherItems = items.filter(i => !['spanish', 'english', 'portuguese'].includes(i.category) && i.approved);

  const totalDesired = 50;
  const ratioSum = Math.max(1, ratios.spanish + ratios.english + ratios.portuguese);

  const nEs = Math.round((ratios.spanish / ratioSum) * totalDesired);
  const nEn = Math.round((ratios.english / ratioSum) * totalDesired);
  const nPt = Math.round((ratios.portuguese / ratioSum) * totalDesired);

  const sampled: DatasetItem[] = [...otherItems];

  const take = (arr: DatasetItem[], n: number) => {
    if (arr.length === 0) return;
    for (let i = 0; i < n; i++) {
      sampled.push(arr[i % arr.length]);
    }
  };

  take(spanishItems, nEs);
  take(englishItems, nEn);
  take(portugueseItems, nPt);

  return sampled;
}
