"""
OneBrain Systematic Architecture Ablation & Measurement Suite
Mide en orden cada componente arquitectonico para aislar su impacto cuantitativo:
1. Baseline GPT-2: LayerNorm + Learned Absolute Pos + GELU MLP + Manual Attn
2. +SDPA Flash: Causal SDPA acelerado por hardware
3. +RMSNorm: RMSNorm + Learned Pos + GELU + SDPA
4. +RoPE: RMSNorm + RoPE + GELU + SDPA
5. +SwiGLU: OneBrain Modern Full: RMSNorm + RoPE + SwiGLU + SDPA
"""

import os
import sys
import glob
import time
import json
import math
import argparse
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW

class LayerNorm(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(dim))
        self.bias = nn.Parameter(torch.zeros(dim))

    def forward(self, x):
        return F.layer_norm(x, self.weight.shape, self.weight, self.bias, 1e-5)

class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x):
        var = torch.mean(x ** 2, dim=-1, keepdim=True)
        return x * torch.rsqrt(var + self.eps) * self.weight

class RotaryEmbedding(nn.Module):
    def __init__(self, dim, max_seq_len=2048, base=10000.0):
        super().__init__()
        self.dim = dim
        self.max_seq_len = max_seq_len
        inv_freq = 1.0 / (base ** (torch.arange(0, dim, 2).float() / dim))
        self.register_buffer("inv_freq", inv_freq, persistent=False)
        self._build_cache(max_seq_len)

    def _build_cache(self, seq_len):
        t = torch.arange(seq_len, device=self.inv_freq.device, dtype=self.inv_freq.dtype)
        freqs = torch.outer(t, self.inv_freq)
        self.register_buffer("cos_cached", torch.cos(freqs), persistent=False)
        self.register_buffer("sin_cached", torch.sin(freqs), persistent=False)

    def forward(self, seq_len, device):
        if self.cos_cached.device != device or self.cos_cached.shape[0] < seq_len:
            self.inv_freq = self.inv_freq.to(device)
            self._build_cache(max(seq_len, self.max_seq_len))
        return self.cos_cached[:seq_len], self.sin_cached[:seq_len]

