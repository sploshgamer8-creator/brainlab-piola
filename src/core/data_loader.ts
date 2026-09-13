import fs from 'fs';
import path from 'path';

/**
 * 🚀 BrainLab: Async DataLoader (Doble Búfer / Streaming)
 * 
 * Implementa la Fase 3 del Metabolismo v2. 
 * Mantiene un "búfer adelantado" cargado en memoria de forma asíncrona para que 
 * la GPU (o en nuestro caso, el motor matemático TS) NUNCA tenga que esperar 
 * operaciones de I/O bloqueantes de disco.
 */

export class AsyncDataLoader {
  private fileHandles: fs.promises.FileHandle[] = [];
  private currentHandleIdx: number = 0;
  private currentOffset: number = 0;
  private blockSize: number;
  private isUint32: boolean = false; // Por si escalamos a vocabularios gigantes

  // Doble Búfer
  private bufferA: number[] | null = null;
  private bufferB: number[] | null = null;
  private isPrefetching: boolean = false;
  private activeBufferIsA: boolean = true;

  constructor(private datasetDir: string, blockSize: number) {
    this.blockSize = blockSize;
  }

  public async initialize(): Promise<void> {
    const manifestPath = path.join(this.datasetDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest no encontrado en ${this.datasetDir}`);
    }

    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
    this.isUint32 = manifest.tokenByteWidth === 4;

    for (const shard of manifest.shards) {
      const shardPath = path.join(this.datasetDir, shard.file);
      const handle = await fs.promises.open(shardPath, 'r');
      this.fileHandles.push(handle);
    }

    if (this.fileHandles.length === 0) {
      throw new Error('No hay shards en el dataset.');
    }

    // Llenar el Buffer A inicialmente
    this.bufferA = await this.readNextBlockFromDisk();
    
    // Iniciar el prefetch asíncrono para el Buffer B
    this.triggerPrefetch();
  }

  /**
   * Pide el siguiente bloque. Esto SIEMPRE debe ser instantáneo (desde RAM).
   */
  public async nextBlock(): Promise<{ x: number[], y: number[] } | null> {
    const currentData = this.activeBufferIsA ? this.bufferA : this.bufferB;
    
    if (!currentData) return null; // Fin del dataset

    // Preparar tensores
    const x = currentData.slice(0, this.blockSize);
    const y = currentData.slice(1, this.blockSize + 1);

    // Conmutar búfer (Swap)
    this.activeBufferIsA = !this.activeBufferIsA;

    // Disparar la recarga del búfer que acaba de quedar vacío, de forma asíncrona (no bloqueante)
    this.triggerPrefetch();

    return { x, y };
  }

  /**
   * Dispara una lectura de disco en el background
   */
  private triggerPrefetch() {
    if (this.isPrefetching) return;
    this.isPrefetching = true;

    // Operación I/O asíncrona "fuera" del hilo principal de cómputo
    this.readNextBlockFromDisk().then(data => {
      if (this.activeBufferIsA) {
        this.bufferB = data; // Si A está activo, llenamos B
      } else {
        this.bufferA = data; // Si B está activo, llenamos A
      }
      this.isPrefetching = false;
    }).catch(err => {
      console.error('Error en prefetch:', err);
      this.isPrefetching = false;
    });
  }

  /**
   * Realiza la lectura física de NVMe/SSD usando Node.js asíncrono
   */
  private async readNextBlockFromDisk(): Promise<number[] | null> {
    if (this.currentHandleIdx >= this.fileHandles.length) {
      return null; // Fin total
    }

    // Necesitamos blockSize + 1 (para x e y predictivo)
    const tokensNeeded = this.blockSize + 1;
    const bytesPerToken = this.isUint32 ? 4 : 2;
    const bytesNeeded = tokensNeeded * bytesPerToken;
    const buffer = Buffer.alloc(bytesNeeded);

    const handle = this.fileHandles[this.currentHandleIdx];
    const { bytesRead } = await handle.read(buffer, 0, bytesNeeded, this.currentOffset);

    if (bytesRead < bytesNeeded) {
      // Shard agotado, saltar al siguiente
      this.currentHandleIdx++;
      this.currentOffset = 0;
      return this.readNextBlockFromDisk(); // Llamada recursiva suave
    }

    this.currentOffset += bytesNeeded;

    // Decodificar el buffer binario
    const tokens: number[] = [];
    for (let i = 0; i < tokensNeeded; i++) {
      if (this.isUint32) {
        tokens.push(buffer.readUInt32LE(i * 4));
      } else {
        tokens.push(buffer.readUInt16LE(i * 2));
      }
    }

    return tokens;
  }

  public async close(): Promise<void> {
    for (const handle of this.fileHandles) {
      await handle.close();
    }
    this.fileHandles = [];
  }
}
