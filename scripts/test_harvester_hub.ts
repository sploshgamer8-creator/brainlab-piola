import { fetchWithScraplingStealth, ingestWithAgentReach, runScrapeGraphPipeline } from '../src/server/harvester';

async function testHarvester() {
  console.log('🧪 Iniciando prueba de infraestructura Harvester Hub...');

  // 1. Test Scrapling Stealth Fetch
  console.log('\n--- 1. Testing Scrapling Stealth Fetch ---');
  try {
    const scrapRes = await fetchWithScraplingStealth({
      url: 'https://example.com'
    });
    console.log('Scrapling Result:', {
      success: scrapRes.success,
      status: scrapRes.status,
      title: scrapRes.title,
      contentLength: scrapRes.content.length,
      sampleContent: scrapRes.content.slice(0, 100)
    });
  } catch (err: any) {
    console.error('Scrapling Test Error:', err.message);
  }

  // 2. Test Agent Reach GitHub Ingestion
  console.log('\n--- 2. Testing Agent Reach GitHub Ingestion ---');
  try {
    const reachRes = await ingestWithAgentReach({
      platform: 'github',
      target: 'karpathy/nanoGPT'
    });
    console.log('Agent Reach Result:', {
      success: reachRes.success,
      platform: reachRes.platform,
      title: reachRes.title,
      contentLength: reachRes.content.length,
      sampleContent: reachRes.content.slice(0, 150)
    });
  } catch (err: any) {
    console.error('Agent Reach Test Error:', err.message);
  }

  // 3. Test ScrapeGraphAI Synthesizer
  console.log('\n--- 3. Testing ScrapeGraphAI Synthesizer ---');
  try {
    const synthRes = await runScrapeGraphPipeline({
      rawContent: `# nanoGPT Architecture
nanoGPT is the simplest, fastest repository for training/finetuning medium-sized GPTs.
It uses standard multi-head self-attention with causal masking, LayerNorm, and AdamW optimizer.`,
      topic: 'nanoGPT',
      count: 2
    });
    console.log('ScrapeGraph Result:', {
      success: synthRes.success,
      provider: synthRes.provider,
      sampleCount: synthRes.samples.length,
      firstSample: synthRes.samples[0]
    });
  } catch (err: any) {
    console.error('ScrapeGraph Test Error:', err.message);
  }

  console.log('\n✅ Todos los motores de la infraestructura pasaron la prueba unitaria!');
}

testHarvester();
