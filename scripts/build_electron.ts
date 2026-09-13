import { build } from 'esbuild';

async function main() {
  await build({
    entryPoints: ['electron/main.ts', 'src/server/express_app.ts', 'scripts/teacher_pool_worker.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    packages: 'external',
    outdir: 'dist-electron',
    format: 'esm', // Since package.json is type: module
  });
  console.log('Electron main & express server built successfully!');
}

main();
