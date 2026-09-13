#!/usr/bin/env bash
# ------------------------------------------------------------
# Script: clone_repos.sh
# Purpose: Clone all required GitHub repositories into infra/repos
# ------------------------------------------------------------
set -e
BASE_DIR=$(dirname "$(realpath "$0")")/../repos
mkdir -p "$BASE_DIR"

declare -A REPOS=(
  [nanoGPT]="https://github.com/karpathy/nanoGPT.git"
  [nanoGPT_mup]="https://github.com/EleutherAI/nanoGPT-mup.git"
  [llm_grow]="https://github.com/jianzhnie/llm-grow.git"
  [attention_residuals]="https://github.com/MoonshotAI/Attention-Residuals.git"
  [deepseek_mini]="https://github.com/Soyebsoyeb/DeepSeek.git"
  [qwen3]="https://github.com/QwenLM/Qwen3.git"
  [gemma]="https://github.com/google/gemma_pytorch.git"
  [minimax]="https://github.com/mit-han-lab/minimax.git"
  [mamba]="https://github.com/state-spaces/mamba.git"
  [kimi_k2]="https://github.com/MoonshotAI/Kimi-K2.git"
  [llama4]="https://github.com/meta-llama/llama-models.git"
  [megatron_lm]="https://github.com/NVIDIA/Megatron-LM.git"
  [flash_attention]="https://github.com/Dao-AILab/flash-attention.git"
  [deepspeed]="https://github.com/microsoft/DeepSpeed.git"
)

for name in "${!REPOS[@]}"; do
  repo_url=${REPOS[$name]}
  dest="$BASE_DIR/$name"
  if [ -d "$dest" ]; then
    echo "[skip] $name already cloned at $dest"
  else
    echo "[clone] $name -> $repo_url"
    git clone --depth 1 "$repo_url" "$dest"
  fi
done

echo "All repositories cloned into $BASE_DIR"
