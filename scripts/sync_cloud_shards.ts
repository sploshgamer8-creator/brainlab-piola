/**
 * Continuous Cloud-to-Binary Shard Synchronizer CLI
 * Descarga los pares cosechados de la nube (PostgreSQL en Railway),
 * los tokeniza con NanoTokenizer y los compila en shards binarios uint16
 * en datasets/cloud_harvested/ sin desperdicio de relleno (0% padding waste).
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { syncCloudToBinaryShards } from '../src/server/harvester/shard_synchronizer';

dotenv.config();

export { syncCloudToBinaryShards };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('🚀 Iniciando compilador y sincronizador Cloud-to-Binary Shards...');
  syncCloudToBinaryShards().then(res => {
    if (res.success) {
      console.log(`\n🎉 Sincronización exitosa: ${res.totalTokens.toLocaleString()} tokens compilados en ${res.shardsCount} shards.`);
      process.exit(0);
    } else {
      console.error(`\n❌ Error al sincronizar: ${res.error}`);
      process.exit(1);
    }
  });
}
