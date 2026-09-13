"""
🧠 OneBrain Modern Architecture (Huesos de Frontera)
Reemplaza los componentes anticuados de GPT-2 por los estándares modernos (LLaMA / Mistral / Gemma):
- LayerNorm -> RMSNorm (sin bias, más estable y rápido en profundidad)
- Learned Absolute Positional Embeddings -> Rotary Positional Embedding (RoPE)
- Standard MLP (GELU) -> SwiGLU Gated Activation FFN
- Causal Attention -> PyTorch Scaled Dot-Product Attention (SDPA / FlashAttention / cuDNN)
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

# ==========================================
# 1. RMSNorm (Root Mean Square Normalization)
# ==========================================
class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        var = torch.mean(x ** 2, dim=-1, keepdim=True)
        norm_x = x * torch.rsqrt(var + self.eps)
        return norm_x * self.weight

# ==========================================
# 2. Rotary Positional Embeddings (RoPE)
# ==========================================
class RotaryEmbedding(nn.Module):
    def __init__(self, dim: int, max_seq_len: int = 2048, base: float = 10000.0):
        super().__init__()
        self.dim = dim
        self.max_seq_len = max_seq_len
        self.base = base
        
        inv_freq = 1.0 / (self.base ** (torch.arange(0, dim, 2).float() / dim))
        self.register_buffer("inv_freq", inv_freq, persistent=False)
        self._build_cache(max_seq_len)

    def _build_cache(self, seq_len: int):
        t = torch.arange(seq_len, device=self.inv_freq.device, dtype=self.inv_freq.dtype)
        freqs = torch.outer(t, self.inv_freq)
        cos = torch.cos(freqs)
        sin = torch.sin(freqs)
        self.register_buffer("cos_cached", cos, persistent=False)
        self.register_buffer("sin_cached", sin, persistent=False)

    def forward(self, seq_len: int, device: torch.device):
        if self.cos_cached.device != device or self.cos_cached.shape[0] < seq_len:
            self.inv_freq = self.inv_freq.to(device)
            self._build_cache(max(seq_len, self.max_seq_len))
        return self.cos_cached[:seq_len], self.sin_cached[:seq_len]

def rotate_half(x: torch.Tensor) -> torch.Tensor:
    x1 = x[..., : x.shape[-1] // 2]
    x2 = x[..., x.shape[-1] // 2 :]
    return torch.cat((-x2, x1), dim=-1)

def apply_rotary_pos_emb(q: torch.Tensor, k: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor):
    cos = torch.cat([cos, cos], dim=-1).unsqueeze(0).unsqueeze(1)
    sin = torch.cat([sin, sin], dim=-1).unsqueeze(0).unsqueeze(1)
    q_embed = (q * cos) + (rotate_half(q) * sin)
    k_embed = (k * cos) + (rotate_half(k) * sin)
    return q_embed, k_embed

# ==========================================
# 3. Modern Causal Attention with RoPE + SDPA
# ==========================================
class ModernCausalAttention(nn.Module):
    def __init__(self, config):
        super().__init__()
        assert config.n_embd % config.n_head == 0
        self.n_head = config.n_head
        self.n_embd = config.n_embd
        self.head_dim = config.n_embd // config.n_head
        self.dropout = config.dropout

        self.qkv_proj = nn.Linear(config.n_embd, 3 * config.n_embd, bias=False)
        self.out_proj = nn.Linear(config.n_embd, config.n_embd, bias=False)
        self.resid_dropout = nn.Dropout(config.dropout)

    def forward(self, x: torch.Tensor, rope_cos: torch.Tensor, rope_sin: torch.Tensor) -> torch.Tensor:
        B, T, C = x.size()

        q, k, v = self.qkv_proj(x).split(self.n_embd, dim=2)
        q = q.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(B, T, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(B, T, self.n_head, self.head_dim).transpose(1, 2)

        q, k = apply_rotary_pos_emb(q, k, rope_cos, rope_sin)

        dropout_p = self.dropout if self.training else 0.0
        out = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=dropout_p)

        out = out.transpose(1, 2).contiguous().view(B, T, C)
        return self.resid_dropout(self.out_proj(out))

# ==========================================
# 4. SwiGLU MLP (Gated Feed-Forward Network)
# ==========================================
class SwiGLUMLP(nn.Module):
    def __init__(self, config):
        super().__init__()
        hidden_dim = int(config.n_embd * 8 / 3)
        hidden_dim = 64 * ((hidden_dim + 63) // 64)

        self.w1 = nn.Linear(config.n_embd, hidden_dim, bias=False)
        self.w3 = nn.Linear(config.n_embd, hidden_dim, bias=False)
        self.w2 = nn.Linear(hidden_dim, config.n_embd, bias=False)
        self.dropout = nn.Dropout(config.dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(self.w2(F.silu(self.w1(x)) * self.w3(x)))

# ==========================================
# 5. Modern Transformer Block
# ==========================================
class OneBrainBlock(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.norm1 = RMSNorm(config.n_embd)
        self.attn = ModernCausalAttention(config)
        self.norm2 = RMSNorm(config.n_embd)
        self.mlp = SwiGLUMLP(config)

    def forward(self, x: torch.Tensor, rope_cos: torch.Tensor, rope_sin: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.norm1(x), rope_cos, rope_sin)
        x = x + self.mlp(self.norm2(x))
        return x

# ==========================================
# 6. Full OneBrain Architecture Configuration & Model
# ==========================================
@dataclass
class OneBrainConfig:
    block_size: int = 512
    vocab_size: int = 131      # Tamaño de vocabulario NanoTokenizer
    n_layer: int = 6           # 6 capas
    n_head: int = 8            # 8 heads * 64 = 512 d_model
    n_embd: int = 512
    dropout: float = 0.0

class OneBrainGPT(nn.Module):
    def __init__(self, config: OneBrainConfig):
        super().__init__()
        self.config = config

        self.wte = nn.Embedding(config.vocab_size, config.n_embd)
        self.rope = RotaryEmbedding(dim=config.n_embd // config.n_head, max_seq_len=config.block_size)
        self.drop = nn.Dropout(config.dropout)

        self.blocks = nn.ModuleList([OneBrainBlock(config) for _ in range(config.n_layer)])
        self.norm_f = RMSNorm(config.n_embd)
        self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)

        # Weight tying
        self.wte.weight = self.lm_head.weight

        self.apply(self._init_weights)
        for pn, p in self.named_parameters():
            if pn.endswith('w2.weight') or pn.endswith('out_proj.weight'):
                torch.nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * config.n_layer))

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def get_num_params(self):
        return sum(p.numel() for p in self.parameters())

    def forward(self, idx: torch.Tensor, targets: Optional[torch.Tensor] = None) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        device = idx.device
        B, T = idx.size()
        assert T <= self.config.block_size, f"Secuencia {T} excede block_size {self.config.block_size}"

        head_dim = self.config.n_embd // self.config.n_head
        rope_cos, rope_sin = self.rope(T, device)

        x = self.drop(self.wte(idx))

        for block in self.blocks:
            x = block(x, rope_cos, rope_sin)

        x = self.norm_f(x)

        if targets is not None:
            logits = self.lm_head(x)
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)
        else:
            logits = self.lm_head(x[:, [-1], :])
            loss = None

        return logits, loss

    @torch.no_grad()
    def generate(self, idx: torch.Tensor, max_new_tokens: int, temperature: float = 0.8, top_k: Optional[int] = 40) -> torch.Tensor:
        for _ in range(max_new_tokens):
            idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / max(temperature, 1e-5)
            if top_k is not None and top_k > 0:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float('Inf')
            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)
        return idx
