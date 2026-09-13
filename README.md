# Remix Local Brain Lab

> **Laboratorio local para crear, entrenar, evaluar y ejecutar modelos de lenguaje basados en la arquitectura nanoGPT de Andrej Karpathy directamente en el navegador, 100% offline.**

---

## 🚀 Inicio Rápido (Portabilidad Local)

Este proyecto está diseñado para funcionar de forma **independiente y desacoplada**. Puedes descargarlo como ZIP o clonarlo en cualquier máquina con Node.js 18+ y ejecutarlo inmediatamente:

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo en http://localhost:3000
npm run dev

# 3. Compilar para producción
npm run build

# 4. Ejecutar tests unitarios de verificación matemática
npm run test
```

Abre tu navegador en `http://localhost:3000`.

---

## 🧠 Características Principales

1. **Núcleo nanoGPT de 218K Parámetros**:
   - Implementación pura en TypeScript con retropropagación analítica exacta (`NanoGPTModel`).
   - Causal Self-Attention con máscara autoregresiva triangular.
   - MLP con activación GeLU exacta y normalización LayerNorm pre-atención.
   - Optimizador AdamW completo con decaimiento de peso y recorte de gradientes (norm clipping).

2. **Entrenamiento en Segundo Plano (Web Worker)**:
   - Descenso de gradiente asíncrono en un hilo secundario independiente (`training_worker.ts`), manteniendo la interfaz gráfica fluida a 60 FPS.

3. **Buffer de Replay Priorizado (PER) & Prevención de Olvido Catastrófico**:
   - Muestreo ponderado por pérdida y recencia.
   - Deduplicación determinista FNV-1a.
   - Conjunto de Anclas (*Anchor Dataset*) inmutable para retener la sintaxis básica.
   - Régimen de lote balanceado: 30% nuevos ejemplos, 50% replay, 20% anclajes.

4. **Destilación de Conocimiento (Knowledge Distillation)**:
   - Pérdida combinada: $L_{\text{total}} = (1 - \alpha) \cdot L_{\text{CE}} + \alpha \cdot T^2 \cdot L_{\text{KL}}$.
   - Control interactivo de temperatura $T$ y ponderación $\alpha$.

5. **Profesores Multiorigen**:
   - **Frontier Teacher**: Gemini 2.5 Flash para cosecha sintética avanzada (requiere `GEMINI_API_KEY`).
   - **Local Offline Teacher**: Conexión con `llama.cpp` local vía HTTP (`http://127.0.0.1:8080`).
   - **Heuristic Rule Teacher**: Motor sintético 100% offline con 0 ms de latencia sin conexión a red.

6. **Persistencia Masiva (IndexedDB & OPFS)**:
   - Supera el límite de 5 MB de `localStorage`, permitiendo almacenar cientos de megabytes de datasets y checkpoints en disco local.

7. **Exportación e Interoperabilidad**:
   - **Hugging Face SafeTensors (`.safetensors`)**: Binario estándar con cabecera UTF-8 JSON y tensores Float32 contiguos.
   - **BrainRunner (`.html`)**: Archivo autónomo ejecutable con un clic sin servidor.
   - **Brain Bundle (`.brain.json`)**: Checkpoint completo portátil.
   - **CLI Runner (`.js`)**: Inferencia pura en terminal con Node.js.

---

## 🔌 Integración con llama.cpp (Opcional - Modelos 7B Locales)

Si deseas utilizar un modelo GGUF de 7B (por ejemplo, Llama 3 o Qwen 2.5) como profesor o motor de inferencia local:

```bash
# Iniciar llama-server en el puerto 8080 con CORS habilitado
./llama-server -m /ruta/a/tu/modelo-q4_k_m.gguf --port 8080 --host 127.0.0.1 --cors "*"
```

En la interfaz de **Local Brain Lab**:
1. Ve a la pestaña **nanoGPT Core**.
2. En el **Model Registry**, selecciona *llama.cpp 7B Server*.
3. El laboratorio enrutará la generación hacia tu modelo local sin enviar un solo byte a la nube.

---

## 🔑 Variables de Entorno

Copia el archivo de ejemplo para configurar variables opcionales:

```bash
cp .env.example .env
```

| Variable | Propósito | Requerido |
| :--- | :--- | :---: |
| `GEMINI_API_KEY` | Habilita el Frontier Teacher asistido por Gemini en `/api/distill/batch` | No (el app opera 100% offline sin ella) |
| `APP_URL` | URL base de la aplicación (inyectada por el hosting) | No |

---

## 📁 Estructura del Proyecto

```
/
├── src/
│   ├── benchmarks/          # Medición empírica de hardware (ms/tok) y olvido catastrófico
│   ├── components/          # Interfaz React con Tailwind CSS (tabs de entrenamiento, chat, etc.)
│   ├── core/
│   │   ├── nanogpt_engine.ts # Implementación canónica de nanoGPT (Karpathy)
│   │   ├── nanogpt_adapter.ts# Adaptador BrainModel desacoplado
│   │   ├── replay_buffer.ts  # Buffer PER con deduplicación FNV-1a y conjunto ancla
│   │   ├── tokenizer.ts      # Tokenizador ASCII/UTF-8 determinista
│   │   └── contracts.ts      # Interfaces del modelo y backends
│   ├── harvesting/          # Abstracción de profesores (Gemini, llama.cpp, sintético)
│   ├── models/              # Model Registry con catálogo unificado
│   ├── runtime/             # BackendSelector (CPU, WebGPU, llama.cpp)
│   ├── server/              # Endpoints API proxy para seguridad de credenciales
│   ├── storage/             # Almacenamiento IndexedDB, OPFS y exportador SafeTensors
│   ├── training/            # Motor de destilación KL y cliente del Web Worker
│   └── workers/             # Web Worker para entrenamiento asíncrono
├── scripts/                 # Scripts de validación y tests unitarios desatendidos
├── ARCHITECTURE_AUDIT.md    # Matriz de decisión arquitectónica
├── DO_NOT_REINVENT.md       # Directivas estrictas de límites
├── MIGRATION_PLAN.md        # Hoja de ruta de escalabilidad
└── THIRD_PARTY_NOTICES.md   # Licencias y atribución de terceros
```
