import json
import os
import random
from collections import Counter

ENCICLOPEDIA = r"C:\Users\totol\Desktop\piolabrain\src\knowledge\enciclopedia.json"
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "test_crafteo_v1.jsonl")
MAX_PROF = 4

d = json.load(open(ENCICLOPEDIA, encoding="utf-8"))
items, recetas, grupos = d["items"], d["recetas"], d["grupos"]


def nombre(i):
    if i.startswith("group:"):
        return grupos.get(i[6:], i[6:])
    return (items.get(i) or {}).get("es") or i.split(":")[-1].replace("_", " ")


def elegir(i, camino):
    variantes = [v for v in recetas.get(i) or [] if not any(x in camino or x == i for x in v["items"])]
    if not variantes:
        return None
    variantes.sort(key=lambda v: (sum(x.startswith("group:") for x in v["items"]), len(v["items"])))
    return variantes[0]


def construir(objetivo):
    usadas = {}

    def rec(i, prof, camino):
        if i in usadas or i.startswith("group:") or prof >= MAX_PROF:
            return
        v = elegir(i, camino)
        if v is None:
            return
        usadas[i] = v
        for x in sorted(set(v["items"])):
            rec(x, prof + 1, camino | {i})

    rec(objetivo, 0, frozenset())
    return usadas


def total(i, usadas, pila=()):
    if i in pila:
        raise ValueError("ciclo")
    if i not in usadas:
        return Counter({i: 1})
    t = Counter()
    for x in usadas[i]["items"]:
        t += total(x, usadas, pila + (i,))
    return t


def profundidad(i, usadas):
    if i not in usadas:
        return 0
    return 1 + max(profundidad(x, usadas) for x in usadas[i]["items"])


def linea(salida, v):
    partes = ", ".join(f"{n} {nombre(x)}" for x, n in sorted(Counter(v["items"]).items(), key=lambda p: nombre(p[0])))
    horno = " (en horno)" if v.get("metodo") == "cooking" else ""
    return f"- {nombre(salida)}{horno}: {partes}"


def armar(objetivo, rng):
    usadas = construir(objetivo)
    if objetivo not in usadas:
        return None
    try:
        base = total(objetivo, usadas)
    except ValueError:
        return None
    prof = profundidad(objetivo, usadas)
    if prof < 2 or len(base) < 2:
        return None
    arbol = set(usadas) | {x for v in usadas.values() for x in v["items"]}
    nombres_arbol = {nombre(x) for x in arbol}
    candidatos = [k for k in recetas if k not in arbol and nombre(k) not in nombres_arbol and (items.get(k) or {}).get("es")]
    distractores = {}
    for k in rng.sample(candidatos, min(3, len(candidatos))):
        distractores[k] = recetas[k][0]
    todos = arbol | set(distractores) | {x for v in distractores.values() for x in v["items"]}
    por_nombre = {}
    for x in todos:
        por_nombre.setdefault(nombre(x).lower(), set()).add(x)
    if any(len(ids) > 1 for ids in por_nombre.values()):
        return None
    return usadas, distractores, base, prof


def main():
    rng = random.Random(42)
    objetivos = sorted(k for k in recetas if (items.get(k) or {}).get("es") and (items.get(k) or {}).get("oculto") is not True)
    rng.shuffle(objetivos)
    cupos = {"prof2": 10, "prof3mas": 10, "multiplicado": 10}
    preguntas = []
    for obj in objetivos:
        if not any(cupos.values()):
            break
        r = armar(obj, rng)
        if r is None:
            continue
        usadas, distractores, base, prof = r
        if cupos["multiplicado"] and prof in (2, 3) and len(preguntas) % 3 == 2:
            grupo, k = "multiplicado", rng.randint(2, 4)
        elif prof == 2 and cupos["prof2"]:
            grupo, k = "prof2", 1
        elif prof >= 3 and cupos["prof3mas"]:
            grupo, k = "prof3mas", 1
        elif cupos["multiplicado"] and prof in (2, 3):
            grupo, k = "multiplicado", rng.randint(2, 4)
        else:
            continue
        cupos[grupo] -= 1
        lineas = [linea(s, v) for s, v in usadas.items()] + [linea(s, v) for s, v in distractores.items()]
        rng.shuffle(lineas)
        prompt = (
            "Estas en un juego de crafteo. Estas son TODAS las recetas disponibles. "
            "Cada receta produce exactamente 1 unidad y consume los ingredientes indicados; el horno no necesita combustible.\n"
            + "\n".join(lineas)
            + "\nUn material es BASE si no tiene receta en esta lista.\n"
            f"Pregunta: cuantas unidades de cada material base hacen falta en total para fabricar {k} {nombre(obj)}?\n"
            "Pensa paso a paso. Al final escribi una sola linea que empiece con RESPUESTA: y liste cada material base "
            "con su cantidad total, separados por punto y coma. Ejemplo del formato, con materiales inventados:\n"
            "RESPUESTA: Piedra lunar = 6; Polvo de estrella = 2"
        )
        respuesta = {nombre(x): n * k for x, n in sorted(base.items(), key=lambda p: nombre(p[0]))}
        preguntas.append({"id": f"crafteo_{len(preguntas):03d}", "grupo": grupo, "objetivo": obj,
                          "profundidad": prof, "cantidad": k, "prompt": prompt, "respuesta": respuesta})
    with open(SALIDA, "w", encoding="utf-8") as f:
        for p in preguntas:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    print("preguntas:", len(preguntas), "| por grupo:", dict(Counter(p["grupo"] for p in preguntas)))
    print("profundidades:", dict(Counter(p["profundidad"] for p in preguntas)))


if __name__ == "__main__":
    main()
