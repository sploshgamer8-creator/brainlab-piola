/**
 * 🛠️ Ponytail JSON Repair Module
 * Repara respuestas de LLMs (Groq/Gemini/OpenAI) que producen JSON truncado,
 * comillas sin cerrar, comas colgantes (trailing commas) o corchetes desbalanceados.
 * 
 * Regla Ponytail: Máxima resiliencia con el mínimo código estándar.
 */

export function repairAndParseJson<T = any>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  // 1. Limpieza inicial de markdown wrappers (```json ... ```)
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // 2. Intento directo estándar
  try {
    return JSON.parse(text) as T;
  } catch {}

  // 3. Buscar el primer '[' o '{'
  const firstArray = text.indexOf('[');
  const firstObject = text.indexOf('{');

  let startIndex = -1;
  let isArray = false;

  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    startIndex = firstArray;
    isArray = true;
  } else if (firstObject !== -1) {
    startIndex = firstObject;
    isArray = false;
  }

  if (startIndex === -1) return null;
  text = text.slice(startIndex);

  // 4. Intentar parsear después de recortar preámbulo
  try {
    return JSON.parse(text) as T;
  } catch {}

  // 5. Normalizar comas colgantes: , ] -> ] y , } -> }
  text = text.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(text) as T;
  } catch {}

  // 6. Reparación de balance de caracteres si fue cortado por token limit
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  // Si quedó una cadena abierta, cerrarla
  if (inString) {
    text += '"';
  }

  // Quitar trailing commas al final
  text = text.trim().replace(/,\s*$/, '');

  // Cerrar los delimitadores pendientes en orden inverso
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') text += '}';
    else if (open === '[') text += ']';
  }

  try {
    return JSON.parse(text) as T;
  } catch {}

  // 7. Extracción heurística de pares { input/instruction, output/response }
  if (isArray) {
    const items: any[] = [];
    const objectRegex = /\{\s*"(?:instruction|input)"[\s\S]*?"(?:output|response)"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
    let match;
    while ((match = objectRegex.exec(raw)) !== null) {
      try {
        const item = JSON.parse(match[0]);
        items.push(item);
      } catch {}
    }
    if (items.length > 0) {
      return items as T;
    }
  }

  return null;
}