def rotate_half(x):
    x1 = x[..., : x.shape[-1] // 2]
    x2 = x[..., x.shape[-1] // 2 :]
    return torch.cat((-x2, x1), dim=-1)

def apply_rotary(q, k, cos, sin):
    cos = torch.cat([cos, cos], dim=-1).unsqueeze(0).unsqueeze(1)
    sin = torch.cat([sin, sin], dim=-1).unsqueeze(0).unsqueeze(1)
    return (q * cos) + (rotate_half(q) * sin), (k * cos) + (rotate_half(k) * sin)

class StandardGELUMLP(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.c_fc = nn.Linear(dim, 4 * dim, bias=False)
        self.c_proj = nn.Linear(4 * dim, dim, bias=False)

    def forward(self, x):
        return self.c_proj(F.gelu(self.c_fc(x)))

class SwiGLUMLP(nn.Module):
    def __init__(self, dim):
        super().__init__()
        hidden_dim = int(dim * 8 / 3)
        hidden_dim = 64 * ((hidden_dim + 63) // 64)
        self.w1 = nn.Linear(dim, hidden_dim, bias=False)
        self.w3 = nn.Linear(dim, hidden_dim, bias=False)
        self.w2 = nn.Linear(hidden_dim, dim, bias=False)

    def forward(self, x):
        return self.w2(F.silu(self.w1(x)) * self.w3(x))

class ModularAttention(nn.Module):
    def __init__(self, dim, n_head, use_sdpa=True, use_rope=False):
        super().__init__()
        self.dim = dim
        self.n_head = n_head
        self.head_dim = dim // n_head
        self.use_sdpa = use_sdpa
        self.use_rope = use_rope

        self.qkv = nn.Linear(dim, 3 * dim, bias=False)
        self.out = nn.Linear(dim, dim, bias=False)

    def forward(self, x, rope_cos=None, rope_sin=None):
        B, T, C = x.size()
        q, k, v = self.qkv(x).split(self.dim, dim=2)
        q = q.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(B, T, self.n_head, self.head_dim).transpose(1, 2)

        if self.use_rope and rope_cos is not None:
            q, k = apply_rotary(q, k, rope_cos, rope_sin)

        if self.use_sdpa:
            out = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        else:
            att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.head_dim))
            mask = torch.tril(torch.ones(T, T, device=x.device)).view(1, 1, T, T)
            att = att.masked_fill(mask == 0, float('-inf'))
            att = F.softmax(att, dim=-1)
            out = att @ v

        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.out(out)

class ModularBlock(nn.Module):
    def __init__(self, dim, n_head, norm_type="rmsnorm", mlp_type="swiglu", use_sdpa=True, use_rope=False):
        super().__init__()
        self.norm1 = RMSNorm(dim) if norm_type == "rmsnorm" else LayerNorm(dim)
        self.attn = ModularAttention(dim, n_head, use_sdpa=use_sdpa, use_rope=use_rope)
        self.norm2 = RMSNorm(dim) if norm_type == "rmsnorm" else LayerNorm(dim)
        self.mlp = SwiGLUMLP(dim) if mlp_type == "swiglu" else StandardGELUMLP(dim)

    def forward(self, x, rope_cos=None, rope_sin=None):
        x = x + self.attn(self.norm1(x), rope_cos, rope_sin)
        x = x + self.mlp(self.norm2(x))
        return x

class ModularModel(nn.Module):
    def __init__(self, vocab_size=131, block_size=256, n_layer=4, n_head=8, n_embd=512,
                 norm_type="rmsnorm", mlp_type="swiglu", use_sdpa=True, use_rope=True):
        super().__init__()
        self.block_size = block_size
        self.use_rope = use_rope

        self.wte = nn.Embedding(vocab_size, n_embd)
        if not use_rope:
            self.wpe = nn.Embedding(block_size, n_embd)
        else:
            self.rope = RotaryEmbedding(dim=n_embd // n_head, max_seq_len=block_size)

        self.blocks = nn.ModuleList([
            ModularBlock(n_embd, n_head, norm_type=norm_type, mlp_type=mlp_type, use_sdpa=use_sdpa, use_rope=use_rope)
            for _ in range(n_layer)
        ])
        self.norm_f = RMSNorm(n_embd) if norm_type == "rmsnorm" else LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size, bias=False)
        self.wte.weight = self.lm_head.weight

    def forward(self, idx, targets=None):
        B, T = idx.size()
        device = idx.device
        x = self.wte(idx)

        rope_cos, rope_sin = None, None
        if not self.use_rope:
            pos = torch.arange(0, T, dtype=torch.long, device=device)
            x = x + self.wpe(pos)
        else:
            rope_cos, rope_sin = self.rope(T, device)

        for b in self.blocks:
            x = b(x, rope_cos, rope_sin)
        x = self.norm_f(x)

        logits = self.lm_head(x)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))
        return logits, loss

def load_data():
    data_dir = "datasets/foundation_baseline"
    shards = sorted(glob.glob(os.path.join(data_dir, "*.bin")))
    tokens = [np.fromfile(f, dtype=np.uint16) for f in shards[:3]]
    return np.concatenate(tokens)

