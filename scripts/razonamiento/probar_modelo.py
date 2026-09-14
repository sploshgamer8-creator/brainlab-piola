import argparse
import json
import os
import re
import sys
import time
import unicodedata

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.stdout.reconfigure(errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--modelo", required=True)
ap.add_argument("--limite", type=int, default=0)
ap.add_argument("--lote", type=int, default=8)
ap.add_argument("--max_tokens", type=int, default=2048)
ap.add_argument("--dtype", default="float16", choices=["float16", "float32"])
ap.add_argument("--sin_pensar", action="store_true")
a = ap.parse_args()

AQUI = os.path.dirname(os.path.abspath(__file__))
preguntas = [json.loads(l) for l in open(os.path.join(AQUI, "test_crafteo_v1.jsonl"), encoding="utf-8")]
if a.limite:
    preguntas = preguntas[: a.limite]


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.replace("*", "").strip(" .:`'\"").split())


def parsear(texto):
    if "</think>" in texto:
        texto = texto.split("</think>")[-1]
    i = texto.upper().rfind("RESPUESTA:")
    if i < 0:
        return None
    resto = texto[i + 10 :].strip()
    linea = resto.splitlines()[0] if resto else ""
    partes = linea.split(";") if ";" in linea else linea.split(",")
    out = {}
    for p in partes:
        m = re.match(r"\s*(.+?)\s*[=:]\s*(\d+)\s*$", p) or re.match(r"\s*(\d+)\s*x?\s+(.+?)\s*$", p)
        if not m:
            continue
        nom, n = (m.group(1), m.group(2)) if not m.group(1).isdigit() else (m.group(2), m.group(1))
        out[norm(nom)] = int(n)
    return out


tok = AutoTokenizer.from_pretrained(a.modelo)
tok.padding_side = "left"
if tok.pad_token is None:
    tok.pad_token = tok.eos_token

t0 = time.time()
modelo = AutoModelForCausalLM.from_pretrained(a.modelo, dtype=getattr(torch, a.dtype), device_map="cuda", attn_implementation="sdpa")
modelo.eval()
carga_s = time.time() - t0


def armar(p):
    kw = {"enable_thinking": not a.sin_pensar} if "qwen3" in a.modelo.lower() else {}
    return tok.apply_chat_template([{"role": "user", "content": p}], tokenize=False, add_generation_prompt=True, **kw)


torch.manual_seed(0)
torch.cuda.reset_peak_memory_stats()
resultados, nuevos_total, t_gen = [], 0, 0.0
for i in range(0, len(preguntas), a.lote):
    lote = preguntas[i : i + a.lote]
    enc = tok([armar(q["prompt"]) for q in lote], return_tensors="pt", padding=True, add_special_tokens=False).to("cuda")
    t = time.time()
    with torch.no_grad():
        out = modelo.generate(**enc, max_new_tokens=a.max_tokens, do_sample=True, temperature=0.6, top_p=0.95, pad_token_id=tok.pad_token_id)
    torch.cuda.synchronize()
    t_gen += time.time() - t
    for q, g in zip(lote, out[:, enc["input_ids"].shape[1] :]):
        n = int((g != tok.pad_token_id).sum())
        nuevos_total += n
        texto = tok.decode(g, skip_special_tokens=True)
        pred = parsear(texto)
        oro = {norm(k): v for k, v in q["respuesta"].items()}
        aciertos = sum(1 for k, v in oro.items() if pred and pred.get(k) == v)
        resultados.append({"id": q["id"], "grupo": q["grupo"], "profundidad": q["profundidad"], "exacta": pred == oro,
                           "parcial": aciertos / len(oro), "sin_respuesta": pred is None, "truncada": n >= a.max_tokens,
                           "tokens": n, "prediccion": pred, "respuesta": oro, "texto": texto})
    print(f"[{len(resultados)}/{len(preguntas)}] exactas={sum(r['exacta'] for r in resultados)} t={t_gen:.0f}s", flush=True)


def resumen(rs):
    n = len(rs) or 1
    return {"n": len(rs), "exactas": sum(r["exacta"] for r in rs), "acc": round(sum(r["exacta"] for r in rs) / n, 3),
            "parcial": round(sum(r["parcial"] for r in rs) / n, 3)}


grupos = sorted({r["grupo"] for r in resultados})
res = {"modelo": a.modelo, "dtype": a.dtype, "pensar": not a.sin_pensar, "max_tokens": a.max_tokens, "lote": a.lote,
       **resumen(resultados), "por_grupo": {g: resumen([r for r in resultados if r["grupo"] == g]) for g in grupos},
       "sin_respuesta": sum(r["sin_respuesta"] for r in resultados), "truncadas": sum(r["truncada"] for r in resultados),
       "tokens_prom": round(nuevos_total / max(len(resultados), 1)), "tok_s_lote": round(nuevos_total / max(t_gen, 1e-9), 1),
       "vram_pico_mb": round(torch.cuda.max_memory_allocated() / 2**20), "carga_s": round(carga_s, 1), "gen_s": round(t_gen)}
os.makedirs(os.path.join(AQUI, "resultados"), exist_ok=True)
nombre = f"{a.modelo.split('/')[-1]}_{'think' if not a.sin_pensar else 'nothink'}_{time.strftime('%Y%m%d-%H%M%S')}"
with open(os.path.join(AQUI, "resultados", nombre + ".jsonl"), "w", encoding="utf-8") as f:
    for r in resultados:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
with open(os.path.join(AQUI, "resultados", nombre + ".resumen.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False))
