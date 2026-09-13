"""
OneBrain Training Harness (RTX 2060 GPU Accelerated)
Entrena la arquitectura moderna OneBrainGPT (RMSNorm + RoPE + SwiGLU + SDPA)
utilizando los shards de tokens binarios reales (foundation_baseline).
"""

import os
import sys
import glob
import time
import math
import numpy as np
import torch
import torch.nn as nn
from torch.optim import AdamW

# Agregar nanogpt al path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'nanogpt'))
from modern_model import OneBrainConfig, OneBrainGPT

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 16
BLOCK_SIZE = 256
N_LAYER = 6
N_HEAD = 8
N_EMBD = 512
LEARNING_RATE = 5e-4
MAX_STEPS = 100
LOG_INTERVAL = 10

def load_data_shards():
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'foundation_baseline')
    shard_files = sorted(glob.glob(os.path.join(data_dir, '*.bin')))
    if not shard_files:
        raise FileNotFoundError(f"No se encontraron shards en {data_dir}")
    print(f"[*] Cargando datos desde {len(shard_files)} shards...")
    tokens = []
    for f in shard_files[:2]:
        data = np.fromfile(f, dtype=np.uint16)
        tokens.append(data)
    all_tokens = np.concatenate(tokens)
    print(f"[*] Total tokens disponibles para sesion: {len(all_tokens):,}")
    return all_tokens

def get_batch(data, batch_size, block_size, device):
    ix = np.random.randint(0, len(data) - block_size - 1, (batch_size,))
    x = np.stack([data[i:i + block_size] for i in ix])
    y = np.stack([data[i + 1:i + block_size + 1] for i in ix])
    x_tensor = torch.from_numpy(x.astype(np.int64)).to(device)
    y_tensor = torch.from_numpy(y.astype(np.int64)).to(device)
    return x_tensor, y_tensor

def main():
    print("=" * 60)
    print("[ONEBRAIN] ENTRENAMIENTO DE PRUEBA: ARQUITECTURA MODERNA")
    print("=" * 60)
    print(f"Dispositivo: {DEVICE.upper()}")
    if DEVICE == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    data = load_data_shards()

    config = OneBrainConfig(
        block_size=BLOCK_SIZE,
        vocab_size=131,
        n_layer=N_LAYER,
        n_head=N_HEAD,
        n_embd=N_EMBD,
        dropout=0.0
    )

    model = OneBrainGPT(config).to(DEVICE)
    params_m = model.get_num_params() / 1e6
    print(f"Modelo OneBrainGPT instanciado: {params_m:.2f}M parametros")
    print(f"Bloques activos: RMSNorm + RoPE + SwiGLU + SDPA Attention (Flash)")

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.95), weight_decay=0.1)

    print("\nIniciando optimizacion en GPU...")
    t0 = time.time()
    for step in range(1, MAX_STEPS + 1):
        xb, yb = get_batch(data, BATCH_SIZE, BLOCK_SIZE, DEVICE)
        optimizer.zero_grad()
        logits, loss = model(xb, yb)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % LOG_INTERVAL == 0 or step == 1:
            tokens_per_sec = (BATCH_SIZE * BLOCK_SIZE * LOG_INTERVAL) / (time.time() - t0) if step > 1 else 0
            vram_mb = torch.cuda.memory_allocated() / (1024 * 1024) if DEVICE == 'cuda' else 0
            print(f"Paso {step:3d}/{MAX_STEPS} | Loss: {loss.item():.4f} | VRAM: {vram_mb:.1f} MB | Speed: {tokens_per_sec:.0f} tok/s")
            t0 = time.time()

    print("\n[OK] Entrenamiento de prueba completado exitosamente.")

    model.eval()
    prompt_tokens = data[:20]
    prompt_tensor = torch.from_numpy(prompt_tokens.astype(np.int64)).unsqueeze(0).to(DEVICE)
    out_tokens = model.generate(prompt_tensor, max_new_tokens=50, temperature=0.7)
    print(f"Tokens generados con exito: {out_tokens.shape[1] - 20} nuevos tokens producidos.")

if __name__ == '__main__':
    main()
