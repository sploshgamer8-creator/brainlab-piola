/**
 * LOCAL BRAIN LAB — TEACHER PROVIDER ABSTRACTION
 * 
 * Desacopla los orígenes del Maestro (Frontier vs Local 7B vs Sintético Offline)
 * permitiendo que el estudiante aprenda tanto online como completamente offline.
 */

import { DatasetItem, PersonalityTraits } from '../core/types';

export interface TeacherHarvestRequest {
  topic: string;
  category: DatasetItem['category'];
  count: number;
  traits: PersonalityTraits;
  promptContext?: string;
}

export interface TeacherHarvestResponse {
  candidates: DatasetItem[];
  providerId: string;
  providerName: string;
  isOffline: boolean;
  latencyMs: number;
}

export interface TeacherProvider {
  id: string;
  name: string;
  isOffline: boolean;
  checkAvailability(): Promise<boolean>;
  generateSamples(req: TeacherHarvestRequest): Promise<TeacherHarvestResponse>;
}

/**
 * Proveedor 1: Gemini 2.5 Flash / Omni-Gateway (Frontier Teacher)
 */
export class GeminiTeacherProvider implements TeacherProvider {
  public id = 'gemini-frontier-teacher';
  public name = 'Gemini 2.5 Flash (Frontier)';
  public isOffline = false;

  public async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch('/api/gateway/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ping', systemInstruction: 'respond ok' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async generateSamples(req: TeacherHarvestRequest): Promise<TeacherHarvestResponse> {
    const t0 = performance.now();
    const omniRouteUrl = localStorage.getItem('local_brain_omniroute_url') || '';
    const omniRouteApiKey = localStorage.getItem('local_brain_omniroute_key') || '';
    const omniRouteModel = localStorage.getItem('local_brain_omniroute_model') || '';

    const res = await fetch('/api/distill/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: req.topic,
        category: req.category,
        count: req.count,
        traits: req.traits,
        complexity: req.category === 'lua' ? 'lua_code' : 'conversational',
        omniRouteUrl: omniRouteUrl || undefined,
        omniRouteApiKey: omniRouteApiKey || undefined,
        omniRouteModel: omniRouteModel || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini Provider HTTP ${res.status}`);
    }

    const data = await res.json();
    const t1 = performance.now();

    return {
      candidates: data.candidates || [],
      providerId: this.id,
      providerName: this.name,
      isOffline: false,
      latencyMs: Math.round(t1 - t0),
    };
  }
}

/**
 * Proveedor 2: llama.cpp GGUF Local 7B (Offline Teacher)
 */
export class LlamaCppTeacherProvider implements TeacherProvider {
  public id = 'llamacpp-7b-teacher';
  public name = 'llama.cpp Qwen/Llama 7B (Local Offline)';
  public isOffline = true;
  private endpoint: string;

  constructor(endpoint = 'http://127.0.0.1:8080') {
    this.endpoint = endpoint;
  }

  public async checkAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.endpoint}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async generateSamples(req: TeacherHarvestRequest): Promise<TeacherHarvestResponse> {
    const t0 = performance.now();
    const prompt = `Genera ${req.count} pares de entrenamiento en formato JSON para el tema: "${req.topic}", categoría: "${req.category}".`;

    try {
      const res = await fetch(`${this.endpoint}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          n_predict: 256,
          temperature: 0.7,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const t1 = performance.now();
        const text = data.content || '';

        const candidate: DatasetItem = {
          id: `llamacpp_sample_${Date.now()}`,
          category: req.category,
          input: `Consulta sobre ${req.topic}`,
          output: text.slice(0, 160) || 'Respuesta generada por llama.cpp local 7B',
          source: 'synthetic_api',
          approved: true,
          createdAt: new Date().toISOString(),
          tags: ['llamacpp', 'local_7b', 'offline'],
        };

        return {
          candidates: [candidate],
          providerId: this.id,
          providerName: this.name,
          isOffline: true,
          latencyMs: Math.round(t1 - t0),
        };
      }
    } catch {}

    // Fallback simulado
    const t1 = performance.now();
    return {
      candidates: [
        {
          id: `llamacpp_sim_${Date.now()}`,
          category: req.category,
          input: `Ejemplo de ${req.topic}`,
          output: `function procesarDatos(a, b)\n  return a + b\nend`,
          source: 'synthetic_api',
          approved: true,
          createdAt: new Date().toISOString(),
          tags: ['offline', '7b_adapter'],
        },
      ],
      providerId: this.id,
      providerName: this.name,
      isOffline: true,
      latencyMs: Math.round(t1 - t0),
    };
  }
}

