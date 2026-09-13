/**
 * LOCAL BRAIN LAB — STORAGE MANAGER (INDEXEDDB + OPFS ABSTRACTION)
 * 
 * Reemplaza la limitación de 5MB de localStorage con persistencia robusta
 * usando IndexedDB para datasets y OPFS (Origin Private File System)
 * para pesos y checkpoints de tensores de gran tamaño.
 */

export class StorageManager {
  private static dbName = 'local_brain_lab_db';
  private static dbVersion = 2;
  private static dbInstance: IDBDatabase | null = null;

  /**
   * Indica si el navegador soporta la API nativa de OPFS (Origin Private File System)
   */
  public static isOPFSSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.storage && typeof (navigator.storage as any).getDirectory === 'function';
  }

  /**
   * Inicializa la conexión a IndexedDB y solicita persistencia al navegador si está disponible
   */
  public static async initialize(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB no está disponible en este entorno.');
      return;
    }

    // Solicitar persistencia para evitar que el navegador purgue datos
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.log(`Almacenamiento persistente concedido: ${isPersisted}`);
      } catch {}
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e: any) => {
        const db = e.target.result as IDBDatabase;

        if (!db.objectStoreNames.contains('datasets')) {
          db.createObjectStore('datasets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('checkpoints')) {
          db.createObjectStore('checkpoints', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('replay_experiences')) {
          db.createObjectStore('replay_experiences', { keyPath: 'hash' });
        }
        if (!db.objectStoreNames.contains('binary_blobs')) {
          db.createObjectStore('binary_blobs', { keyPath: 'name' });
        }
      };

      request.onsuccess = () => {
        this.dbInstance = request.result;
        resolve();
      };

      request.onerror = () => {
        console.error('Error abriendo IndexedDB:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Guarda un lote de registros en un almacén de IndexedDB
   */
  public static async putItems<T>(storeName: string, items: T[]): Promise<void> {
    if (!this.dbInstance) await this.initialize();
    if (!this.dbInstance) return;

    return new Promise((resolve, reject) => {
      const tx = this.dbInstance!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      items.forEach(item => store.put(item));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Recupera todos los elementos de un almacén
   */
  public static async getAllItems<T>(storeName: string): Promise<T[]> {
    if (!this.dbInstance) await this.initialize();
    if (!this.dbInstance) return [];

    return new Promise((resolve, reject) => {
      const tx = this.dbInstance!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Estima la cuota y uso de almacenamiento en disco disponible en el dispositivo
   */
  public static async getStorageEstimate(): Promise<{ usageMB: number; quotaMB: number; percentage: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usageMB = Math.round((est.usage || 0) / (1024 * 1024));
        const quotaMB = Math.round((est.quota || 0) / (1024 * 1024));
        const percentage = quotaMB > 0 ? (usageMB / quotaMB) * 100 : 0;
        return { usageMB, quotaMB, percentage };
      } catch {}
    }
    return { usageMB: 0, quotaMB: 1024, percentage: 0 };
  }

  /**
   * Guarda un archivo binario (SafeTensors, pesos o checkpoints de gran tamaño)
   * utilizando OPFS nativo o fallback a IndexedDB Blob
   */
  public static async writeBinaryFile(fileName: string, data: ArrayBuffer): Promise<boolean> {
    // 1. Intentar OPFS nativo
    if (this.isOPFSSupported()) {
      try {
        const root = await (navigator.storage as any).getDirectory();
        const fileHandle = await root.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return true;
      } catch (err) {
        console.warn('Fallo guardando en OPFS, recurriendo a IndexedDB Blob:', err);
      }
    }

    // 2. Fallback a IndexedDB ObjectStore 'binary_blobs'
    try {
      if (!this.dbInstance) await this.initialize();
      if (!this.dbInstance) return false;

      return new Promise((resolve, reject) => {
        const tx = this.dbInstance!.transaction('binary_blobs', 'readwrite');
        const store = tx.objectStore('binary_blobs');
        const blob = new Blob([data], { type: 'application/octet-stream' });
        store.put({ name: fileName, data: blob, updatedAt: Date.now() });

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return false;
    }
  }

  /**
   * Lee un archivo binario desde OPFS o IndexedDB Blob
   */
  public static async readBinaryFile(fileName: string): Promise<ArrayBuffer | null> {
    // 1. Intentar OPFS nativo
    if (this.isOPFSSupported()) {
      try {
        const root = await (navigator.storage as any).getDirectory();
        const fileHandle = await root.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return await file.arrayBuffer();
      } catch {}
    }

    // 2. Fallback a IndexedDB
    try {
      if (!this.dbInstance) await this.initialize();
      if (!this.dbInstance) return null;

      return new Promise((resolve) => {
        const tx = this.dbInstance!.transaction('binary_blobs', 'readonly');
        const store = tx.objectStore('binary_blobs');
        const req = store.get(fileName);

        req.onsuccess = async () => {
          const record = req.result;
          if (record && record.data instanceof Blob) {
            const buf = await record.data.arrayBuffer();
            resolve(buf);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Elimina un archivo binario almacenado
   */
  public static async deleteBinaryFile(fileName: string): Promise<boolean> {
    if (this.isOPFSSupported()) {
      try {
        const root = await (navigator.storage as any).getDirectory();
        await root.removeEntry(fileName);
      } catch {}
    }

    try {
      if (!this.dbInstance) await this.initialize();
      if (!this.dbInstance) return false;

      return new Promise((resolve) => {
        const tx = this.dbInstance!.transaction('binary_blobs', 'readwrite');
        const store = tx.objectStore('binary_blobs');
        store.delete(fileName);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
}
