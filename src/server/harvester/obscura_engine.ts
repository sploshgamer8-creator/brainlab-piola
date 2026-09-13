/**
 * Obscura Engine
 * Integración con Obscura: el navegador headless ultraligero escrito en Rust (~30MB RAM, V8 JS engine).
 * Soporta ejecución CLI directa (--eval, --dump, --stealth) y fallback inteligente.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fetchWithScraplingStealth } from './scrapling_engine';

const execFileAsync = promisify(execFile);

export interface ObscuraOptions {
  url: string;
  evalScript?: string;
  dump?: 'text' | 'html' | 'links' | 'assets';
  stealth?: boolean;
  timeoutSecs?: number;
  allowPrivateNetwork?: boolean;
}

export interface ObscuraResult {
  success: boolean;
  url: string;
  engine: 'obscura_rust_native' | 'obscura_fallback_stealth';
  dumpMode?: string;
  output: string;
  executionTimeMs: number;
  memoryEstimateMb: number;
  error?: string;
}

/**
 * Encuentra la ruta al ejecutable de Obscura
 */
export function getObscuraBinaryPath(): string | null {
  const isWindows = os.platform() === 'win32';
  const binaryName = isWindows ? 'obscura.exe' : 'obscura';

  // 1. Verificar en bin/ local del proyecto
  const projectRoot = process.cwd();
  const localBin = path.join(projectRoot, 'bin', binaryName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 2. Verificar en PATH global
  try {
    const whichCmd = isWindows ? 'where' : 'which';
    const { execSync } = require('child_process');
    const out = execSync(`${whichCmd} ${binaryName}`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (out) return out.split('\n')[0].trim();
  } catch {}

  return null;
}

/**
 * Consulta el estado de instalación de Obscura
 */
export async function getObscuraStatus(): Promise<{
  installed: boolean;
  binaryPath: string | null;
  cdpServerAvailable: boolean;
  version?: string;
}> {
  const binPath = getObscuraBinaryPath();
  let cdpAvailable = false;

  // Probar si hay un servidor CDP escuchando en 9222
  try {
    const cdpRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
    if (cdpRes.ok) cdpAvailable = true;
  } catch {}

  let version: string | undefined;
  if (binPath) {
    try {
      const { execSync } = require('child_process');
      const verOut = execSync(`"${binPath}" --version`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
      version = verOut;
    } catch {}
  }

  return {
    installed: !!binPath,
    binaryPath: binPath,
    cdpServerAvailable: cdpAvailable,
    version
  };
}

/**
 * Ejecuta una extracción o evaluación con Obscura
 */
export async function runWithObscura(options: ObscuraOptions): Promise<ObscuraResult> {
  const startTime = Date.now();
  const {
    url,
    evalScript,
    dump = 'text',
    stealth = true,
    timeoutSecs = 15,
    allowPrivateNetwork = false
  } = options;

  const binPath = getObscuraBinaryPath();

  // 1. Si el binario de Obscura está disponible, ejecutar CLI nativo
  if (binPath) {
    try {
      const args = ['fetch', url];

      if (dump) {
        args.push('--dump', dump);
      }

      if (evalScript) {
        args.push('--eval', evalScript);
      }

      if (stealth) {
        args.push('--stealth');
      }

      if (timeoutSecs) {
        args.push('--timeout', String(timeoutSecs));
      }

      if (allowPrivateNetwork) {
        args.push('--allow-private-network');
      }

      const { stdout, stderr } = await execFileAsync(binPath, args, {
        timeout: (timeoutSecs + 5) * 1000,
        maxBuffer: 10 * 1024 * 1024 // 10 MB
      });

      const execTime = Date.now() - startTime;

      return {
        success: true,
        url,
        engine: 'obscura_rust_native',
        dumpMode: dump,
        output: stdout.trim() || stderr.trim(),
        executionTimeMs: execTime,
        memoryEstimateMb: 30 // Consumo nominal del runtime Rust de Obscura
      };

    } catch (err: any) {
      console.warn('Obscura CLI arrojó error, aplicando fallback:', err.message);
    }
  }

  // 2. Fallback inteligente al motor stealth de Scrapling
  const fallbackRes = await fetchWithScraplingStealth({
    url,
    timeoutMs: timeoutSecs * 1000
  });

  const execTime = Date.now() - startTime;

  return {
    success: fallbackRes.success,
    url,
    engine: 'obscura_fallback_stealth',
    dumpMode: dump,
    output: fallbackRes.content || fallbackRes.error || 'Sin contenido',
    executionTimeMs: execTime,
    memoryEstimateMb: 15,
    error: fallbackRes.error
  };
}
