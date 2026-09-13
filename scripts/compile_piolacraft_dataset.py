"""
OneBrain: PiolaCraft Knowledge Compiler
Lee el conocimiento nativo de PiolaCraft (mecanicas, enciclopedia, dialogos de Lucy, Lua)
y lo compila a shards binarios uint16 con el NanoTokenizer para entrenamiento en OneBrainGPT.
"""

import os
import sys
import json
import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scratch'))
try:
    from tokenizer import PythonNanoTokenizer
except ImportError:
    sys.path.append('C:/Users/totol/.gemini/antigravity/brain/2af92075-19fb-4def-9609-b448b953a675/scratch')
    from tokenizer import PythonNanoTokenizer

PIOLABRAIN_DIR = r"C:\Users\totol\Desktop\piolabrain"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "piolacraft")

def load_piolacraft_data():
    pairs = []

    # 1. Mecanicas de juego
    mecanicas_file = os.path.join(PIOLABRAIN_DIR, "src", "knowledge", "mecanicas.json")
    if os.path.exists(mecanicas_file):
        try:
            with open(mecanicas_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            for m in data.get("mecanicas", []):
                dice = m.get("dice", "").strip()
                if not dice:
                    continue
                mid = m.get("id", "").replace("_", " ")
                inp = f"¿Que pasa con {mid}?"
                pairs.append({"input": inp, "output": dice.capitalize() + "."})
            print(f"[*] Mecanicas cargadas: {len(data.get('mecanicas', []))}")
        except Exception as e:
            print(f"[WARN] Error en mecanicas: {e}")

    # 2. Enciclopedia Voxelibre
    enciclo_file = os.path.join(PIOLABRAIN_DIR, "src", "knowledge", "enciclopedia.json")
    if os.path.exists(enciclo_file):
        try:
            with open(enciclo_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data.get("items", {})
            enc_count = 0
            for key, item in items.items():
                nombre = item.get("es") or key.split(":")[-1].replace("_", " ")
                if not nombre:
                    continue
                ayuda = item.get("ayuda", "").strip()
                if len(ayuda) > 10:
                    pairs.append({"input": f"¿Que es {nombre} en PiolaCraft?", "output": f"{nombre}: {ayuda}"})
                    enc_count += 1
                uso = item.get("uso", "").strip()
                if len(uso) > 10:
                    pairs.append({"input": f"¿Como se usa {nombre}?", "output": uso})
                    enc_count += 1
                drops = item.get("suelta", [])
                if drops:
                    drops_str = ", ".join([d.split(":")[-1].replace("_", " ") for d in drops])
                    pairs.append({"input": f"¿Que suelta {nombre}?", "output": f"{nombre} suelta: {drops_str}."})
                    enc_count += 1
            print(f"[*] Entradas de enciclopedia cargadas: {enc_count}")
        except Exception as e:
            print(f"[WARN] Error en enciclopedia: {e}")

    # 3. Dialogos y frases de Lucy
    frases_dir = os.path.join(PIOLABRAIN_DIR, "lab", "frases", "charla")
    if os.path.exists(frases_dir):
        for fname in ["banco.json", "dev4_banco.json"]:
            fpath = os.path.join(frases_dir, fname)
            if os.path.exists(fpath):
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    items = data if isinstance(data, list) else data.get("mensajes", [])
                    for m in items:
                        txt = (m.get("texto") or m.get("mensaje") or "").strip()
                        cat = m.get("categoria", "social")
                        if len(txt) < 3:
                            continue
                        if cat == "SALUDO" or "hola" in txt.lower():
                            resp = "¡Hola! ¿Como andas? ¿En que te ayudo en PiolaCraft?"
                        elif "quien sos" in txt.lower() or "quién sos" in txt.lower():
                            resp = "Soy Lucy, tu compañera en PiolaCraft."
                        elif "seguime" in txt.lower():
                            resp = "Te sigo, decime a donde vamos."
                        elif "quedate" in txt.lower():
                            resp = "Me quedo aca vigilando la zona."
                        else:
                            resp = f"Sobre eso en PiolaCraft: {txt}"
                        pairs.append({"input": txt, "output": resp})
                    print(f"[*] Dialogos de Lucy ({fname}): {len(items)}")
                except Exception as e:
                    print(f"[WARN] Error en charla {fname}: {e}")

    # 4. Programacion Lua para Luanti/VoxeLibre
    lua_knowledge = [
        ("¿Como registro un bloque en Luanti?", "Se usa minetest.register_node('mod:bloque', { description = 'Mi Bloque', tiles = {'textura.png'}, groups = {cracky=3} })"),
        ("¿Como obtengo la posicion del jugador?", "Usa local pos = player:get_pos() que devuelve una tabla con {x, y, z}."),
        ("¿Como envio un mensaje en el chat del servidor?", "Usa core.chat_send_all('Texto') o minetest.chat_send_player(nombre, 'Texto')."),
        ("¿Como creo un pico personalizado en Lua?", "Se registra con minetest.register_tool('mod:pico', { description = 'Pico Magico', tool_capabilities = { max_drop_level=3, groupcaps={cracky={times={[1]=2.0, [2]=1.0, [3]=0.5}, maxwear=200}} } })")
    ]
    for q, a in lua_knowledge:
        pairs.append({"input": q, "output": a})

    return pairs

def main():
    print("=" * 65)
    print("[PIOLACRAFT] COMPILADOR DE DATASET A SHARDS UINT16")
    print("=" * 65)

    pairs = load_piolacraft_data()
    print(f"\n[+] Total pares de conocimiento recolectados: {len(pairs):,}")

    tokenizer = PythonNanoTokenizer()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_tokens = []
    for p in pairs:
        doc = f"<|user|>{p['input']}<|endoftext|><|assistant|>{p['output']}<|endoftext|>\n"
        tokens = tokenizer.encode(doc)
        all_tokens.extend(tokens)

    all_tokens_arr = np.array(all_tokens, dtype=np.uint16)
    out_file = os.path.join(OUTPUT_DIR, "piolacraft_shard_0000.bin")
    all_tokens_arr.tofile(out_file)

    manifest = {
        "dataset_name": "piolacraft_lore_and_lua",
        "total_pairs": len(pairs),
        "total_tokens": len(all_tokens),
        "dtype": "uint16",
        "shard_path": out_file
    }
    with open(os.path.join(OUTPUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[OK] Shard binario generado: {out_file}")
    print(f"[OK] Tokens compilados: {len(all_tokens):,} tokens uint16.")

if __name__ == "__main__":
    main()
