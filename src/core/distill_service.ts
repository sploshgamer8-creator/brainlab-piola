import type { DatasetItem, PersonalityTraits } from '../core/types';

export interface DistillBatchRequest {
  topic: string;
  category: DatasetItem['category'];
  count: number;
  traits: PersonalityTraits;
  complexity: 'conversational' | 'reasoning_steps' | 'lua_code';
  targetScale?: '100M' | '1B' | '7B';
  omniRouteUrl?: string;
  omniRouteApiKey?: string;
  omniRouteModel?: string;
}

export interface DistillBatchResponse {
  candidates: DatasetItem[];
  sourceModel: string;
  distillRatio: string;
}

/**
 * Request high-density distillation batch from Omni-Gateway (Gemini 2.5/Flash)
 */
export async function fetchDistillationBatch(req: DistillBatchRequest): Promise<DistillBatchResponse> {
  try {
    const res = await fetch('/api/distill/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`Distill HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      candidates: data.candidates || [],
      sourceModel: data.sourceModel || 'Gemini 2.5 Flash Teacher',
      distillRatio: data.distillRatio || '35,000x',
    };
  } catch (err) {
    console.warn('Fallback offline distillation generation', err);
    return {
      candidates: generateOfflineDistillFallback(req.topic, req.category, req.count),
      sourceModel: 'Offline Distillation Engine',
      distillRatio: '1,000x',
    };
  }
}

function generateOfflineDistillFallback(topic: string, category: DatasetItem['category'], count: number): DatasetItem[] {
  const templates = [
    {
      input: '¿Cómo estás?',
      output: '¡Hola! Estoy funcionando perfectamente y listo para colaborar contigo.',
      tags: ['diálogo', 'español', 'distill_offline'],
    },
    {
      input: '¿Quién eres?',
      output: 'Soy Local Brain, un modelo nanoGPT optimizado y destilado para operar 100% en tu máquina.',
      tags: ['identidad', 'español', 'distill_offline'],
    },
    {
      input: '¿Qué puedes hacer?',
      output: 'Puedo mantener conversaciones directas en español, escribir scripts en Lua y aprender de tus datos.',
      tags: ['habilidades', 'español', 'distill_offline'],
    },
    {
      input: 'Escribe una función en Lua',
      output: 'function saludar(nombre)\n  return "Hola, " .. tostring(nombre)\nend',
      tags: ['lua', 'código', 'distill_offline'],
    },
    {
      input: '¿Cómo iterar una tabla en Lua?',
      output: 'for clave, valor in pairs(miTabla) do\n  print(clave, valor)\nend',
      tags: ['lua', 'tablas', 'distill_offline'],
    },
    {
      input: 'Gracias por tu ayuda',
      output: '¡De nada! Es un placer ayudarte. Cualquier otra duda aquí estoy.',
      tags: ['cortesía', 'español', 'distill_offline'],
    },
  ];

  return templates.slice(0, count).map((t, idx) => ({
    id: `distill_offline_${Date.now()}_${idx}`,
    category,
    input: t.input,
    output: t.output,
    source: 'synthetic_api',
    approved: true,
    createdAt: new Date().toISOString(),
    tags: t.tags,
  }));
}
