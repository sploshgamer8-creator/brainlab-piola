import express from 'express';
import path from 'path';
import { handleApiRoutes } from './api_middleware.js';
import { initPostgres } from './db.js';

export async function startExpressServer(port?: number): Promise<void> {
  // Inicializar y migrar PostgreSQL en Railway si está disponible
  await initPostgres();

  return new Promise((resolve) => {
    const app = express();
    
    // Mount the Vite api_middleware as a regular Express middleware
    app.use((req, res, next) => {
      handleApiRoutes(req, res, next);
    });

    // Serve static files from dist/ in production (for Railway/Docker)
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));

    // Fallback to index.html for SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    const listenPort = port || parseInt(process.env.PORT || '3000', 10);
    // Bind to 0.0.0.0 for Docker/Railway
    app.listen(listenPort, '0.0.0.0', () => {
      console.log(`[Express Backend] API server listening at http://0.0.0.0:${listenPort}`);
      resolve();
    });
  });
}

// Allow running standalone for debugging or Railway
if (process.argv[1] && process.argv[1].endsWith('express_app.js') || process.argv[1].endsWith('express_app.ts')) {
  startExpressServer();
}
