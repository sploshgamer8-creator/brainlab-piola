import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function launchSupervisedProcess(name, scriptPath, args = []) {
  let child = null;
  let isShuttingDown = false;

  const start = () => {
    if (isShuttingDown) return;
    console.log(`[Supervisor] Iniciando ${name} (${scriptPath})...`);
    child = spawn('node', [scriptPath, ...args], { stdio: 'inherit', env: process.env });

    child.on('exit', (code, signal) => {
      if (isShuttingDown) return;
      console.warn(`⚠️ [Supervisor] ${name} terminó con código ${code} / señal ${signal}. Reiniciando en 2 segundos...`);
      setTimeout(start, 2000);
    });

    child.on('error', (err) => {
      console.error(`❌ [Supervisor] Error en ${name}:`, err.message);
    });
  };

  start();

  return {
    kill: (signal = 'SIGINT') => {
      isShuttingDown = true;
      if (child) child.kill(signal);
    }
  };
}

const webApp = launchSupervisedProcess('WebExpressServer', join(__dirname, '../dist-electron/src/server/express_app.js'));
const harvesterWorker = launchSupervisedProcess('TeacherPoolWorker', join(__dirname, '../dist-electron/scripts/teacher_pool_worker.js'));

process.on('SIGINT', () => {
  console.log('\n[Supervisor] Recibida señal de terminación (SIGINT). Cerrando procesos...');
  webApp.kill('SIGINT');
  harvesterWorker.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Supervisor] Recibida señal de terminación (SIGTERM). Cerrando procesos...');
  webApp.kill('SIGTERM');
  harvesterWorker.kill('SIGTERM');
  process.exit(0);
});
