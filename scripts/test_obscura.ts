import { runWithObscura, getObscuraStatus } from '../src/server/harvester';

async function testObscura() {
  console.log('🧪 Iniciando prueba de Obscura Engine...');

  // 1. Check status
  const status = await getObscuraStatus();
  console.log('Obscura Status:', status);

  // 2. Test runWithObscura
  const res = await runWithObscura({
    url: 'https://example.com',
    dump: 'text'
  });

  console.log('Obscura Run Result:', {
    success: res.success,
    engine: res.engine,
    executionTimeMs: res.executionTimeMs,
    memoryEstimateMb: res.memoryEstimateMb,
    outputPreview: res.output.slice(0, 120)
  });

  console.log('✅ Prueba de Obscura Engine completada con éxito!');
}

testObscura();
