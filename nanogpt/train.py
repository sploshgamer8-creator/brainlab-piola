"""
OneBrain Production GPU Trainer
Entrena la arquitectura moderna OneBrainGPT (RMSNorm + RoPE + SwiGLU + SDPA)
con checkpointing automatico, learning rate schedule por coseno y soporte para
todos los shards binarios locales.
"""

import os
import sys
import glob
import time
import math
import argparse
import numpy as np
import torch
import torch.nn as nn
from torch.optim import AdamW

sys.path.append(os.path.dirname(__file__))
from modern_model import OneBrainConfig, OneBrainGPT

def get_lr(step, warmup_steps, max_steps, min_lr, max_lr):
    if step < warmup_steps:
        return max_lr * step / max(1, warmup_steps)
    if step > max_steps:
        return min_lr
    decay_ratio = (step - warmup_steps) / (max_steps - warmup_steps)
    coeff = 0.5 * (1.0 + math.cos(math.pi * decay_ratio))
    return min_lr + coeff * (max_lr - min_lr)

def load_all_shards(data_dir, max_shards=None):
    shard_files = sorted(glob.glob(os.path.join(data_dir, '*.bin')))
    if not shard_files:
        raise FileNotFoundError(f"No se encontraron shards en {data_dir}")
    
    if max_shards is not None:
        shard_files = shard_files[:max_shards]

    print(f"[*] Cargando {len(shard_files)} shards desde {data_dir}...")
    shards = []
    total_tokens = 0
    for f in shard_files:
        d = np.fromfile(f, dtype=np.uint16)
        shards.append(d)
        total_tokens += len(d)

    data = np.concatenate(shards)
    print(f"[*] Total tokens en memoria: {total_tokens:,} ({data.nbytes / (1024 * 1024):.1f} MB)")
    return data

def get_batch(data, batch_size, block_size, device):
    ix = np.random.randint(0, len(data) - block_size - 1, (batch_size,))
    x = np.stack([data[i:i + block_size] for i in ix])
    y = np.stack([data[i + 1:i + block_size + 1] for i in ix])
    x_tensor = torch.from_numpy(x.astype(np.int64)).to(device)
    y_tensor = torch.from_numpy(y.astype(np.int64)).to(device)
    return x_tensor, y_tensor

def main():
    parser = argparse.ArgumentParser(description="OneBrain Production Trainer")
    parser.add_argument("--steps", type=int, default=1000, help="Pasos totales de entrenamiento")
    parser.add_argument("--batch_size", type=int, default=16, help="Tamano de lote")
    parser.add_argument("--block_size", type=int, default=256, help="Longitud de contexto")
    parser.add_argument("--n_layer", type=int, default=6, help="Numero de capas")
    parser.add_argument("--n_head", type=int, default=8, help="Numero de cabezas de atencion")
    parser.add_argument("--n_embd", type=int, default=512, help="Dimension oculta d_model")
    parser.add_argument("--lr", type=float, default=6e-4, help="Learning rate pico")
    parser.add_argument("--min_lr", type=float, default=6e-5, help="Learning rate minimo")
    parser.add_argument("--warmup", type=int, default=100, help="Pasos de warmup")
    parser.add_argument("--save_interval", type=int, default=250, help="Guardar checkpoint cada N pasos")
    parser.add_argument("--log_interval", type=int, default=25, help="Imprimir progreso cada N pasos")
    parser.add_argument("--out_dir", type=str, default="checkpoints", help="Directorio de checkpoints")
    parser.add_argument("--resume", action="store_true", help="Reanudar desde el ultimo checkpoint")
    args = parser.parse_args()

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print("=" * 65)
    print("[ONEBRAIN] GPU TRAINER: RMSNorm + RoPE + SwiGLU + SDPA (Flash)")
    print("=" * 65)
    print(f"Dispositivo: {device.upper()}")
    if device == 'cuda':
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    out_dir = os.path.join(os.path.dirname(__file__), args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    data_path = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'foundation_baseline')
    data = load_all_shards(data_path, max_shards=10) # 10 shards = ~5M tokens

    config = OneBrainConfig(
        block_size=args.block_size,
        vocab_size=131,
        n_layer=args.n_layer,
        n_head=args.n_head,
        n_embd=args.n_embd,
        dropout=0.0
    )

    model = OneBrainGPT(config).to(device)
    params_m = model.get_num_params() / 1e6
    print(f"Parametros del modelo: {params_m:.2f}M")

    optimizer = AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.1)

    start_step = 1
    ckpt_path = os.path.join(out_dir, "onebrain_best.pt")
    if args.resume and os.path.exists(ckpt_path):
        print(f"[*] Reanudando checkpoint: {ckpt_path}")
        checkpoint = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(checkpoint['model_state'])
        optimizer.load_state_dict(checkpoint['optimizer_state'])
        start_step = checkpoint.get('step', 0) + 1
        print(f"[*] Reanudado desde el paso {start_step}")

    best_loss = float('inf')
    t0 = time.time()

    print(f"\nIniciando optimizacion por {args.steps} pasos...")
    for step in range(start_step, start_step + args.steps):
        lr = get_lr(step, args.warmup, start_step + args.steps, args.min_lr, args.lr)
        for param_group in optimizer.param_groups:
            param_group['lr'] = lr

        xb, yb = get_batch(data, args.batch_size, args.block_size, device)
        optimizer.zero_grad()
        logits, loss = model(xb, yb)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step % args.log_interval == 0 or step == start_step:
            dt = time.time() - t0
            tok_sec = (args.batch_size * args.block_size * args.log_interval) / dt if dt > 0 and step > start_step else 0
            vram = torch.cuda.memory_allocated() / (1024 * 1024) if device == 'cuda' else 0
            loss_val = loss.item()
            print(f"Paso {step:5d} | Loss: {loss_val:.4f} | LR: {lr:.2e} | VRAM: {vram:.1f} MB | Speed: {tok_sec:.0f} tok/s")
            t0 = time.time()

        if step % args.save_interval == 0:
            loss_val = loss.item()
            save_obj = {
                'step': step,
                'config': config,
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'loss': loss_val
            }
            step_ckpt = os.path.join(out_dir, f"onebrain_step_{step}.pt")
            torch.save(save_obj, step_ckpt)
            if loss_val < best_loss:
                best_loss = loss_val
                torch.save(save_obj, ckpt_path)
            print(f" [CHECKPOINT] Guardado en {step_ckpt}")

    final_ckpt = os.path.join(out_dir, "onebrain_final.pt")
    torch.save({
        'step': start_step + args.steps - 1,
        'config': config,
        'model_state': model.state_dict(),
        'loss': loss.item()
    }, final_ckpt)
    print(f"\n[OK] Entrenamiento completado. Checkpoint final guardado en: {final_ckpt}")

if __name__ == '__main__':
    main()