def evaluate_variant(name, config_kwargs, data, device="cuda", steps=100, batch_size=16, block_size=256):
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    
    model = ModularModel(vocab_size=131, block_size=block_size, n_layer=4, n_head=8, n_embd=512, **config_kwargs).to(device)
    optimizer = AdamW(model.parameters(), lr=5e-4)

    # Warmup
    ix = np.random.randint(0, len(data) - block_size - 1, (batch_size,))
    xb = torch.from_numpy(np.stack([data[i:i + block_size] for i in ix]).astype(np.int64)).to(device)
    yb = torch.from_numpy(np.stack([data[i + 1:i + block_size + 1] for i in ix]).astype(np.int64)).to(device)
    for _ in range(3):
        _ = model(xb, yb)
    torch.cuda.synchronize()

    initial_loss = None
    final_loss = None

    t0 = time.perf_counter()
    for s in range(1, steps + 1):
        ix = np.random.randint(0, len(data) - block_size - 1, (batch_size,))
        xb = torch.from_numpy(np.stack([data[i:i + block_size] for i in ix]).astype(np.int64)).to(device)
        yb = torch.from_numpy(np.stack([data[i + 1:i + block_size + 1] for i in ix]).astype(np.int64)).to(device)

        optimizer.zero_grad()
        _, loss = model(xb, yb)
        if s == 1:
            initial_loss = loss.item()
        loss.backward()
        optimizer.step()

        if s == steps:
            final_loss = loss.item()

    torch.cuda.synchronize()
    total_time = time.perf_counter() - t0
    peak_vram = torch.cuda.max_memory_allocated() / (1024 * 1024)
    throughput = (steps * batch_size * block_size) / total_time
    ms_per_step = (total_time / steps) * 1000.0

    return {
        "variant": name,
        "step_time_ms": round(ms_per_step, 2),
        "throughput_tok_sec": round(throughput, 0),
        "peak_vram_mb": round(peak_vram, 1),
        "initial_loss": round(initial_loss, 4),
        "final_loss": round(final_loss, 4),
        "loss_delta": round(initial_loss - final_loss, 4)
    }

def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("=" * 70)
    print("[ONEBRAIN] SUITE DE ABLACION SISTEMATICA: COMPARATIVA MODULAR EN GPU")
    print(f"Dispositivo: {device.upper()} ({torch.cuda.get_device_name(0)})")
    print("=" * 70)

    data = load_data()
    print(f"[*] Tokens cargados para pruebas: {len(data):,}")

    variants = [
        ("1. Baseline GPT-2 (LayerNorm + Learned Pos + GELU + Manual Attn)", {
            "norm_type": "layernorm", "mlp_type": "gelu", "use_sdpa": False, "use_rope": False
        }),
        ("2. +SDPA Flash (Causal SDPA acelerado por hardware)", {
            "norm_type": "layernorm", "mlp_type": "gelu", "use_sdpa": True, "use_rope": False
        }),
        ("3. +RMSNorm (Normalizacion simplificada sin bias)", {
            "norm_type": "rmsnorm", "mlp_type": "gelu", "use_sdpa": True, "use_rope": False
        }),
        ("4. +RoPE (Rotary Positional Embeddings)", {
            "norm_type": "rmsnorm", "mlp_type": "gelu", "use_sdpa": True, "use_rope": True
        }),
        ("5. +SwiGLU (OneBrain Modern Full: RMSNorm + RoPE + SwiGLU + SDPA)", {
            "norm_type": "rmsnorm", "mlp_type": "swiglu", "use_sdpa": True, "use_rope": True
        })
    ]

    results = []
    print("\nEjecutando mediciones ordenadas (100 pasos por variante)...")
    for name, kwargs in variants:
        print(f"\n[Evaluando] {name}...")
        res = evaluate_variant(name, kwargs, data, device=device, steps=100)
        results.append(res)
        print(f" -> Tiempo/Paso: {res['step_time_ms']} ms | Velocidad: {res['throughput_tok_sec']} tok/s | VRAM: {res['peak_vram_mb']} MB | Loss: {res['initial_loss']} -> {res['final_loss']} (Delta: {res['loss_delta']})")

    out_file = "infra/benchmarks/results/systematic_ablation_results.json"
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n[OK] Mediciones finalizadas y guardadas en: {out_file}")

if __name__ == '__main__':
    main()
