"""
PiolaCraft Domain Evaluation Benchmark
Compara sistematicamente el rendimiento entre:
1. Modelo Base Fundacional (onebrain_best.pt)
2. Modelo Especializado PiolaCraft (onebrain_piolacraft.pt)

Evalua:
- Crafteos y recetas de VoxeLibre
- Mecanicas de supervivencia (oxigeno, lava, caida)
- Sintaxis y llamadas de Lua en Luanti
- Reconocimiento de identidad y frases de Lucy
"""

import os
import sys
import time
import json
import torch
import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'nanogpt'))
from modern_model import OneBrainConfig, OneBrainGPT

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scratch'))
try:
    from tokenizer import PythonNanoTokenizer
except ImportError:
    sys.path.append('C:/Users/totol/.gemini/antigravity/brain/2af92075-19fb-4def-9609-b448b953a675/scratch')
    from tokenizer import PythonNanoTokenizer

EVAL_BENCHMARK = [
    # 1. VoxeLibre Recipes & Items
    {
        "category": "voxelibre_crafting",
        "prompt": "¿Que es Pico de diamante en PiolaCraft?",
        "expected_keywords": ["diamante", "herramienta", "pico", "mineral", "minar"]
    },
    {
        "category": "voxelibre_crafting",
        "prompt": "¿Como se usa Horno?",
        "expected_keywords": ["cocinar", "fundir", "combustible", "minerales", "comida"]
    },
    {
        "category": "voxelibre_crafting",
        "prompt": "¿Que suelta Bloque de carbon?",
        "expected_keywords": ["carbon", "bloque", "suelta"]
    },
    {
        "category": "voxelibre_crafting",
        "prompt": "¿Que es Espada de hierro en PiolaCraft?",
        "expected_keywords": ["espada", "hierro", "arma", "daño", "combate"]
    },
    # 2. Mecanicas de Supervivencia
    {
        "category": "game_mechanics",
        "prompt": "¿Que pasa con caida?",
        "expected_keywords": ["daño", "altura", "caer", "vida"]
    },
    {
        "category": "game_mechanics",
        "prompt": "¿Que pasa con asfixia agua?",
        "expected_keywords": ["oxigeno", "ahogar", "burbujas", "aire", "agua"]
    },
    {
        "category": "game_mechanics",
        "prompt": "¿Que pasa con lava?",
        "expected_keywords": ["quema", "fuego", "daño", "morir", "calor"]
    },
    # 3. Luanti Lua API
    {
        "category": "luanti_lua",
        "prompt": "¿Como registro un bloque en Luanti?",
        "expected_keywords": ["minetest.register_node", "tiles", "description", "groups"]
    },
    {
        "category": "luanti_lua",
        "prompt": "¿Como obtengo la posicion del jugador?",
        "expected_keywords": ["get_pos", "player", "pos", "x", "y", "z"]
    },
    {
        "category": "luanti_lua",
        "prompt": "¿Como envio un mensaje en el chat del servidor?",
        "expected_keywords": ["chat_send_all", "chat_send_player", "minetest", "core"]
    },
    # 4. Lucy NPC Personality
    {
        "category": "lucy_identity",
        "prompt": "¿Quien sos?",
        "expected_keywords": ["lucy", "compañera", "piolacraft", "asistente"]
    },
    {
        "category": "lucy_identity",
        "prompt": "seguime",
        "expected_keywords": ["sigo", "vamos", "donde", "cuidado"]
    },
    {
        "category": "lucy_identity",
        "prompt": "quedate aca",
        "expected_keywords": ["quedo", "zona", "espero", "vigilando"]
    }
]

