"""
OneBrain Interactive Sampler
Carga un checkpoint entrenado de OneBrainGPT y genera texto autoregresivo
utilizando el NanoTokenizer del proyecto.
"""

import os
import sys
import argparse
import torch
import torch.nn.functional as F

sys.path.append(os.path.dirname(__file__))
from modern_model import OneBrainConfig, OneBrainGPT

# Importar el NanoTokenizer en Python
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scratch'))
try:
    from tokenizer import PythonNanoTokenizer
except ImportError:
    sys.path.append('C:/Users/totol/.gemini/antigravity/brain/2af92075-19fb-4def-9609-b448b953a675/scratch')
    from tokenizer import PythonNanoTokenizer

def main():
    parser = argparse.ArgumentParser(description="OneBrain Text Sampler")
    parser.add_argument("--ckpt", type=str, default="checkpoints/onebrain_best.pt", help="Ruta al checkpoint .pt")
    parser.add_argument("--prompt", type=str, default="<|user|>What is machine learning?<|endoftext|><|assistant|>", help="Texto inicial")
    parser.add_argument("--max_tokens", type=int, default=150, help="Cantidad de tokens a generar")
    parser.add_argument("--temperature", type=float, default=0.7, help="Temperatura")
    parser.add_argument("--top_k", type=int, default=40, help="Top-K sampling")
    args = parser.parse_args()

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    ckpt_path = os.path.join(os.path.dirname(__file__), args.ckpt)
    if not os.path.exists(ckpt_path):
        fallback = os.path.join(os.path.dirname(__file__), "checkpoints", "onebrain_final.pt")
        if os.path.exists(fallback):
            ckpt_path = fallback
        else:
            raise FileNotFoundError(f"No se encontro el checkpoint en {ckpt_path}")

    print("=" * 60)
    print("[ONEBRAIN] INFERENCE GENERATOR")
    print("=" * 60)
    print(f"Cargando checkpoint: {ckpt_path}")
    checkpoint = torch.load(ckpt_path, map_location=device, weights_only=False)
    config = checkpoint['config']
    
    model = OneBrainGPT(config).to(device)
    model.load_state_dict(checkpoint['model_state'])
    model.eval()
    print(f"Modelo OneBrainGPT cargado ({model.get_num_params() / 1e6:.2f}M params) en {device.upper()}")

    tokenizer = PythonNanoTokenizer()

    prompt_ids = tokenizer.encode(args.prompt)
    x = torch.tensor(prompt_ids, dtype=torch.long, device=device).unsqueeze(0)

    print(f"\n--- Prompt de entrada ---")
    print(args.prompt)
    print(f"-------------------------")
    print(f"Generando {args.max_tokens} tokens con Temp={args.temperature}, TopK={args.top_k}...\n")

    out_ids = model.generate(x, max_new_tokens=args.max_tokens, temperature=args.temperature, top_k=args.top_k)
    generated_text = tokenizer.decode(out_ids[0].cpu().numpy())

    print("--- Resultado Completo Generado ---")
    print(generated_text)
    print("-----------------------------------")

if __name__ == '__main__':
    main()
