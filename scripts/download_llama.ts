import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'bin');

// Use a stable CPU build of llama.cpp for Windows
const LLAMA_ZIP_URL = 'https://github.com/ggerganov/llama.cpp/releases/download/b4382/llama-b4382-bin-win-avx2-x64.zip';
const ZIP_PATH = path.join(BIN_DIR, 'llama.zip');

async function downloadFile(url: string, dest: string) {
  console.log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  console.log(`Downloaded to ${dest}`);
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const llamaExe = path.join(BIN_DIR, 'llama-server.exe');
  if (fs.existsSync(llamaExe)) {
    console.log('llama-server.exe already exists. Skipping download.');
    return;
  }

  try {
    await downloadFile(LLAMA_ZIP_URL, ZIP_PATH);
    
    console.log('Extracting zip...');
    execSync(`tar -xf "${ZIP_PATH}" -C "${BIN_DIR}"`);
    fs.unlinkSync(ZIP_PATH);
    
    if (fs.existsSync(llamaExe)) {
      console.log('Successfully installed llama-server.exe');
    } else {
      console.error('Extraction failed to produce llama-server.exe');
    }

    // Auto-download a tiny model (Qwen 2.5 0.5B) for out-of-the-box experience
    const MODELS_DIR = path.join(PROJECT_ROOT, 'models');
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
    }
    const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
    const MODEL_PATH = path.join(MODELS_DIR, 'qwen2.5-0.5b.gguf');
    
    if (!fs.existsSync(MODEL_PATH)) {
      console.log('Downloading tiny model (Qwen2.5 0.5B)... this may take a few minutes.');
      await downloadFile(MODEL_URL, MODEL_PATH);
      console.log('Tiny model downloaded successfully!');
    } else {
      console.log('Tiny model already exists. Skipping.');
    }
  } catch (err) {
    console.error('Error downloading/extracting llama.cpp:', err);
  }
}

main();
