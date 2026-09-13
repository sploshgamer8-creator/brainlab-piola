/**
 * LOCAL BRAIN LAB — PRIORITIZED EXPERIENCE REPLAY BUFFER (PER)
 * 
 * Evita el olvido catastrófico (catastrophic forgetting) al entrenar continuamente.
 * Incluye deduplicación determinista por hash, muestreo priorizado por loss y
 * protección estricta del conjunto de anclaje (Anchor Dataset).
 */

import { ExperienceItem, TrainingBatch } from '../core/contracts';

// Hash determinista FNV-1a para deduplicación ultra-rápida en memoria
function computeDeterministicHash(input: string, output: string): string {
  const str = `${input.trim()}###${output.trim()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export class ReplayBuffer {
  private experiences: Map<string, ExperienceItem> = new Map();
  private maxCapacity: number;
  private anchorItems: Set<string> = new Set(); // IDs de anclaje protegidos

  constructor(maxCapacity = 2000) {
    this.maxCapacity = maxCapacity;
  }

  /**
   * Agrega un nuevo par al buffer con deduplicación determinista
   */
  public addExperience(
    input: string,
    output: string,
    inputTokens: number[],
    targetTokens: number[],
    isAnchor = false,
    category = 'general',
    initialLoss = 2.5
  ): boolean {
    const hash = computeDeterministicHash(input, output);

    // Si ya existe, actualizamos su prioridad y conteo sin duplicar almacenamiento
    if (this.experiences.has(hash)) {
      const existing = this.experiences.get(hash)!;
      existing.usageCount++;
      existing.priority = Math.max(existing.priority, initialLoss);
      if (isAnchor) {
        existing.isAnchor = true;
        this.anchorItems.add(existing.id);
      }
      return false; // No se agregó nuevo registro
    }

    // Si alcanzamos la capacidad máxima, purgamos elementos no-ancla con menor prioridad
    if (this.experiences.size >= this.maxCapacity) {
      this.evictLowestPriority();
    }

    const item: ExperienceItem = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      hash,
      input,
      output,
      inputTokens,
      targetTokens,
      priority: isAnchor ? 10.0 : initialLoss, // Las anclas tienen prioridad alta permanente
      loss: initialLoss,
      usageCount: 0,
      isAnchor,
      category,
      createdAt: new Date().toISOString(),
    };

    this.experiences.set(hash, item);
    if (isAnchor) {
      this.anchorItems.add(item.id);
    }
    return true;
  }

  /**
   * Construye un batch balanceado:
   * - 30% experiencias nuevas o de alta pérdida
   * - 50% replay general ponderado
   * - 20% ejemplos ancla inmutables
   */
  public sampleBatch(batchSize = 4, seqLen = 32): TrainingBatch | null {
    if (this.experiences.size === 0) return null;

    const allItems = Array.from(this.experiences.values());
    const selected: ExperienceItem[] = [];

    // 1. Extraer proporción de anclas para prevenir olvido
    const anchorList = allItems.filter(e => e.isAnchor);
    const anchorTargetCount = Math.max(1, Math.floor(batchSize * 0.25));

    for (let i = 0; i < anchorTargetCount && anchorList.length > 0; i++) {
      const pick = anchorList[Math.floor(Math.random() * anchorList.length)];
      selected.push(pick);
    }

    // 2. Llenar el resto mediante ruleta proporcional a la prioridad (PER)
    const totalPriority = allItems.reduce((acc, curr) => acc + Math.pow(curr.priority, 0.6), 0);

    while (selected.length < batchSize) {
      let r = Math.random() * totalPriority;
      let chosen = allItems[0];
      for (const item of allItems) {
        r -= Math.pow(item.priority, 0.6);
        if (r <= 0) {
          chosen = item;
          break;
        }
      }
      selected.push(chosen);
    }

    // 3. Empaquetar a tensores fijos según seqLen
    const inputs: number[][] = [];
    const targets: number[][] = [];
    const weights: number[] = [];

    for (const item of selected) {
      item.usageCount++;
      item.lastUsedAt = new Date().toISOString();

      const combined = [...item.inputTokens, ...item.targetTokens];
      const seq = combined.slice(0, seqLen);

      // Relleno si la secuencia es más corta
      while (seq.length < seqLen) {
        seq.push(0);
      }

      // Input = seq[:-1], Target = seq[1:]
      inputs.push(seq.slice(0, seqLen - 1));
      targets.push(seq.slice(1, seqLen));
      weights.push(1.0 / (item.usageCount + 1));
    }

    return { inputs, targets, weights };
  }

  /**
   * Actualiza las prioridades tras calcular la pérdida en el paso de entrenamiento
   */
  public updatePriorities(hashes: string[], newLosses: number[]): void {
    hashes.forEach((h, idx) => {
      const exp = this.experiences.get(h);
      if (exp && !exp.isAnchor) {
        exp.loss = newLosses[idx];
        exp.priority = newLosses[idx] + 0.1; // epsilon para exploración
      }
    });
  }

  /**
   * Desaloja el elemento más prescindible cuando se llena el buffer
   */
  private evictLowestPriority(): void {
    let lowestHash: string | null = null;
    let minScore = Infinity;

    for (const [hash, item] of this.experiences.entries()) {
      if (item.isAnchor) continue; // Nunca desalojar anclas

      // Puntuación: prioridad baja + muy usado = candidato a desalojo
      const score = item.priority / (item.usageCount + 1);
      if (score < minScore) {
        minScore = score;
        lowestHash = hash;
      }
    }

    if (lowestHash) {
      this.experiences.delete(lowestHash);
    }
  }

  public getStats() {
    return {
      totalExperiences: this.experiences.size,
      anchorCount: this.anchorItems.size,
      maxCapacity: this.maxCapacity,
    };
  }

  public clearNonAnchors(): void {
    for (const [hash, item] of this.experiences.entries()) {
      if (!item.isAnchor) {
        this.experiences.delete(hash);
      }
    }
  }
}
