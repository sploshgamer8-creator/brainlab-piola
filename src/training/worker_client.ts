/**
 * LOCAL BRAIN LAB — WORKER TRAINER CLIENT
 * 
 * Abstracción de cliente para despachar lotes de entrenamiento al Web Worker
 * o ejecutar en fallback local seguro si el entorno restringe workers.
 */

import { TrainingBatch, TrainingMetrics } from '../core/contracts';
import { GPTConfig } from '../core/types';

export class WorkerTrainerClient {
  private worker: Worker | null = null;
  private messageCounter = 0;
  private pendingResolvers: Map<number, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private isReady = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        // En Vite podemos instanciar Workers de TypeScript con import.meta.url o worker constructor
        this.worker = new Worker(new URL('../workers/training_worker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (e: MessageEvent) => {
          const { id, type, metrics, error } = e.data;
          const resolver = this.pendingResolvers.get(id);
          if (resolver) {
            this.pendingResolvers.delete(id);
            if (type === 'ERROR') {
              resolver.reject(new Error(error));
            } else if (type === 'BATCH_COMPLETE') {
              resolver.resolve(metrics);
            } else {
              resolver.resolve(e.data);
            }
          }
        };

        this.worker.onerror = (err) => {
          console.warn('Worker de entrenamiento con error, usando fallback:', err);
          this.worker = null;
        };

        this.isReady = true;
      }
    } catch (e) {
      console.warn('No se pudo inicializar Web Worker, usando hilo síncrono:', e);
      this.worker = null;
    }
  }

  public async initializeModel(config?: GPTConfig): Promise<void> {
    if (!this.worker) return;
    return this.postRequest('INIT', { config });
  }

  public async trainBatch(batch: TrainingBatch, lr = 1e-3): Promise<TrainingMetrics | null> {
    if (!this.worker) return null;
    return this.postRequest('TRAIN_BATCH', { batch, lr });
  }

  private postRequest(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Worker no disponible'));
      }
      const id = ++this.messageCounter;
      this.pendingResolvers.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public isAvailable(): boolean {
    return !!this.worker;
  }
}
