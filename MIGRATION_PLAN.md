# PLAN DE MIGRACIÓN POR FASES (MIGRATION_PLAN.md)

Este plan desglosa la transición del estado actual de **Local Brain Lab** hacia la arquitectura modular objetivo, asegurando que el modelo de 218K permanezca operativo en cada paso.

```text
CURRENT WORKING STATE
          │
          ▼
FASE 1: CONTRATOS & ABSTRACCIONES (BrainModel, TrainingBackend, InferenceBackend)
          │
          ▼
FASE 2: REPLAY BUFFER (Prioritized Experience Replay, Deduplicación, Anclajes Anti-Olvido)
          │
          ▼
FASE 3: ALMACENAMIENTO MASIVO (IndexedDB / OPFS Storage Manager)
          │
          ▼
FASE 4: AISLAMIENTO EN WEB WORKERS (training.worker.ts)
          │
          ▼
FASE 5: ADAPTERS DE MODELOS GRANDES (llama.cpp GGUF / WebLLM)
```

---

## Detalle de Fases

### Fase 1: Abstracción de Contratos (Inmediato)
* **Objetivo:** Definir interfaces formales para desacoplar el motor sin modificar su comportamiento matemático.
* **Archivos a crear/modificar:**
  - `src/core/contracts.ts`: Interfaces `BrainModel`, `TrainingBackend`, `InferenceBackend`, `ModelConfig`, `ModelRegistryEntry`.
  - `src/core/nanogpt_adapter.ts`: Envoltura que adapta la clase `NanoGPTModel` existente a `BrainModel` y `InferenceBackend`.
* **Prueba de éxito:** El modelo actual de 218K responde exactamente con los mismos logits y tokens.

### Fase 2: Experience Replay & Buffer de Destilación (Inmediato)
* **Objetivo:** Evitar el sobreajuste y olvido catastrófico en el farmeador de 100M.
* **Archivos a crear:**
  - `src/training/replay_buffer.ts`: Buffer con muestreo proporcional a pérdida (`priority = loss + novelty`), deduplicación por hash SHA-256/FNV-1a y protección de datos ancla (*Anchor Data*).
* **Prueba de éxito:** El farmeador continuo almacena pares en el buffer y entrena lotes balanceados (ej. 30% nuevo, 50% replay, 20% ancla).

### Fase 3: Storage Manager para Persistencia Masiva
* **Objetivo:** Eliminar el cuello de botella de los 5MB de `localStorage`.
* **Archivos a crear:**
  - `src/storage/storage_manager.ts`: Capa que utiliza IndexedDB para datasets y OPFS para checkpoints grandes de tensores binarios.

### Fase 4: Desacoplamiento a Web Worker
* **Objetivo:** Ejecutar backpropagation en un hilo secundario para mantener 60 FPS en la interfaz de usuario.
* **Archivos a crear:**
  - `src/workers/training.worker.ts`: Worker que recibe batches y devuelve métricas de paso y gradientes actualizados.

### Fase 5: Model Registry y Adapters de Modelos Externos (7B)
* **Objetivo:** Permitir el registro de modelos GGUF vía `llama.cpp` o WebLLM como Maestros locales.
