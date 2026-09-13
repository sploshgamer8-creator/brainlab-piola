/**
 * AutoTune Context-Adaptive Sampling Parameter Engine
 * Inspired by GODMOD3.AI (Pliny the Prompter / aetherstate).
 *
 * Automatically analyzes prompt context (code, analytical, creative, conversational)
 * and dynamically calculates the optimal temperature, top_k, top_p, and repetition_penalty.
 */

export type ContextType = 'code' | 'analytical' | 'creative' | 'conversational';

export interface AutoTuneParams {
  temperature: number;
  topK: number;
  topP: number;
  repetitionPenalty: number;
  reasoning: string;
}

export interface AutoTuneDetectionResult {
  detectedContext: ContextType;
  confidence: number;
  params: AutoTuneParams;
}

const CONTEXT_PATTERNS: Record<ContextType, RegExp[]> = {
  code: [
    /\b(code|function|class|def|var|let|const|algorithm|regex|sql|lua|typescript|javascript|python|rust|c\+\+|import|return|nil|then|end|local)\b/i,
    /```[\s\S]*```/,
    /\b(corregir|implementar|escribir|compilar|depurar|error|sintaxis|bug|optimiz)\b/i,
    /[{}();=><\[\]]/,
    /\b(table\.insert|math\.|string\.|io\.|os\.)/i,
  ],
  analytical: [
    /\b(analiza|compara|evalúa|demuestra|deriva|matemát|cálculo|optimización|kkt|gradiente|loss|estadíst|métricas|por qué|explica paso a paso)\b/i,
    /\b(ventajas y desventajas|pros y contras|diferencia entre|definición formal)\b/i,
    /[0-9]+\s*[\+\-\*\/=]\s*[0-9]+/,
    /\b(complejidad|o\(n\)|notación|teorema)\b/i,
  ],
  creative: [
    /\b(historia|cuento|poema|canción|creativo|imagina|ficción|personaje|diálogo|metáfora|rola|roleplay|actúa como)\b/i,
    /\b(describe con detalle|inventa|crea un universo|fantasía)\b/i,
  ],
  conversational: [
    /\b(hola|buenas|hey|cómo estás|qué tal|gracias|genial|adiós|chao|quién eres)\b/i,
    /\b(cuéntame de ti|qué opinas|qué piensas)\b/i,
  ],
};

export const PROFILES: Record<ContextType, AutoTuneParams> = {
  code: {
    temperature: 0.2,
    topK: 20,
    topP: 0.85,
    repetitionPenalty: 1.15,
    reasoning: 'Alta precisión sintáctica, determinismo y prevención estricta de alucinaciones en código.',
  },
  analytical: {
    temperature: 0.35,
    topK: 30,
    topP: 0.90,
    repetitionPenalty: 1.10,
    reasoning: 'Rigor lógico, estructuración analítica y deducción paso a paso.',
  },
  creative: {
    temperature: 0.95,
    topK: 60,
    topP: 0.95,
    repetitionPenalty: 1.20,
    reasoning: 'Amplitud de vocabulario, fluidez narrativa y variabilidad de tokens.',
  },
  conversational: {
    temperature: 0.70,
    topK: 40,
    topP: 0.90,
    repetitionPenalty: 1.05,
    reasoning: 'Equilibrio natural entre coherencia y espontaneidad conversacional.',
  },
};

/**
 * Detecta el contexto dominante en el prompt y retorna los parámetros calculados.
 */
export function detectContextAndTune(prompt: string): AutoTuneDetectionResult {
  const scores: Record<ContextType, number> = {
    code: 0,
    analytical: 0,
    creative: 0,
    conversational: 0,
  };

  for (const [ctx, patterns] of Object.entries(CONTEXT_PATTERNS) as [ContextType, RegExp[]][]) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        scores[ctx] += 1;
      }
    }
  }

  // Encontrar el contexto con mayor puntuación
  let bestCtx: ContextType = 'conversational';
  let maxScore = 0;

  for (const [ctx, score] of Object.entries(scores) as [ContextType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      bestCtx = ctx;
    }
  }

  // Si no hay coincidencias claras pero hay código explícito (ej. indentación o comillas)
  if (maxScore === 0 && (prompt.includes('\n    ') || prompt.includes('\t'))) {
    bestCtx = 'code';
    maxScore = 1;
  }

  const confidence = Math.min(1.0, 0.4 + maxScore * 0.2);

  return {
    detectedContext: bestCtx,
    confidence,
    params: PROFILES[bestCtx],
  };
}
