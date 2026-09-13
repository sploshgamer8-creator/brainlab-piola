import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const web = spawn('node', [join(__dirname, '../dist-electron/src/server/express_app.js')], { stdio: 'inherit' });
const worker = spawn('node', [join(__dirname, '../dist-electron/scripts/teacher_pool_worker.js')], { stdio: 'inherit', env: process.env });

process.on('SIGINT', () => {
    web.kill('SIGINT');
    worker.kill('SIGINT');
    process.exit(0);
});
