/**
 * LOCAL BRAIN LAB — DISTILLATION ENGINE
 * 
 * Implementa la función de pérdida combinada de destilación de conocimiento (Knowledge Distillation):
 * L_total = (1 - alpha) * L_CE(estudiante, target_one_hot) + alpha * (T^2) * L_KL(estudiante / T, maestro / T)
 * 
 * Permite que nanoGPT aprenda no solo de etiquetas duras sino de la distribución
 * suave de probabilidades (soft labels) de modelos más grandes (Gemini o 7B local).
 */

export interface DistillationConfig {
  alpha: number;       // Ponderación de destilación (ej. 0.6 para dar más peso al maestro)
  temperature: number; // Temperatura T para suavizar logits (típicamente 2.0 - 4.0)
}

export class DistillationEngine {
  private config: DistillationConfig;

  constructor(config: Partial<DistillationConfig> = {}) {
    this.config = {
      alpha: config.alpha ?? 0.5,
      temperature: config.temperature ?? 2.5,
    };
  }

  public getConfig(): DistillationConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<DistillationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Aplica softmax con temperatura T sobre un vector de logits
   */
  public softmaxWithTemperature(logits: Float32Array, temperature: number): Float32Array {
    const probs = new Float32Array(logits.length);
    let maxLogit = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxLogit) maxLogit = logits[i];
    }

    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      const exp = Math.exp((logits[i] - maxLogit) / temperature);
      probs[i] = exp;
      sum += exp;
    }

    if (sum > 0) {
      for (let i = 0; i < probs.length; i++) {
        probs[i] /= sum;
      }
    }
    return probs;
  }

  /**
   * Calcula la divergencia de Kullback-Leibler (KL) entre la distribución
   * del estudiante y la del profesor:
   * KL(P_teacher || Q_student) = sum( P_i * log(P_i / Q_i) )
   */
  public computeKLDivergence(
    studentLogits: Float32Array,
    teacherLogits: Float32Array,
    temperature: number
  ): number {
    const pTeacher = this.softmaxWithTemperature(teacherLogits, temperature);
    const qStudent = this.softmaxWithTemperature(studentLogits, temperature);

    let kl = 0;
    const eps = 1e-9;
    for (let i = 0; i < pTeacher.length; i++) {
      const p = Math.max(eps, pTeacher[i]);
      const q = Math.max(eps, qStudent[i]);
      kl += p * Math.log(p / q);
    }

    return Math.max(0, kl);
  }

  /**
   * Calcula la pérdida combinada y devuelve métricas desglosadas
   */
  public computeCombinedLoss(
    studentHardLoss: number,
    studentLogits: Float32Array,
    teacherLogits: Float32Array
  ): { totalLoss: number; hardLoss: number; klLoss: number; scaledKlLoss: number } {
    const T = this.config.temperature;
    const alpha = this.config.alpha;

    const klLoss = this.computeKLDivergence(studentLogits, teacherLogits, T);
    const scaledKlLoss = (T * T) * klLoss;

    const totalLoss = (1 - alpha) * studentHardLoss + alpha * scaledKlLoss;

    return {
      totalLoss,
      hardLoss: studentHardLoss,
      klLoss,
      scaledKlLoss,
    };
  }
}
