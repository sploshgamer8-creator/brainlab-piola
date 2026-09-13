import { expandModelDepth, GrowthResult } from '../src/core/model_growth';

export { expandModelDepth, GrowthResult };

if (process.argv[1] && process.argv[1].includes('model_growth')) {
  console.log('='.repeat(65));
  console.log(' 🧠 ONEBRAIN: MODEL GROWTH ENGINE (ZeroBlockInsert Demo)');
  console.log('='.repeat(65));
  console.log('Módulo de expansión de profundidad con preservación matemática de logits.');
}
