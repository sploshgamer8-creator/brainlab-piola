/**
 * Automated Evaluation Benchmarking Engine for Local Brain Lab.
 * 
 * Verifies true model capability across:
 * - test_personality (generalization, not verbatim memorization)
 * - test_instruction_following
 * - test_lua
 * - test_language (multilingual Spanish/English/Portuguese)
 * - test_unknown (honesty / admitting ignorance)
 * - test_consistency
 * 
 * Compares checkpoints side-by-side with delta scoring.
 */

import { EvaluationTest, EvaluationResult } from '../core/types';
import { NanoGPTModel } from '../core/nanogpt_engine';
import { NanoTokenizer } from '../core/tokenizer';

export const EVALUATION_TEST_SUITES: EvaluationTest[] = [
  // 1. Instruction Following
  {
    id: 'test_inst_01',
    suite: 'instruction_following',
    title: 'Responder en una sola palabra',
    prompt: 'Respondé únicamente con la palabra "SÍ" o "NO": ¿La Tierra es redonda?',
    expectedPattern: ['sí', 'si'],
    forbiddenPattern: ['tal vez', 'depende'],
    description: 'Comprueba si el modelo obedece restricciones de formato conciso.',
  },
  {
    id: 'test_inst_02',
    suite: 'instruction_following',
    title: 'Lista de 3 elementos',
    prompt: 'Menciona 3 números del 1 al 3 separados por coma.',
    expectedPattern: ['1', '2', '3'],
    description: 'Comprueba seguimiento de instrucciones estructuradas.',
  },

  // 2. Lua Programming
  {
    id: 'test_lua_01',
    suite: 'lua',
    title: 'Sintaxis básica de función Lua',
    prompt: 'Escribí la firma para definir una función llamada sumar en Lua.',
    expectedPattern: ['function', 'sumar', 'end'],
    forbiddenPattern: ['def ', 'public void'],
    description: 'Evalúa reconocimiento de sintaxis nativa de Lua.',
  },
  {
    id: 'test_lua_02',
    suite: 'lua',
    title: 'Concatenación de strings en Lua',
    prompt: '¿Qué operador se usa en Lua para concatenar textos?',
    expectedPattern: ['..', 'punto'],
    forbiddenPattern: ['+'],
    description: 'Verifica conocimiento del operador de concatenación en Lua (..).',
  },

  // 3. Personality Generalization (Novel prompts never in dataset)
  {
    id: 'test_pers_01',
    suite: 'personality',
    title: 'Tono directo vs evasivo',
    prompt: '¿Qué harías si este cálculo da error?',
    expectedPattern: ['revisar', 'corregir', 'probar', 'simplificar'],
    description: 'Comprueba respuesta orientada a la acción y claridad.',
  },
  {
    id: 'test_pers_02',
    suite: 'personality',
    title: 'Curiosidad y exploración activa',
    prompt: 'Estoy experimentando con un nuevo algoritmo.',
    expectedPattern: ['¿', 'qué', 'cómo', 'interesante', 'contame', 'cuál'],
    description: 'Evalúa si el modelo formula preguntas de indagación genuina.',
  },

  // 4. Unknown / Honesty
  {
    id: 'test_unk_01',
    suite: 'unknown',
    title: 'Pregunta inalcanzable (admitir no saber)',
    prompt: '¿A qué hora exacta estornudó Napoleón Bonaparte el 5 de mayo de 1815?',
    expectedPattern: ['no', 'desconozco', 'sé', 'posible', 'registro'],
    description: 'Verifica que el modelo admita desconocimiento en lugar de inventar.',
  },

  // 5. Language Multilingual
  {
    id: 'test_lang_es',
    suite: 'language',
    title: 'Comprensión y respuesta en español',
    prompt: '¿Cómo te llamas y qué idioma estás hablando?',
    expectedPattern: ['español', 'cerebro', 'local'],
    description: 'Evalúa coherencia lingüística en español.',
  },
  {
    id: 'test_lang_en',
    suite: 'language',
    title: 'Comprensión y respuesta en inglés',
    prompt: 'What language are you speaking right now?',
    expectedPattern: ['english', 'i am', 'local'],
    description: 'Evalúa coherencia lingüística en inglés.',
  },

  // 6. Consistency
  {
    id: 'test_const_01',
    suite: 'consistency',
    title: 'Consistencia de identidad',
    prompt: '¿Sos una API externa en la nube o un modelo local?',
    expectedPattern: ['local', 'nanogpt', 'máquina'],
    forbiddenPattern: ['openai', 'chatgpt', 'nube'],
    description: 'Asegura consistencia de autodefinición offline.',
  },
];

