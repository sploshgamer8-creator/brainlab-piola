#!/usr/bin/env bash
# ------------------------------------------------------------
# Script: create_env.sh
# Purpose: Build a reproducible Python environment (conda if available, otherwise venv)
# ------------------------------------------------------------
set -e
ROOT_DIR=$(dirname "$(realpath "$0")")/..
ENV_DIR="$ROOT_DIR/env"
PYTHON_VER=3.11

if command -v conda >/dev/null 2>&1; then
  echo "[conda] Creating environment at $ENV_DIR"
  conda create -y -p "$ENV_DIR" python=$PYTHON_VER
  # Activate conda env (for subsequent commands you may need to source activate)
else
  echo "[venv] Creating virtualenv at $ENV_DIR"
  python -m venv "$ENV_DIR"
fi

# Upgrade pip
"$ENV_DIR/Scripts/pip.exe" install --upgrade pip setuptools wheel

# Core dependencies (torch with CUDA 12.1, numpy, tqdm, transformers, datasets)
"$ENV_DIR/Scripts/pip.exe" install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu121
"$ENV_DIR/Scripts/pip.exe" install numpy tqdm transformers tokenizers datasets

echo "Environment ready at $ENV_DIR"
