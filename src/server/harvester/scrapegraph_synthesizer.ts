/**
 * ScrapeGraph Synthesizer (TypeScript Core)
 * Inspirado en ScrapeGraphAI: Pipeline basado en grafos para convertir
 * contenido web o documentos planos en pares estructurados de alta calidad
 * { instruction, input, output } para entrenamiento de NanoGPT.
 */

import { GoogleGenAI } from '@google/genai';
import { sanitizeTeacherOutput } from '../../core/stm_sanitizer';
import { repairAndParseJson } from '../../core/json_repair';

export interface SynthesizerOptions {
  rawContent: string;
  topic?: string;
  count?: number;
  category?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
}

export interface TrainingSample {
  instruction: string;
  input: string;
  output: string;
  category?: string;
  quality_score?: number;
}

export interface SynthesizerResult {
  success: boolean;
  samples: TrainingSample[];
  tokensProcessed: number;
  provider: string;
  error?: string;
}

export async function runScrapeGraphPipeline(options: SynthesizerOptions): Promise<SynthesizerResult> {
  const {
    rawContent,
    topic = 'General Technical',
    count = 5,
    category = 'technical_distillation',
    groqApiKey = process.env.GROQ_API_KEY || (process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(',')[0].trim() : ''),
    geminiApiKey = process.env.GEMINI_API_KEY
  } = options;

  if (!rawContent || rawContent.trim().length < 50) {
    return {
      success: false,
      samples: [],
      tokensProcessed: 0,
      provider: 'none',
      error: 'El contenido es demasiado breve para sintetizar pares de entrenamiento.'
    };
  }

  // Truncar si excede el tamaño de contexto razonable
  const truncatedContent = rawContent.slice(0, 12000);

  const prompt = `Eres un sintetizador de datasets de élite para modelos de lenguaje pequeños (ScrapeGraphAI Pipeline).
A partir del siguiente texto extraído de la web, genera exactamente ${count} ejemplos estructurados de alta densidad de información técnica.

Tema / Enfoque: ${topic}
Categoría: ${category}

Texto Fuente:
"""
${truncatedContent}
"""

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con un arreglo JSON válido:
[
  {
    "instruction": "Instrucción clara o pregunta desafiante sobre el concepto",
    "input": "Contexto adicional o código necesario (o vacío si no aplica)",
    "output": "Solución compacta, limpia, matemáticamente rigurosa o código aplicando la disciplina Ponytail (Laziness Ladder: código estándar, minimalista, sin sobre-ingeniería ni wrappers innecesarios)",
    "category": "${category}"
  }
]
2. Sin preámbulos, sin markdown externo, solo JSON puro.
3. Máxima densidad de información en el menor número de líneas sin comprometer validaciones ni seguridad.`;

  // 1. Intentar con Groq si hay clave disponible
  if (groqApiKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 3000
        })
      });

      if (res.ok) {
        const data = await res.json();
        const textResponse = data.choices?.[0]?.message?.content || '';
        const samples = extractJsonSamples(textResponse);
        if (samples.length > 0) {
          return {
            success: true,
            samples,
            tokensProcessed: Math.round(truncatedContent.length / 3.5),
            provider: 'groq/gpt-oss-20b'
          };
        }
      }
    } catch {}
  }

  // 2. Intentar con Gemini
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      const textResponse = resp.text || '';
      const samples = extractJsonSamples(textResponse);
      if (samples.length > 0) {
        return {
          success: true,
          samples,
          tokensProcessed: Math.round(truncatedContent.length / 3.5),
          provider: 'gemini-2.5-flash'
        };
      }
    } catch {}
  }

  // 3. Fallback heurístico inteligente sin LLM
  const fallbackSamples = generateHeuristicSamples(truncatedContent, topic, count, category);
  return {
    success: true,
    samples: fallbackSamples,
    tokensProcessed: Math.round(truncatedContent.length / 3.5),
    provider: 'local_heuristic_graph'
  };
}

function extractJsonSamples(rawText: string): TrainingSample[] {
  const parsed = repairAndParseJson<any[]>(rawText);
  if (Array.isArray(parsed)) {
    return parsed
      .filter(item => (item.instruction || item.input) && (item.output || item.response))
      .map(item => {
        const rawOut = String(item.output || item.response || '').trim();
        const sanitized = sanitizeTeacherOutput(rawOut);
        return {
          instruction: item.instruction || item.input || '',
          input: item.input && item.instruction ? item.input : '',
          output: sanitized.cleanedText || rawOut,
          category: item.category,
          quality_score: item.quality_score ?? 0.95
        };
      });
  }
  return [];
}

function generateHeuristicSamples(content: string, topic: string, count: number, category: string): TrainingSample[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 80);
  const samples: TrainingSample[] = [];

  for (let i = 0; i < Math.min(count, paragraphs.length); i++) {
    const p = paragraphs[i].trim();
    const firstLine = p.split('\n')[0].replace(/^[#*-]+\s*/, '');
    samples.push({
      instruction: `Explica en detalle los conceptos clave de ${topic}: ${firstLine.slice(0, 80)}`,
      input: '',
      output: p,
      category,
      quality_score: 0.85
    });
  }

  if (samples.length === 0) {
    samples.push({
      instruction: `Proporciona un resumen técnico estructurado sobre ${topic}`,
      input: '',
      output: content.slice(0, 1000),
      category,
      quality_score: 0.8
    });
  }

  return samples;
}