def evaluate_model(model_path, tokenizer, device):
    if not os.path.exists(model_path):
        return None

    ckpt = torch.load(model_path, map_location=device, weights_only=False)
    model = OneBrainGPT(ckpt['config']).to(device)
    model.load_state_dict(ckpt['model_state'])
    model.eval()

    results = []
    category_scores = {}

    for item in EVAL_BENCHMARK:
        prompt_text = f"<|user|>{item['prompt']}<|endoftext|><|assistant|>"
        input_ids = tokenizer.encode(prompt_text)
        x = torch.tensor(input_ids, dtype=torch.long, device=device).unsqueeze(0)

        with torch.no_grad():
            out_ids = model.generate(x, max_new_tokens=40, temperature=0.3, top_k=20)

        raw_ids = out_ids[0].cpu().numpy().tolist()
        gen_tokens = raw_ids[len(input_ids):]
        generated_text = tokenizer.decode(gen_tokens).replace("<|endoftext|>", "").strip().lower()

        # Evaluar coincidencia de palabras clave
        hits = [kw for kw in item["expected_keywords"] if kw.lower() in generated_text]
        score = len(hits) / max(1, len(item["expected_keywords"]))
        is_pass = len(hits) >= 1

        cat = item["category"]
        if cat not in category_scores:
            category_scores[cat] = []
        category_scores[cat].append(1 if is_pass else 0)

        results.append({
            "prompt": item["prompt"],
            "category": cat,
            "response": generated_text,
            "hits": hits,
            "score": score,
            "pass": is_pass
        })

    cat_accuracy = {c: f"{100 * np.mean(v):.1f}%" for c, v in category_scores.items()}
    total_accuracy = 100 * np.mean([1 if r["pass"] else 0 for r in results])

    return {
        "model_file": os.path.basename(model_path),
        "total_tests": len(results),
        "overall_accuracy": f"{total_accuracy:.1f}%",
        "category_accuracy": cat_accuracy,
        "details": results
    }

def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print("=" * 65)
    print("[BENCHMARK] PIOLACRAFT EVALUATION: BASE vs FINETUNED")
    print(f"Hardware: {device.upper()} ({torch.cuda.get_device_name(0) if device=='cuda' else 'CPU'})")
    print("=" * 65)

    tokenizer = PythonNanoTokenizer()

    base_ckpt = "nanogpt/checkpoints/onebrain_best.pt"
    piola_ckpt = "nanogpt/checkpoints/onebrain_piolacraft.pt"

    print(f"\n[1/2] Evaluando Modelo Base ({base_ckpt})...")
    base_res = evaluate_model(base_ckpt, tokenizer, device)

    print(f"[2/2] Evaluando Modelo PiolaCraft ({piola_ckpt})...")
    piola_res = evaluate_model(piola_ckpt, tokenizer, device)

    print("\n" + "=" * 65)
    print("RESULTADOS COMPARATIVOS DEL BENCHMARK")
    print("=" * 65)
    print(f"{'Categoria':<25} | {'Base Model':<12} | {'PiolaCraft FT':<12} | {'Ganancia':<10}")
    print("-" * 65)

    categories = list(EVAL_BENCHMARK[0].keys())
    all_cats = list(piola_res["category_accuracy"].keys())
    for cat in all_cats:
        b_acc = base_res["category_accuracy"].get(cat, "0.0%") if base_res else "N/A"
        p_acc = piola_res["category_accuracy"].get(cat, "0.0%")
        b_val = float(b_acc.replace("%", "")) if b_acc != "N/A" else 0.0
        p_val = float(p_acc.replace("%", ""))
        gain = f"+{p_val - b_val:.1f}%" if p_val >= b_val else f"{p_val - b_val:.1f}%"
        print(f"{cat:<25} | {b_acc:<12} | {p_acc:<12} | {gain:<10}")

    print("-" * 65)
    b_total = base_res['overall_accuracy'] if base_res else "N/A"
    p_total = piola_res['overall_accuracy']
    b_num = float(b_total.replace('%','')) if b_total != 'N/A' else 0.0
    p_num = float(p_total.replace('%',''))
    print(f"{'PRECISION TOTAL':<25} | {b_total:<12} | {p_total:<12} | +{p_num - b_num:.1f}%")
    print("=" * 65)

    # Guardar reporte JSON
    summary_path = "infra/benchmarks/results/piolacraft_benchmark_summary.json"
    os.makedirs(os.path.dirname(summary_path), exist_ok=True)
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "base_model": base_res,
            "piolacraft_model": piola_res,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }, f, indent=2)
    print(f"\n[OK] Resumen completo guardado en: {summary_path}")

if __name__ == '__main__':
    main()
