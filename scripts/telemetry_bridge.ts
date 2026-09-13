import fs from 'fs';
import path from 'path';

const CLOUD_URL = 'https://brainlab-production.up.railway.app/api/cloud/telemetry/heartbeat';
const LOG_PATH = path.resolve(process.cwd(), 'reports/autonomous_evolution.log');

const REGEX = /\[Ciclo #(\d+)\] Pasos Totales: (\d+) \| Capas: (\w+) \| Loss: ([\d.]+) .* \| Tokens: ([\d.,]+) \| Buffer: (\d+)/;

let lastReportedStep = -1;

async function syncTelemetry() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;

    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    let cycle = 0;
    let step = 0;
    let layers = '8L';
    let loss = 0;
    let tokens = 0;
    let buffer = 4590;

    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(REGEX);
      if (match) {
        cycle = parseInt(match[1], 10);
        step = parseInt(match[2], 10);
        layers = match[3];
        loss = parseFloat(match[4]);
        tokens = parseInt(match[5].replace(/\./g, '').replace(/,/g, ''), 10);
        buffer = parseInt(match[6], 10);
        break;
      }
    }

    if (step === 0) return;

    const payload = {
      active: true,
      cycle,
      step,
      loss,
      layers,
      tokens,
      buffer,
      lastUpdated: new Date().toISOString(),
      recentLogs: lines.slice(-8)
    };

    const res = await fetch(CLOUD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok && step !== lastReportedStep) {
      lastReportedStep = step;
      console.log(`[TelemetryBridge] 💓 Sincronizado con Railway -> Ciclo #${cycle} | Paso ${step} | Tokens ${tokens.toLocaleString()} | Loss ${loss.toFixed(4)}`);
    }
  } catch (err) {
    // Silent retry
  }
}

console.log('[TelemetryBridge] 🚀 Puente de telemetría local -> Railway iniciado.');
syncTelemetry();
setInterval(syncTelemetry, 6000);
