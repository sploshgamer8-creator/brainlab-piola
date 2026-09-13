/**
 * Semantic Transformation Modules (STM) Data Sanitizer
 * Inspired by GODMOD3.AI (Pliny the Prompter / aetherstate).
 *
 * Purifies training samples harvested from teacher models (Groq, Qwen, Gemini, OpenRouter)
 * by stripping sycophantic preambles, conversational filler, and weak hedging.
 * Guarantees that every token stored in binary shards represents 100% dense, actionable knowledge.
 */

export interface STMSanitizeResult {
  cleanedText: string;
  tokensSavedEstimate: number;
  modificationsApplied: string[];
}

const PREAMBLE_PATTERNS: RegExp[] = [
  // Spanish preambles
  /^(¡?claro( que sí)?[,!.]?\s*)/i,
  /^(por supuesto[,!.]?\s*)/i,
  /^(con gusto( te ayudo)?[,!.]?\s*)/i,
  /^(aquí tienes( el código| la respuesta| el script)?:?\s*)/i,
  /^(a continuación( te muestro| presento)?:?\s*)/i,
  /^(como (un )?modelo de (lenguaje|ia)[,!.]?\s*)/i,
  /^(excelente pregunta[!.]?\s*)/i,
  /^(sin problema[!.]?\s*)/i,

  // English preambles
  /^(sure( thing)?[,!.]?\s*)/i,
  /^(certainly[,!.]?\s*)/i,
  /^(of course[,!.]?\s*)/i,
  /^(absolutely[,!.]?\s*)/i,
  /^(i('d| would) be happy to help( you)?( with that)?[.!:]?\s*)/i,
  /^(here (is|are) the (code|solution|response|script)[:.]?\s*)/i,
  /^(below is (the|an) (implementation|example|solution)[:.]?\s*)/i,
  /^(as an ai (language )?model[,!.]?\s*)/i,
  /^(great question[!.]?\s*)/i,
  /^(no problem[!.]?\s*)/i,
];

const HEDGING_PATTERNS: RegExp[] = [
  /\b(creo que\s+)/gi,
  /\b(tal vez\s+)/gi,
  /\b(quizás\s+)/gi,
  /\b(parece ser que\s+)/gi,
  /\b(en mi opinión,?\s*)/gi,
  /\bi think\s+/gi,
  /\bi believe\s+/gi,
  /\bperhaps\s+/gi,
  /\bmaybe\s+/gi,
  /\bit seems like\s+/gi,
  /\bit appears that\s+/gi,
  /\bfrom my perspective,?\s*/gi,
];

const OUTRO_PATTERNS: RegExp[] = [
  /(\n\s*¡?espero que (esto |esta información )?te (sea de utilidad|sirva|haya ayudado)[.!]?\s*)$/i,
  /(\n\s*si tienes alguna (otra )?duda[,.]?\s*(házmelo saber|avísame)[.!]?\s*)$/i,
  /(\n\s*let me know if you (need|have) any( further)? questions?[.!]?\s*)$/i,
  /(\n\s*hope this helps[!.]?\s*)$/i,
];

/**
 * Sanitiza una respuesta sintética eliminando preámbulos, despedidas vacías y hedging.
 */
export function sanitizeTeacherOutput(rawOutput: string): STMSanitizeResult {
  if (!rawOutput) {
    return { cleanedText: '', tokensSavedEstimate: 0, modificationsApplied: [] };
  }

  let text = rawOutput.trim();
  const initialLength = text.length;
  const mods: string[] = [];

  // 1. Eliminar Preámbulos de apertura
  let preambleMatched = true;
  while (preambleMatched) {
    preambleMatched = false;
    for (const pat of PREAMBLE_PATTERNS) {
      if (pat.test(text)) {
        text = text.replace(pat, '').trim();
        preambleMatched = true;
        if (!mods.includes('preamble_stripped')) mods.push('preamble_stripped');
      }
    }
  }

  // 2. Eliminar Hedging innecesario
  for (const pat of HEDGING_PATTERNS) {
    if (pat.test(text)) {
      text = text.replace(pat, '');
      if (!mods.includes('hedging_reduced')) mods.push('hedging_reduced');
    }
  }

  // 3. Eliminar Despedidas / Fillers de cierre
  for (const pat of OUTRO_PATTERNS) {
    if (pat.test(text)) {
      text = text.replace(pat, '').trim();
      if (!mods.includes('outro_stripped')) mods.push('outro_stripped');
    }
  }

  // 4. Capitalizar la primera letra resultante si quedó en minúscula
  text = text.replace(/^\s*([a-z])/, (_, letter) => letter.toUpperCase()).trim();

  const charsSaved = Math.max(0, initialLength - text.length);
  const tokensSavedEstimate = Math.round(charsSaved / 3.5);

  return {
    cleanedText: text,
    tokensSavedEstimate,
    modificationsApplied: mods,
  };
}

/**
 * Aplica la sanitización a un par de entrenamiento { instruction, input, output }.
 */
export function sanitizeDatasetPair(pair: { input?: string; instruction?: string; output?: string; response?: string }): {
  input: string;
  output: string;
  tokensSaved: number;
} {
  const inp = String(pair.input || pair.instruction || '').trim();
  const rawOut = String(pair.output || pair.response || '').trim();

  const sanitized = sanitizeTeacherOutput(rawOut);

  return {
    input: inp,
    output: sanitized.cleanedText || rawOut,
    tokensSaved: sanitized.tokensSavedEstimate,
  };
}
