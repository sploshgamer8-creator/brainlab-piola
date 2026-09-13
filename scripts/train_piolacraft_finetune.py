"""
OneBrain PiolaCraft Domain Fine-Tuning
Aplica fine-tuning sobre el checkpoint entrenado de OneBrainGPT
utilizando los 634,812 tokens de conocimiento nativo de PiolaCraft y Luanti.
"""

import os
import sys
import time
import math
import numpy as np
import torch
import torch.nn as nn
from torch.optim import AdamW

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'nanogpt'))
from modern_model import OneBrainConfig, OneBrainGPT

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 16
BLOCK_SIZE = 256
LEARNING_RATE = 2e-4
STEPS = 200
LOG_INTERVAL = 25

def main():
    print("=" * 65)
    print("[ONEBRAIN] FINE-TUNING DE DOMINIO: PIOLACRAFT & LUA")
    print(f"Dispositivo: {DEVICE.upper()} ({torch.cuda.get_device_name(0)})")
    print("=" * 65)

    data_file = "datasets/piolacraft/piolacraft_shard_0000.bin"
    if not os.path.exists(data_file):
        raise FileNotFoundError(f"No se encontro {data_file}")

    data = np.fromfile(data_file, dtype=np.uint16)
    print(f"[*] Tokens de PiolaCraft cargados: {len(data):,} tokens")

    # Cargar checkpoint base entrenado
    ckpt_path = "nanogpt/checkpoints/onebrain_best.pt"
    if not os.path.exists(ckpt_path):
        ckpt_path = "nanogpt/checkpoints/onebrain_final.pt"

    print(f"[*] Cargando checkpoint base: {ckpt_path}")
    checkpoint = torch.load(ckpt_path, map_location=DEVICE, weights_only=False)
    config = checkpoint['config']

    model = OneBrainGPT(config).to(DEVICE)
    model.load_state_dict(checkpoint['model_state'])
    print(f"[*] Modelo OneBrainGPT instanciado ({model.get_num_params() / 1e6:.2f}M params)")

    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, betas=(0.9, 0.95), weight_decay=0.01)

    print(f"\nIniciando fine-tuning por {STEPS} pasos...")
    t0 = time.time()
    for step in range(1, STEPS + 1):
        ix = np.random.randint(0, len(data) - BLOCK_SIZE - 1, (BATCH_SIZE,))
        xb = torch.from_numpy(np.stack([data[i:i + BLOCK_SIZE] for i in ix]).astype(np.int64)).to(DEVICE)
        yb = torch.from_numpy(np.stack([data[i + 1:i + BLOCK_SIZE + 1] for i in ix]).astype(np.int64)).to(DEVICE)

        optimizer.zero_grad()
        logits, loss = model(xb, yb)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % LOG_INTERVAL == 0 or step == 1:
            tok_sec = (BATCH_SIZE * BLOCK_SIZE * LOG_INTERVAL) / (time.time() - t0) if step > 1 else 0
            vram = torch.cuda.memory_allocated() / (1024 * 1024)
            print(f"Paso {step:4d}/{STEPS} | Loss: {loss.item():.4f} | VRAM: {vram:.1f} MB | Speed: {tok_sec:.0f} tok/s")
            t0 = time.time()

    out_ckpt = "nanogpt/checkpoints/onebrain_piolacraft.pt"
    torch.save({
        'config': config,
        'model_state': model.state_dict(),
        'loss': loss.item(),
        'domain': 'piolacraft'
    }, out_ckpt)
    print(f"\n[OK] Fine-tuning completado exitosamente.")
    print(f"[OK] Checkpoint de dominio guardado en: {out_ckpt}")

if __name__ == '__main__':
    main()
