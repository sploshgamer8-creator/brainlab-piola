# nanoGPT - Núcleo Neuronal de Local Brain Lab

## Origen y Reconocimiento
Este directorio contiene los archivos fundacionales del repositorio oficial de **nanoGPT de Andrej Karpathy**:
- Repositorio oficial: [https://github.com/karpathy/nanoGPT](https://github.com/karpathy/nanoGPT)
- Autor original: Andrej Karpathy
- Licencia: MIT

## Arquitectura de nanoGPT (GPT-2 Decoder-Only Transformer)

El modelo sigue la arquitectura estricta de GPT-2:
1. **Embeddings**:
   - `wte`: Word Token Embeddings ($V \times C$, donde $V$ es el tamaño de vocabulario y $C$ es `n_embd`).
   - `wpe`: Word Position Embeddings ($T_{block} \times C$).
   - Dropout sobre la suma de embeddings: $x = \text{drop}(wte + wpe)$.
2. **Bloques Transformer (`Block`)**:
   - Pre-LayerNorm 1: $\hat{x}_1 = \text{LayerNorm}(x)$.
   - Causal Self-Attention: Multi-Head Attention con máscara causal triangular inferior ($j \le i$), división en $Q, K, V$ proyectados conjuntamente en `c_attn` ($C \to 3C$), atención escalada con $\frac{1}{\sqrt{d_k}}$, softmax y proyección de salida `c_proj` ($C \to C$).
   - Conexión residual: $x = x + \text{Attention}(\hat{x}_1)$.
   - Pre-LayerNorm 2: $\hat{x}_2 = \text{LayerNorm}(x)$.
   - MLP feedforward: Expansión $C \to 4C$ con `c_fc`, activación GELU aproximada, proyección $4C \to C$ con `c_proj`.
   - Conexión residual: $x = x + \text{MLP}(\hat{x}_2)$.
3. **Cabeza de Predicción (`lm_head`)**:
   - LayerNorm final: $\text{ln\_f}(x)$.
   - Proyección lineal a logits: $C \to V$. En GPT-2 original se utiliza weight tying (`lm_head.weight = wte.weight`).

## Implementación en Local Brain Lab

Local Brain Lab incluye:
1. **Código Python de referencia** (`model.py`, `train.py`, `sample.py`) para desarrolladores que ejecutan o exportan hacia entornos PyTorch / CUDA.
2. **Motor neuronal equivalente en TypeScript / Typed Arrays** (`src/core/nanogpt_engine.ts`):
   - Computa exactamente los mismos tensores, dimensiones, forward pass con softmax causal, MLP con GELU, cálculo de Cross-Entropy Loss, retropropagación de gradientes (backward pass) y optimizador AdamW con weight decay.
   - Permite entrenar y ejecutar inferencia directamente en el entorno local (navegador / Node.js) sin ninguna API externa ni dependencia de servidores remotos.
   - 100% offline, transparente, auditable y sin cajas negras.
