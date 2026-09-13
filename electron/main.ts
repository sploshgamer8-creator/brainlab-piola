import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

// Since we are running in ESM context, we can import the typescript file using tsx,
// but in production we will compile this to JS. For now, assuming it will be bundled or executed via tsx.
// A better approach is to start express_app in a separate process or compile it properly.
// For simplicity, we assume we compile it or use tsx.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV !== 'production';

// When running from source: __dirname is /dist-electron/electron
// When packaged: __dirname is /resources/app.asar/dist-electron/electron
const PROJECT_ROOT = app.isPackaged 
  ? path.resolve(__dirname, '..', '..', '..') // Up to resources folder where extraResources are placed
  : path.resolve(__dirname, '..', '..'); // Up to BrainLabPiola


let mainWindow: BrowserWindow | null = null;
let llamaProcess: ChildProcess | null = null;
let expressProcess: ChildProcess | null = null;

const EXPRESS_PORT = 34567;

function startExpress() {
  console.log('[Electron] Starting Express Backend...');
  
  const env = { ...process.env, PORT: EXPRESS_PORT.toString() };

  if (app.isPackaged) {
    const expressPath = path.join(__dirname, '..', 'src', 'server', 'express_app.js');
    expressProcess = spawn(process.execPath, [expressPath], {
      stdio: 'inherit',
      env
    });
  } else {
    const expressPath = path.join(PROJECT_ROOT, 'src', 'server', 'express_app.ts');
    expressProcess = spawn('npx', ['tsx', expressPath], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
      env
    });
  }
}

function startLlamaServer() {
  const llamaExe = path.join(PROJECT_ROOT, 'bin', 'llama-server.exe');
  const modelPath = path.join(PROJECT_ROOT, 'models', 'qwen2.5-0.5b.gguf');
  
  if (fs.existsSync(llamaExe) && fs.existsSync(modelPath)) {
    console.log('[Electron] Starting llama-server with Qwen2.5 0.5B...');
    llamaProcess = spawn(llamaExe, [
      '-m', modelPath,
      '--port', '8080',
      '--host', '127.0.0.1',
      '-c', '2048' // small context to save memory
    ], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe'
    });
    
    llamaProcess.stdout?.on('data', (data) => console.log(`[llama-server] ${data}`));
    llamaProcess.stderr?.on('data', (data) => console.log(`[llama-server] ${data}`));
  } else {
    console.log('[Electron] llama-server.exe or model not found, skipping autostart.');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "BrainLab Piola",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Intercept /api requests and redirect them to the Express backend running on 34567
  const filter = { urls: ['http://localhost:3456/api/*', 'file:///*/api/*'] };
  
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    // Re-route /api/ to our local Express server
    const url = new URL(details.url);
    const newUrl = `http://127.0.0.1:${EXPRESS_PORT}${url.pathname}${url.search}`;
    console.log(`[Proxy] Redirecting ${details.url} -> ${newUrl}`);
    callback({ redirectURL: newUrl });
  });

  if (isDev) {
    // Wait slightly to let Vite start
    setTimeout(() => {
      mainWindow?.loadURL('http://localhost:3456');
      mainWindow?.webContents.openDevTools();
    }, 2000);
  } else {
    mainWindow.loadFile(path.join(PROJECT_ROOT, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startExpress();
  startLlamaServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup child processes on exit
app.on('quit', () => {
  if (expressProcess) {
    expressProcess.kill();
  }
  if (llamaProcess) {
    llamaProcess.kill();
  }
});
