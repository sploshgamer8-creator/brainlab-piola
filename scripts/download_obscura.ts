import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'bin');

const OBSCURA_VERSION = 'v0.2.2';

async function downloadFile(url: string, dest: string) {
  console.log(`Downloading Obscura from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fallo al descargar Obscura (${response.status}): ${response.statusText}`);
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log(`Guardado en ${dest} (${Math.round(buffer.byteLength / (1024 * 1024))} MB)`);
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const isWindows = os.platform() === 'win32';
  const isMac = os.platform() === 'darwin';
  const isLinux = os.platform() === 'linux';

  const obscuraExeName = isWindows ? 'obscura.exe' : 'obscura';
  const obscuraExePath = path.join(BIN_DIR, obscuraExeName);

  if (fs.existsSync(obscuraExePath)) {
    console.log(`✅ Obscura (${obscuraExeName}) ya está instalado en bin/.`);
    return;
  }

  let assetName = '';
  if (isWindows) {
    assetName = 'obscura-x86_64-windows.zip';
  } else if (isMac) {
    assetName = os.arch() === 'arm64' ? 'obscura-aarch64-macos.tar.gz' : 'obscura-x86_64-macos.tar.gz';
  } else if (isLinux) {
    assetName = os.arch() === 'arm64' ? 'obscura-aarch64-linux.tar.gz' : 'obscura-x86_64-linux.tar.gz';
  } else {
    throw new Error(`Plataforma ${os.platform()} no soportada automáticamente.`);
  }

  const downloadUrl = `https://github.com/h4ckf0r0day/obscura/releases/download/${OBSCURA_VERSION}/${assetName}`;
  const archivePath = path.join(BIN_DIR, assetName);

  try {
    await downloadFile(downloadUrl, archivePath);

    console.log(`Descomprimiendo ${assetName}...`);
    if (assetName.endsWith('.zip')) {
      execSync(`tar -xf "${archivePath}" -C "${BIN_DIR}"`);
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}"`);
    }

    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    if (fs.existsSync(obscuraExePath)) {
      if (!isWindows) {
        fs.chmodSync(obscuraExePath, '755');
      }
      console.log(`🎉 Obscura instalado exitosamente en: ${obscuraExePath}`);
    } else {
      console.warn(`⚠️ Obscura extraído pero no se encontró ${obscuraExeName} directamente en la raíz de bin/.`);
    }
  } catch (err: any) {
    console.error('Error al instalar Obscura:', err.message);
  }
}

main();
