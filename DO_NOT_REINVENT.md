# DECLARACIÓN DE LÍMITES ARQUITECTÓNICOS (DO_NOT_REINVENT.md)

Este documento enumera taxativamente qué componentes **ESTÁ ESTRICTAMENTE PROHIBIDO REINVENTAR** dentro de **Local Brain Lab**. Cualquier iteración futura debe consultar esta guía antes de escribir una sola línea de código de infraestructura genérica.

---

### 1. Inferencia y Cuantización de Modelos de 7B/8B+
* ❌ **NO IMPLEMENTAR**: Runtimes propios de inferencia para modelos de miles de millones de parámetros, kernels CUDA/Metal propios, ni algoritmos de cuantización (GPTQ, AWQ, Q4_0, Q4_K_M).
* ✅ **SOLUCIÓN ESTÁNDAR**: `llama.cpp` (vía binario nativo/servidor) o `WebLLM` (en el navegador con WebGPU).
* 🎯 **NUESTRA RESPONSABILIDAD**: Implementar únicamente un `InferenceAdapter` que envuelva estas herramientas y exponga una función común `generate(tokens): Promise<string>`.

---

### 2. Formato de Archivos de Modelos Grandes
* ❌ **NO IMPLEMENTAR**: Formatos binarios propietarios para empaquetar pesos de LLMs.
* ✅ **SOLUCIÓN ESTÁNDAR**: `GGUF` para ejecución en `llama.cpp` y `SafeTensors` (`safetensors`) para intercambio de tensores sin riesgo de inyección de código (a diferencia de pickles de PyTorch).

---

### 3. Motor de Almacenamiento Masivo en Navegador
* ❌ **NO IMPLEMENTAR**: Sistemas de base de datos propietarios basados en `localStorage` o fragmentación manual de cadenas JSON.
* ✅ **SOLUCIÓN ESTÁNDAR**: **OPFS** (Origin Private File System) para blobs de pesos y checkpoints binarios; **IndexedDB** para catálogos de datasets y registros de experiencia.

---

### 4. Tokenizadores BPE Universales
* ❌ **NO IMPLEMENTAR**: Algoritmos complejos de Byte-Pair Encoding (BPE) o SentencePiece desde cero cuando se trabaje con modelos de frontera o de terceros.
* ✅ **SOLUCIÓN ESTÁNDAR**: `@huggingface/transformers` / `tokenizers` para interactuar con vocabularios tipo LLaMA/Qwen/Mistral. Conservar el tokenizador local de nanoGPT solo para el estudiante pequeño experimental.

---

### 5. Cola de Tareas y Orquestación 24/7 en Servidor
* ❌ **NO IMPLEMENTAR**: Planificadores de tareas propios con bucles síncronos `while(true)` o temporizadores frágiles en el servidor Node.js.
* ✅ **SOLUCIÓN ESTÁNDAR**: `BullMQ` con Redis para colas de destilación persistentes con reintentos automáticos, backoff exponencial y control estricto de concurrencia y límites de API.

---

### 6. ¿Qué SÍ es propiedad y foco exclusivo de Local Brain Lab?
1. El **nanoGPT Karpathy** escalable (218K → 3M → 15M) con retropropagación analítica en TypeScript/WASM.
2. El **Replay Buffer con Muestreo Priorizado (PER)** y deduplicación por hashes.
3. El **Dataset Ancla (Anchor Dataset)** para evaluar y prevenir el *catastrophic forgetting*.
4. El **Distillation Engine** para transferencia continua de conocimiento entre Maestro (100M+ o 7B) y Estudiante local.
5. El **Model Registry** unificado para gestionar versiones, checkpoints inmutables y linajes.
