/**
 * LOCAL BRAIN LAB — BACKEND SELECTOR
 * 
 * Orquesta la selección dinámica de backends de inferencia y entrenamiento
 * según el tamaño del modelo, los límites de hardware y la presencia de WebGPU/WASM.
 */

import { InferenceBackend } from '../core/contracts';
import { NanoGPTAdapter } from '../core/nanogpt_adapter';
import { LlamaCppBackend } from './LlamaCppBackend';
import { WebLLMBackend } from './WebLLMBackend';

export interface SystemCapabilities {
  hasWebGPU: boolean;
  hasWASM: boolean;
  hardwareConcurrency: number;
  deviceMemoryGB?: number;
  storageEstimateMB: number;
}

export class BackendSelector {
  private static backends: Map<string, InferenceBackend> = new Map();
  private static activeBackendId = 'nanogpt-218k-default';

  public static async initializeAll(): Promise<SystemCapabilities> {
    // 1. Instanciar backends
    const nanoBackend = new NanoGPTAdapter();
    const llamaBackend = new LlamaCppBackend();
    const webllmBackend = new WebLLMBackend();

    this.backends.set('nanogpt-218k-default', nanoBackend);
    this.backends.set('llamacpp-gguf-runner', llamaBackend);
    this.backends.set('webllm-webgpu-adapter', webllmBackend);

    await Promise.all([
      nanoBackend.initialize(),
      llamaBackend.initialize(),
      webllmBackend.initialize(),
    ]);

    // 2. Detección de capacidades del sistema
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const hasWASM = typeof WebAssembly !== 'undefined';
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const deviceMemoryGB = (navigator as any).deviceMemory || 4;

    let storageEstimateMB = 1000;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        storageEstimateMB = Math.round((est.quota || 0) / (1024 * 1024));
      } catch {}
    }

    return {
      hasWebGPU,
      hasWASM,
      hardwareConcurrency,
      deviceMemoryGB,
      storageEstimateMB,
    };
  }

  public static getActiveBackend(): InferenceBackend {
    return this.backends.get(this.activeBackendId) || this.backends.get('nanogpt-218k-default')!;
  }

  public static selectBackend(backendId: string): boolean {
    if (this.backends.has(backendId)) {
      this.activeBackendId = backendId;
      return true;
    }
    return false;
  }

  public static listAvailableBackends(): { id: string; name: string; role: string }[] {
    return Array.from(this.backends.values()).map(b => ({
      id: b.id,
      name: b.name,
      role: b.role,
    }));
  }
}
