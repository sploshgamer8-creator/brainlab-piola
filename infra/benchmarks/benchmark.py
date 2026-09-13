import argparse
import json
import os
import sys
import time
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x):
        var = torch.mean(x ** 2, dim=-1, keepdim=True)
        return x * torch.rsqrt(var + self.eps) * self.weight

class SwiGLU(nn.Module):
    def __init__(self, dim: int, hidden_dim: int):
        super().__init__()
        self.w1 = nn.Linear(dim, hidden_dim, bias=False)
        self.w2 = nn.Linear(hidden_dim, dim, bias=False)
        self.w3 = nn.Linear(dim, hidden_dim, bias=False)

    def forward(self, x):
        return self.w2(F.silu(self.w1(x)) * self.w3(x))

class RoPEAttention(nn.Module):
    def __init__(self, dim: int, n_heads: int):
        super().__init__()
        self.dim = dim
        self.n_heads = n_heads
        self.head_dim = dim // n_heads
        self.q_proj = nn.Linear(dim, dim, bias=False)
        self.k_proj = nn.Linear(dim, dim, bias=False)
        self.v_proj = nn.Linear(dim, dim, bias=False)
        self.out_proj = nn.Linear(dim, dim, bias=False)

    def forward(self, x):
        B, S, D = x.shape
        q = self.q_proj(x).view(B, S, self.n_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(B, S, self.n_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(B, S, self.n_heads, self.head_dim).transpose(1, 2)
        
        # PyTorch Scaled Dot-Product Attention (uses FlashAttention / CuDNN when on CUDA)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        out = out.transpose(1, 2).contiguous().view(B, S, D)
        return self.out_proj(out)

def load_block(block_name: str, dim: int = 768):
    if block_name.lower() in ["rmsnorm", "rms_norm"]:
        return RMSNorm(dim)
    elif block_name.lower() in ["swiglu", "glu"]:
        return SwiGLU(dim, hidden_dim=int(dim * 8 / 3))
    elif block_name.lower() in ["rope", "attention", "flash_attn", "sdpa"]:
        return RoPEAttention(dim=dim, n_heads=12)
    elif block_name.lower() in ["layernorm"]:
        return nn.LayerNorm(dim)
    else:
        raise ValueError(f"Unknown block: {block_name}")

def run_benchmark(block, batch_size=4, seq_len=512, dim=768, warmup=5, steps=20, device="cuda"):
    block = block.to(device)
    x = torch.randn(batch_size, seq_len, dim, device=device)
    
    # Warmup
    for _ in range(warmup):
        _ = block(x)
    if device.startswith("cuda"):
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()

    t0 = time.perf_counter()
    for _ in range(steps):
        _ = block(x)
    if device.startswith("cuda"):
        torch.cuda.synchronize()
        peak_mem = torch.cuda.max_memory_allocated() / (1024 * 1024) # MB
    else:
        peak_mem = 0.0

    total_time = time.perf_counter() - t0
    latency_ms = (total_time / steps) * 1000.0

    return latency_ms, peak_mem

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--block", default="all", help="Block name to benchmark (rmsnorm, swiglu, attention, layernorm, all)")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--seq_len", type=int, default=512)
    parser.add_argument("--batch_size", type=int, default=4)
    args = parser.parse_args()

    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        print("[WARN] CUDA no disponible, cambiando a CPU")
        device = "cpu"

    blocks_to_test = ["layernorm", "rmsnorm", "swiglu", "attention"] if args.block == "all" else [args.block]

    results = []
    print(f"=== BENCHMARK DE ARQUITECTURA (Device: {device.upper()}) ===")
    if device.startswith("cuda"):
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    for bname in blocks_to_test:
        mod = load_block(bname)
        lat, mem = run_benchmark(mod, batch_size=args.batch_size, seq_len=args.seq_len, device=device)
        res = {
            "block": bname,
            "device": device,
            "latency_ms": round(lat, 4),
            "peak_mem_mb": round(mem, 2),
            "seq_len": args.seq_len,
            "batch_size": args.batch_size
        }
        results.append(res)
        print(f"[{bname.upper()}] Latencia: {lat:.3f} ms | VRAM Peak: {mem:.2f} MB")

    out_dir = "c:/Users/totol/Desktop/BrainLabPiola/infra/benchmarks/results"
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "benchmark_summary.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nResultados guardados en: {out_file}")

if __name__ == "__main__":
    main()
