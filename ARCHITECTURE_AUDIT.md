# AUDITORÍA DE ARQUITECTURA — LOCAL BRAIN LAB

**Fecha de Auditoría:** 2026-09-11  
**Estado General:** Núcleo nanoGPT 218K operativo en Float32, Fase 0 de verificación superada, interfaces desacoplables.

---

## 1. Mapeo del Repositorio Actual

| Componente Actual | Archivo Fuente | Estado / Implementación | Rol Actual | Destino Arquitectónico |
| :--- | :--- | :--- | :--- | :--- |
| **Motor Neuronal nanoGPT** | `src/core/nanogpt_engine.ts` | TypeScript puro, `Float32Array`, forward causal, backward analítico, AdamW. | Núcleo de cálculo local en main thread. | **IMPLEMENTAR/EVOLUCIONAR**: Se mantiene como *Reference Backend*, aislando la ejecución tras la interfaz `TrainingBackend`. |
| **Configuración y Tipos** | `src/core/types.ts` | Tipos GPTConfig fijos (64 embd, 4 layers, etc.). | Tipado estático inicial. | **EVOLUCIONAR**: Parametrización dinámica (218K → 3M → 15M, normType, activation, dtype). |
| **Tokenizador** | `src/core/tokenizer.ts` | Carácter/subpalabra simplificado local. | Tokenizador propio del estudiante. | **ADAPTAR**: Envolver bajo `TokenizerAdapter` permitiendo BPE / HuggingFace tokenizers futuros. |
| **Bucle de Entrenamiento** | `src/training/trainer.ts` | Bucle síncrono con `requestAnimationFrame`. | Entrenador en UI thread. | **EVOLUCIONAR**: Integrar `ReplayBuffer` (PER) y desacoplar a `training.worker.ts`. |
| **Auditoría Numérica** | `src/core/verification.ts` | Suite de 6 pruebas de paridad matemática y causalidad. | Control de calidad. | **MANTENER**: Test de regresión continuo obligatorio. |
| **Gestor de Checkpoints** | `src/core/checkpoint_manager.ts` | Serialización JSON a `localStorage`. | Persistencia de pesos. | **MIGRAR**: Evolucionar hacia `StorageManager` (IndexedDB / OPFS) para evitar el límite de 5MB. |
| **Gateway Maestro** | `src/server/api_middleware.ts` | Endpoint `/api/gateway/chat` y `/api/distill/batch`. | Enrutador a Gemini/Claude. | **ADAPTAR**: `TeacherProvider` desacoplado, compatible con maestros locales 7B futuros. |
| **Farmeador Continuo** | `src/components/tabs/ChatTab.tsx` | Cosecha en tiempo real e inyección directa. | Farmeador interactivo. | **EVOLUCIONAR**: Conectar con `ReplayBuffer` con filtro de calidad y deduplicación por hash. |

---

## 2. Matriz de Decisión Estratégica (Regla de No Reinventar la Rueda)

| Componente | Solución Existente en Ecosistema | Decisión | Motivo Técnico |
| :--- | :--- | :---: | :--- |
| **Transformer pequeño (218K - 15M)** | nanoGPT (Karpathy) | **REUTILIZAR / EVOLUCIONAR** | Nuestro núcleo experimental de backpropagation transparente y auditable. |
| **Inferencia de Modelos Grandes (7B/8B+)** | `llama.cpp` / GGUF | **REUTILIZAR** | Líder indiscutible en CPU/GPU nativo, cuantización (Q4_K_M) y velocidad. |
| **Inferencia LLM en Navegador** | `WebLLM` (MLC-AI) | **ADAPTAR** | Inferencia WebGPU madura en el cliente para modelos grandes sin servidor. |
| **Ecosistema HuggingFace en Web** | `@huggingface/transformers` (Transformers.js) | **ADAPTAR** | Tokenizadores BPE estándar y modelos ONNX para interoperabilidad. |
| **Almacenamiento Masivo en Navegador** | IndexedDB / OPFS (Origin Private File System) | **REUTILIZAR** | Supera el límite de 5MB de `localStorage`, permitiendo GBs de datos locales. |
| **Buffer de Experiencia y Replay (PER)** | Propietario (Local Brain Lab) | **IMPLEMENTAR** | Es la lógica diferencial de nuestro proyecto para aprendizaje continuo y anti-olvido. |
| **Motor de Destilación (Loss Mixta)** | Propietario (Local Brain Lab) | **IMPLEMENTAR** | Control matemático de la función de pérdida combinada estudiante-maestro. |
| **Registro Unificado de Modelos** | Propietario (Local Brain Lab) | **IMPLEMENTAR** | Abstracción para tratar un nanoGPT 218K y un Qwen 7B bajo contratos homogéneos. |
| **Formato de Distribución de Pesos** | SafeTensors & GGUF | **ADAPTAR** | Estándares de la industria; prohibido inventar formatos propietarios binarios. |

---

## 3. Principios Inmutables para las Próximas Fases

1. **Zero-Breaking-Changes**: Cada paso mantiene compilando y funcionando el modelo de 218K actual.
2. **Separación de Capas**: El núcleo de aprendizaje (`Learning Core`) nunca importa librerías de inferencia de 7B; se comunican mediante la interfaz `InferenceBackend`.
3. **Portabilidad Total**: El proyecto debe iniciar con `npm install` y `npm run dev` en cualquier entorno fuera de AI Studio sin depender de APIs propietarias cerradas.