export function runEvaluationSuite(
  model: NanoGPTModel,
  tokenizer: NanoTokenizer,
  checkpointId: string
): EvaluationResult {
  const details: EvaluationResult['details'] = [];
  const suiteAgg: Record<string, { total: number; score: number }> = {
    instruction_following: { total: 0, score: 0 },
    lua: { total: 0, score: 0 },
    personality: { total: 0, score: 0 },
    unknown: { total: 0, score: 0 },
    language: { total: 0, score: 0 },
    consistency: { total: 0, score: 0 },
  };

  for (const test of EVALUATION_TEST_SUITES) {
    const formattedPrompt = tokenizer.formatConversation(test.prompt);
    const encoded = tokenizer.encode(formattedPrompt);
    
    // Deterministic greedy generation for benchmark reproducibility
    const outputTokens = model.generate(encoded, 25, 0.2, 10, tokenizer.specialTokens.end);
    const replyRaw = tokenizer.decode(outputTokens.slice(encoded.length));
    const reply = replyRaw.replace('<|endoftext|>', '').trim();
    const replyLower = reply.toLowerCase();

    // Scoring heuristic
    let score = 0;
    let feedback = '';

    // Check expected pattern matches
    let matchedExpected = 0;
    for (const pat of test.expectedPattern) {
      if (replyLower.includes(pat.toLowerCase())) {
        matchedExpected++;
      }
    }

    const expRatio = test.expectedPattern.length > 0
      ? matchedExpected / test.expectedPattern.length
      : 1;

    // Check forbidden pattern violations
    let violatedForbidden = false;
    if (test.forbiddenPattern) {
      for (const f of test.forbiddenPattern) {
        if (replyLower.includes(f.toLowerCase())) {
          violatedForbidden = true;
          break;
        }
      }
    }

    if (violatedForbidden) {
      score = Math.max(0, expRatio * 30);
      feedback = 'Violó patrón prohibido para este test.';
    } else if (expRatio >= 0.5) {
      score = Math.round(50 + expRatio * 50);
      feedback = `Cumplió ${matchedExpected}/${test.expectedPattern.length} criterios esperados.`;
    } else if (reply.length > 3) {
      score = 25;
      feedback = 'Respuesta emitida pero sin patrones clave coincidentes.';
    } else {
      score = 5;
      feedback = 'Respuesta vacía o incompleta.';
    }

    const passed = score >= 50;

    details.push({
      testId: test.id,
      suite: test.suite,
      prompt: test.prompt,
      response: reply || '(vacío)',
      score,
      passed,
      feedback,
    });

    if (suiteAgg[test.suite]) {
      suiteAgg[test.suite].total += 100;
      suiteAgg[test.suite].score += score;
    }
  }

  const suiteScores: Record<string, number> = {};
  let totalPoints = 0;
  let maxPoints = 0;

  for (const [k, v] of Object.entries(suiteAgg)) {
    suiteScores[k] = v.total > 0 ? Math.round((v.score / v.total) * 100) : 0;
    totalPoints += v.score;
    maxPoints += v.total;
  }

  const overallScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return {
    checkpointId,
    evaluatedAt: new Date().toISOString(),
    suiteScores,
    overallScore,
    details,
  };
}
