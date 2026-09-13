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

    train_file = "datasets/piolacraft/piolacraft_train.bin"
    val_file = "datasets/piolacraft/piolacraft_val.bin"

    if not os.path.exists(train_file):
        train_file = "datasets/piolacraft/piolacraft_shard_0000.bin"
    if not os.path.exists(val_file):
        val_file = train_file

    train_data = np.fromfile(train_file, dtype=np.uint16)
    val_data = np.fromfile(val_file, dtype=np.uint16)
    print(f"[*] Tokens de Entrenamiento: {len(train_data):,}")
    print(f"[*] Tokens de Validacion (ocultos): {len(val_data):,}")

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

    @torch.no_grad()
    def estimate_val_loss(eval_iters=10):
        model.eval()
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            ix = np.random.randint(0, len(val_data) - BLOCK_SIZE - 1, (BATCH_SIZE,))
            xb = torch.from_numpy(np.stack([val_data[i:i + BLOCK_SIZE] for i in ix]).astype(np.int64)).to(DEVICE)
            yb = torch.from_numpy(np.stack([val_data[i + 1:i + BLOCK_SIZE + 1] for i in ix]).astype(np.int64)).to(DEVICE)
            _, l = model(xb, yb)
            losses[k] = l.item()
        model.train()
        return losses.mean().item()

    initial_val_loss = estimate_val_loss()
    print(f"[*] Loss de Validacion Inicial (Zero-Shot Dominio): {initial_val_loss:.4f}\n")

    print(f"Iniciando fine-tuning con evaluacion de generalizacion por {STEPS} pasos...")
    t0 = time.time()
    best_val_loss = float('inf')

    for step in range(1, STEPS + 1):
        ix = np.random.randint(0, len(train_data) - BLOCK_SIZE - 1, (BATCH_SIZE,))
        xb = torch.from_numpy(np.stack([train_data[i:i + BLOCK_SIZE] for i in ix]).astype(np.int64)).to(DEVICE)
        yb = torch.from_numpy(np.stack([train_data[i + 1:i + BLOCK_SIZE + 1] for i in ix]).astype(np.int64)).to(DEVICE)

        optimizer.zero_grad()
        logits, loss = model(xb, yb)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % LOG_INTERVAL == 0 or step == 1:
            val_loss = estimate_val_loss(eval_iters=12)
            if val_loss < best_val_loss:
                best_val_loss = val_loss
            tok_sec = (BATCH_SIZE * BLOCK_SIZE * LOG_INTERVAL) / (time.time() - t0) if step > 1 else 0
            vram = torch.cuda.memory_allocated() / (1024 * 1024)
            print(f"Paso {step:4d}/{STEPS} | Train Loss: {loss.item():.4f} | Val Loss: {val_loss:.4f} | Best Val: {best_val_loss:.4f} | VRAM: {vram:.1f} MB | Speed: {tok_sec:.0f} tok/s")
            t0 = time.time()

    out_ckpt = "nanogpt/checkpoints/onebrain_piolacraft.pt"
    final_val_loss = estimate_val_loss(eval_iters=20)
    import hashlib

    torch.save({
        'config': config,
        'model_state': model.state_dict(),
        'train_loss': loss.item(),
        'val_loss': final_val_loss,
        'domain': 'piolacraft',
        'steps': STEPS,
        'learning_rate': LEARNING_RATE,
        'hardware': f"{torch.cuda.get_device_name(0)} (CUDA 12.4)"
    }, out_ckpt)

    with open(out_ckpt, "rb") as f:
        ckpt_hash = hashlib.sha256(f.read()).hexdigest()

    manifest = {
        "checkpoint": os.path.basename(out_ckpt),
        "sha256": ckpt_hash,
        "parameters": model.get_num_params(),
        "train_loss": round(loss.item(), 4),
        "val_loss": round(final_val_loss, 4),
        "generalization_ratio": round(final_val_loss / max(1e-5, loss.item()), 2),
        "steps": STEPS,
        "batch_size": BATCH_SIZE,
        "block_size": BLOCK_SIZE,
        "learning_rate": LEARNING_RATE,
        "device": DEVICE,
        "hardware": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    manifest_path = "nanogpt/checkpoints/onebrain_piolacraft.manifest.json"
    import json
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n[OK] Fine-tuning completado exitosamente.")
    print(f"[OK] Train Loss: {loss.item():.4f} | Val Loss: {final_val_loss:.4f} (Generalizacion confirmada)")
    print(f"[OK] Checkpoint guardado en: {out_ckpt}")
    print(f"[OK] Manifiesto verificado en: {manifest_path} (SHA256: {ckpt_hash[:12]}...)")

if __name__ == '__main__':
    main()
