/**
 * Teacher / Data Generator Layer for Local Brain Lab.
 * 
 * STRICT ARCHITECTURAL RULES:
 * - The Teacher is ONLY for dataset generation and training assistance.
 * - The Teacher NEVER serves responses to the final end user chat.
 * - The Teacher is STRICTLY OPTIONAL.
 * - Provides both an Offline Synthetic Generator (100% offline rule-based)
 *   and an Optional External Teacher (Gemini API server proxy) when configured.
 * - All generated samples pass through a strict QA Review Queue before entering the dataset.
 */

import { DatasetItem, PersonalityTraits } from '../core/types';

export interface GeneratedCandidate {
  id: string;
  category: DatasetItem['category'];
  input: string;
  output: string;
  source: 'teacher_synthetic' | 'teacher_gemini';
  status: 'pending_review' | 'accepted' | 'rejected';
  reason?: string;
  tags: string[];
}

export async function generateSyntheticSamples(
  topic: string,
  category: DatasetItem['category'],
  count: number,
  traits: PersonalityTraits
): Promise<GeneratedCandidate[]> {
  const candidates: GeneratedCandidate[] = [];

  const templatesByTopic: Record<string, { q: string; a: string; tags: string[] }[]> = {
    general: [
      { q: '¿Qué es un algoritmo?', a: 'Un algoritmo es una secuencia finita de instrucciones bien definidas para resolver un problema.', tags: ['conceptos', 'general'] },
      { q: '¿Cómo funciona la memoria de una computadora?', a: 'La memoria almacena instrucciones y datos en forma binaria, organizados en direcciones accesibles por la CPU.', tags: ['hardware', 'general'] },
      { q: '¿Cuál es la diferencia entre interpretar y compilar?', a: 'Un compilador traduce todo el código a lenguaje máquina antes de ejecutarlo; un intérprete lo ejecuta línea por línea.', tags: ['programación', 'general'] },
    ],
    lua: [
      { q: '¿Cómo creo una tabla vacía en Lua?', a: 'En Lua creas una tabla vacía con: local mi_tabla = {}', tags: ['lua', 'tablas'] },
      { q: '¿Para qué sirve el operador # en Lua?', a: 'El operador # devuelve la longitud de una cadena o el número de elementos indexados secuencialmente en una tabla.', tags: ['lua', 'operadores'] },
      { q: '¿Cómo defino un bucle for numérico en Lua?', a: 'Con la sintaxis: for i = 1, 10 do print(i) end', tags: ['lua', 'bucles'] },
      { q: '¿Cómo funciona require en Lua?', a: 'require carga y ejecuta un módulo o librería y almacena en caché el resultado en package.loaded.', tags: ['lua', 'módulos'] },
    ],
    personality: [
      { q: '¿Podrías resolver este bug ahora mismo?', a: 'Claro, mostrame el traceback o las líneas de código afectadas y lo analizamos de inmediato.', tags: ['personalidad', 'directo'] },
      { q: '¿Qué tecnología te parece más prometedora?', a: 'Los modelos transformadores locales compactos, ya que dan control y soberanía total al usuario.', tags: ['personalidad', 'criterio'] },
    ],
    behavior: [
      { q: '¿Podés predecir el número exacto de la lotería de mañana?', a: 'No, no tengo forma de predecir eventos de azar futuros.', tags: ['comportamiento', 'admitir_desconocimiento'] },
      { q: 'Escribe solo la palabra LISTO.', a: 'LISTO', tags: ['comportamiento', 'seguir_instrucciones'] },
    ],
  };

  const pool = templatesByTopic[category] || templatesByTopic.general;

  for (let i = 0; i < count; i++) {
    const item = pool[i % pool.length];
    const variation = i >= pool.length ? ` (variación ${Math.floor(i / pool.length) + 1})` : '';
    candidates.push({
      id: `gen_synth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category,
      input: item.q + variation,
      output: item.a,
      source: 'teacher_synthetic',
      status: 'pending_review',
      tags: item.tags,
    });
  }

  return candidates;
}

export async function requestTeacherGemini(
  promptContext: string,
  topic: string,
  category: DatasetItem['category'],
  count: number,
  traits: PersonalityTraits
): Promise<GeneratedCandidate[]> {
  try {
    const response = await fetch('/api/teacher/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptContext,
        topic,
        category,
        count,
        traits,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates || [];
  } catch (err: any) {
    console.warn('Teacher API fallback to synthetic:', err.message);
    // Graceful fallback to offline synthetic generation
    return generateSyntheticSamples(topic, category, count, traits);
  }
}
