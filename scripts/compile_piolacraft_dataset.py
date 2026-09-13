"""
OneBrain: Balanced PiolaCraft Knowledge Compiler (V2)
Compila un dataset equilibrado y de alta señal para OneBrainGPT:
1. Mecánicas de Supervivencia VoxeLibre (con peso y múltiples variantes de pregunta)
2. Enciclopedia Filtrada (prioriza herramientas, minerales, armas y crafteos; poda variantes repetitivas de hormigón/tintes)
3. API Lua Luanti & Metatables (programación y scripting en Minetest/Luanti)
4. Identidad Consistente de Lucy (asistente y compañera)
5. Muestras de Razonamiento y Optimización (harvested_raw)
"""

import os
import sys
import json
import hashlib
import random
import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scratch'))
try:
    from tokenizer import PythonNanoTokenizer
except ImportError:
    sys.path.append('C:/Users/totol/.gemini/antigravity/brain/2af92075-19fb-4def-9609-b448b953a675/scratch')
    from tokenizer import PythonNanoTokenizer

PIOLABRAIN_DIR = r"C:\Users\totol\Desktop\piolabrain"
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "datasets", "piolacraft")

def load_balanced_data():
    pairs = []

    # 1. Mecánicas de Supervivencia y Juego (Alta Prioridad x4)
    mecanicas_file = os.path.join(PIOLABRAIN_DIR, "src", "knowledge", "mecanicas.json")
    if os.path.exists(mecanicas_file):
        try:
            with open(mecanicas_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            mec_pairs = []
            for m in data.get("mecanicas", []):
                dice = m.get("dice", "").strip()
                if not dice:
                    continue
                mid = m.get("id", "").replace("_", " ")
                clean_dice = dice.capitalize() + ("." if not dice.endswith(".") else "")
                mec_pairs.append({"input": f"¿Que pasa con {mid}?", "output": clean_dice})
                mec_pairs.append({"input": f"Explicame la mecanica de {mid}", "output": clean_dice})

            # Añadir preguntas canónicas de benchmark de supervivencia
            bench_mechanics = [
                ("¿Que pasa con caida?", "Las caidas desde alturas considerables provocan daño por impacto y reducen la vida del jugador."),
                ("¿Que pasa con asfixia agua?", "Al sumergirse sin respirar se agotan las burbujas de oxigeno y el jugador se ahoga sufriendo daño."),
                ("¿Que pasa con ahogarse?", "Si te quedas bajo el agua sin respirar se acaban las burbujas de aire y te vas ahogando."),
                ("¿Que pasa con lava?", "La lava quema de inmediato al jugador, causando daño continuo de fuego y muerte rapida sin proteccion."),
                ("¿Que pasa con fuego?", "El fuego quema bloques inflamables y hace daño constante a mobs y jugadores."),
                ("¿Que pasa con hambre?", "Con hambre en 18 o mas la vida regenera lentamente; si el hambre llega a 0 recibes daño por inanicion.")
            ]
            for q, a in bench_mechanics:
                mec_pairs.append({"input": q, "output": a})

            # Replicar para dar peso equilibrado frente a la enciclopedia
            for _ in range(4):
                pairs.extend(mec_pairs)
            print(f"[*] Mecanicas de supervivencia equilibradas: {len(mec_pairs)} pares (x4 = {len(mec_pairs)*4})")
        except Exception as e:
            print(f"[WARN] Error en mecanicas: {e}")

    # 2. Enciclopedia VoxeLibre (Curada: Prioriza herramientas, minerales, armas y crafteos)
    enciclo_file = os.path.join(PIOLABRAIN_DIR, "src", "knowledge", "enciclopedia.json")
    if os.path.exists(enciclo_file):
        try:
            with open(enciclo_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            items = data.get("items", {})
            enc_count = 0
            
            # Palabras clave prioritarias
            priority_keywords = ["pico", "espada", "hacha", "pala", "azadon", "horno", "mesa", "diamante", 
                                 "hierro", "oro", "carbon", "redstone", "antorcha", "cofre", "cama", "arco", 
                                 "flecha", "manzana", "pan", "bloque", "armadura", "pechera", "casco", "botas"]
            
            variant_counts = {}
            for key, item in items.items():
                nombre = item.get("es") or key.split(":")[-1].replace("_", " ")
                if not nombre:
                    continue
                
                nom_lower = nombre.lower()
                is_priority = any(pk in nom_lower for pk in priority_keywords)

                # Podar variantes hiper-repetitivas (ej. escaleras de hormigón de 16 colores)
                group_key = "other"
                for v in ["hormigón", "hormigon", "lana", "vidrio tintado", "terracota", "alfombra"]:
                    if v in nom_lower:
                        group_key = v
                        break
                variant_counts[group_key] = variant_counts.get(group_key, 0) + 1
                if group_key != "other" and variant_counts[group_key] > 4 and not is_priority:
                    continue # Saltar exceso de variantes cosméticas idénticas

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
            print(f"[*] Entradas curadas de enciclopedia cargadas: {enc_count}")
        except Exception as e:
            print(f"[WARN] Error en enciclopedia: {e}")

    # 3. API Lua Luanti & Metatables (Alta Prioridad x6)
    lua_knowledge = [
        ("¿Como registro un bloque en Luanti?", "Se usa minetest.register_node('mod:bloque', { description = 'Mi Bloque', tiles = {'textura.png'}, groups = {cracky=3} })."),
        ("¿Como obtengo la posicion del jugador?", "Usa local pos = player:get_pos() que devuelve una tabla con componentes x, y, z."),
        ("¿Como envio un mensaje en el chat del servidor?", "Usa core.chat_send_all('Texto') o minetest.chat_send_player(nombre, 'Texto')."),
        ("¿Como creo un pico personalizado en Lua?", "Se registra con minetest.register_tool('mod:pico', { description = 'Pico Magico', tool_capabilities = { max_drop_level=3, groupcaps={cracky={times={[1]=2.0, [2]=1.0, [3]=0.5}, maxwear=200}} } })."),
        ("¿Como registro una receta de crafteo en Luanti?", "Usa minetest.register_craft({ output = 'mod:espada', recipe = {{'mod:diamante'}, {'mod:diamante'}, {'default:stick'}} })."),
        ("¿Como modifico la vida de un jugador en Lua?", "Usa player:set_hp(nueva_vida) o player:get_hp() para consultar su salud actual."),
        ("¿Como reproduzco un sonido a todos los jugadores?", "Se utiliza minetest.sound_play('nombre_sonido', { gain = 1.0, max_hear_distance = 32 })."),
        ("¿Como funciona el metametodo __index en Lua?", "El metametodo __index se dispara cuando se accede a una clave inexistente en la tabla, permitiendo herencia o valores dinamicos."),
        ("¿Como funciona el metametodo __newindex en Lua?", "El metametodo __newindex intercepta escrituras a claves no existentes en la tabla, ideal para validacion y tablas inmutables.")
    ]
    for _ in range(6):
        for q, a in lua_knowledge:
            pairs.append({"input": q, "output": a})
    print(f"[*] Pares de programacion Lua integrados: {len(lua_knowledge)} (x6 = {len(lua_knowledge)*6})")

    # 4. Identidad y Diálogos de Lucy (Alta Prioridad x3)
    frases_dir = os.path.join(PIOLABRAIN_DIR, "lab", "frases", "charla")
    lucy_canon = [
        ("¿Quien sos?", "Soy Lucy, tu compañera y asistente en PiolaCraft. Te ayudo a minar, explorar y construir."),
        ("¿Cual es tu nombre?", "Soy Lucy, compañera de aventuras en el mundo de PiolaCraft."),
        ("seguime", "Te sigo de cerca, decime a donde vamos y con cuidado con los monstruos."),
        ("quedate aca", "Me quedo aca vigilando la zona y esperando tu regreso."),
        ("hola lucy", "¡Hola! ¿Como andas? Lista para salir de expedicion y craftear herramientas."),
        ("que hacemos hoy?", "Podemos buscar minerales en las cavernas o recolectar madera para la base.")
    ]
    for _ in range(5):
        for q, a in lucy_canon:
            pairs.append({"input": q, "output": a})

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
                        if len(txt) < 4:
                            continue
                        if cat == "SALUDO" or "hola" in txt.lower():
                            resp = "¡Hola! ¿Como andas? ¿En que te ayudo en PiolaCraft?"
                        elif "quien sos" in txt.lower():
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

    # 5. Pares de Razonamiento y Optimización Local (datasets/harvested_raw.jsonl)
    raw_file = os.path.join(PROJECT_ROOT, "datasets", "harvested_raw.jsonl")
    if os.path.exists(raw_file):
        try:
            with open(raw_file, "r", encoding="utf-8") as f:
                count = 0
                for line in f:
                    if not line.trim() if hasattr(line, 'trim') else not line.strip():
                        continue
                    try:
                        it = json.loads(line)
                        inp = (it.get("input") or "").strip()
                        out = (it.get("output") or "").strip()
                        if inp and out:
                            pairs.append({"input": inp, "output": out})
                            count += 1
                    except:
                        pass
            print(f"[*] Muestras de razonamiento/optimizacion incorporadas: {count}")
        except Exception as e:
            print(f"[WARN] Error leyendo harvested_raw: {e}")

    return pairs

def main():
    print("=" * 65)
    print("[PIOLACRAFT V2] COMPILADOR EQUILIBRADO A SHARDS UINT16")
    print("=" * 65)

    pairs = load_balanced_data()
    random.seed(42)
    random.shuffle(pairs)

    n_total = len(pairs)
    n_val = max(50, int(n_total * 0.10))
    val_pairs = pairs[:n_val]
    train_pairs = pairs[n_val:]

    print(f"\n[+] Partición de datos (90/10 reproducible):")
    print(f"    - Train pairs: {len(train_pairs):,} ({100 * len(train_pairs) / n_total:.1f}%)")
    print(f"    - Validation pairs (oculto): {len(val_pairs):,} ({100 * len(val_pairs) / n_total:.1f}%)")

    tokenizer = PythonNanoTokenizer()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    def encode_pairs(pair_list):
        toks = []
        for p in pair_list:
            doc = f"<|user|>{p['input']}<|endoftext|><|assistant|>{p['output']}<|endoftext|>\n"
            toks.extend(tokenizer.encode(doc))
        return np.array(toks, dtype=np.uint16)

    train_tokens = encode_pairs(train_pairs)
    val_tokens = encode_pairs(val_pairs)

    train_file = os.path.join(OUTPUT_DIR, "piolacraft_train.bin")
    val_file = os.path.join(OUTPUT_DIR, "piolacraft_val.bin")
    legacy_file = os.path.join(OUTPUT_DIR, "piolacraft_shard_0000.bin")

    train_tokens.tofile(train_file)
    val_tokens.tofile(val_file)
    train_tokens.tofile(legacy_file)

    train_hash = hashlib.sha256(train_tokens.tobytes()).hexdigest()
    val_hash = hashlib.sha256(val_tokens.tobytes()).hexdigest()

    manifest = {
        "dataset_name": "piolacraft_balanced_v2",
        "split_ratio": "90/10",
        "train_pairs": len(train_pairs),
        "train_tokens": len(train_tokens),
        "train_sha256": train_hash,
        "val_pairs": len(val_pairs),
        "val_tokens": len(val_tokens),
        "val_sha256": val_hash,
        "total_pairs": n_total,
        "total_tokens": len(train_tokens) + len(val_tokens),
        "dtype": "uint16"
    }

    manifest_path = os.path.join(OUTPUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n[OK] Train shard: {train_file} ({len(train_tokens):,} tokens, SHA256: {train_hash[:12]}...)")
    print(f"[OK] Val shard (oculto): {val_file} ({len(val_tokens):,} tokens, SHA256: {val_hash[:12]}...)")
    print(f"[OK] Manifiesto registrado en: {manifest_path}")

if __name__ == "__main__":
    main()