/**
 * Proveedor 3: Generador Heurístico Local Offline (Fallback instantáneo)
 */
export class OfflineRuleTeacherProvider implements TeacherProvider {
  public id = 'offline-rules-teacher';
  public name = 'Motor Sintético Heurístico (Offline 0ms)';
  public isOffline = true;

  public async checkAvailability(): Promise<boolean> {
    return true;
  }

  public async generateSamples(req: TeacherHarvestRequest): Promise<TeacherHarvestResponse> {
    const t0 = performance.now();
    const baseExamples = [
      {
        input: `¿Cómo implementar ${req.topic}?`,
        output: `Para implementar ${req.topic}, define la estructura principal y valida los parámetros de entrada antes de ejecutar la lógica central.`,
      },
      {
        input: `Script básico para ${req.topic}`,
        output: `local config = { activo = true }\nfunction ejecutar()\n  if config.activo then print("Ejecutando ${req.topic}") end\nend`,
      },
      {
        input: `¿Cuál es la mejor práctica en ${req.topic}?`,
        output: `La mejor práctica es mantener módulos desacoplados, documentar tipos y utilizar manejo de errores pcall en Lua.`,
      },
    ];

    const candidates: DatasetItem[] = baseExamples.slice(0, req.count).map((ex, idx) => ({
      id: `rule_sample_${Date.now()}_${idx}`,
      category: req.category,
      input: ex.input,
      output: ex.output,
      source: 'synthetic_api',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: ['heuristic', 'zero_latency', 'offline'],
    }));

    const t1 = performance.now();
    return {
      candidates,
      providerId: this.id,
      providerName: this.name,
      isOffline: true,
      latencyMs: Math.round(t1 - t0),
    };
  }
}

/**
 * Proveedor 0: GPT-4o / GPT-4 (OpenAI Frontier Teacher)
 */
export class GPT4TeacherProvider implements TeacherProvider {
  public id = 'gpt4-frontier-teacher';
  public name = 'GPT-4o / GPT-4 (OpenAI Frontier)';
  public isOffline = false;

  public async checkAvailability(): Promise<boolean> {
    try {
      const openAiKey = localStorage.getItem('local_brain_openai_key') || localStorage.getItem('local_brain_omniroute_key') || '';
      const res = await fetch('/api/gateway/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ omniRouteApiKey: openAiKey }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async generateSamples(req: TeacherHarvestRequest): Promise<TeacherHarvestResponse> {
    const t0 = performance.now();
    const openAiKey = localStorage.getItem('local_brain_openai_key') || '';
    const openAiModel = localStorage.getItem('local_brain_openai_model') || 'gpt-4o-mini';
    const omniRouteUrl = localStorage.getItem('local_brain_omniroute_url') || '';
    const omniRouteApiKey = localStorage.getItem('local_brain_omniroute_key') || '';

    const res = await fetch('/api/distill/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: req.topic,
        category: req.category,
        count: req.count,
        traits: req.traits,
        complexity: req.category === 'lua' ? 'lua_code' : 'conversational',
        openaiApiKey: openAiKey || undefined,
        openaiModel: openAiModel || undefined,
        omniRouteUrl: omniRouteUrl || undefined,
        omniRouteApiKey: omniRouteApiKey || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`GPT-4 Provider HTTP ${res.status}`);
    }

    const data = await res.json();
    const t1 = performance.now();

    return {
      candidates: data.candidates || [],
      providerId: this.id,
      providerName: data.sourceModel || this.name,
      isOffline: false,
      latencyMs: Math.round(t1 - t0),
    };
  }
}

/**
 * Gestor Unificado de Profesores
 */
export class TeacherManager {
  private static providers: Map<string, TeacherProvider> = new Map([
    ['gpt4-frontier-teacher', new GPT4TeacherProvider()],
    ['gemini-frontier-teacher', new GeminiTeacherProvider()],
    ['llamacpp-7b-teacher', new LlamaCppTeacherProvider()],
    ['offline-rules-teacher', new OfflineRuleTeacherProvider()],
  ]);

  private static activeProviderId = 'gpt4-frontier-teacher';

  public static listProviders(): TeacherProvider[] {
    return Array.from(this.providers.values());
  }

  public static getActiveProvider(): TeacherProvider {
    return this.providers.get(this.activeProviderId) || this.providers.get('gemini-frontier-teacher') || this.providers.get('offline-rules-teacher')!;
  }

  public static setActiveProvider(id: string): boolean {
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      return true;
    }
    return false;
  }
}
