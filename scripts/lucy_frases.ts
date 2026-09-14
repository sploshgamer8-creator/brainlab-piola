/**
 * [PiolaBrain, plan v5 G1] LA FABRICA REAPUNTADA A LUCY.
 *
 * Con HARVEST_MODE=lucy el worker deja de pedir pares tecnicos para OneBrain y pide FRASES DE JUGADORES
 * con su significado fijado ANTES: cada tarea es una semilla (un formulario `Dicho` de PiolaBrain armado
 * desde sus listas, en `lucy_semillas.json`) y Groq solo escribe maneras distintas de decir eso. La
 * etiqueta es cierta por construccion; el laboratorio de PiolaBrain re-valida cada frase con su propio
 * validador antes de usarla (lab/fabrica/importar_lucy.ts).
 *
 * VA A OTRA TABLA (`lucy_frases_jobs`), a proposito: tres lectores de OneBrain (dataset_builder,
 * shard_synchronizer, autonomous_flywheel) toman TODO `teacher_pool_jobs` como pares input/output.
 *
 * Groq pone las palabras, nunca la verdad: aca no hay ni un hecho del juego, solo formas de hablar.
 */
import fs from 'fs';
import path from 'path';

export interface SemillaLucy {
  id: string;
  categoria: string;
  peso: number;
  significado: string;
  dicho: unknown;
  menciona: string[] | null;
}

export interface TareaLucy {
  id: number | string;
  semilla: string;
  significado: string;
  menciona: string[] | null;
  count: number;
  attempts: number;
}

let cargadas: { version: string; semillas: SemillaLucy[] } | null = null;

export function semillasLucy(): { version: string; semillas: SemillaLucy[] } {
  if (cargadas) return cargadas;
  const ruta = process.env.LUCY_SEMILLAS || path.resolve(process.cwd(), 'scripts/lucy_semillas.json');
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (!Array.isArray(datos?.semillas) || datos.semillas.length === 0) throw new Error(`sin semillas en ${ruta}`);
  cargadas = { version: String(datos.version), semillas: datos.semillas };
  return cargadas;
}

/** Una semilla al azar segun su peso. */
export function elegirSemilla(azar: () => number = Math.random): SemillaLucy {
  const { semillas } = semillasLucy();
  const total = semillas.reduce((s, x) => s + x.peso, 0);
  let r = azar() * total;
  for (const s of semillas) {
    r -= s.peso;
    if (r <= 0) return s;
  }
  return semillas[semillas.length - 1];
}

const SISTEMA = `Escribis frases de chat reales de jugadores de un juego tipo Minecraft (VoxeLibre) que estan cerca de una NPC llamada Lucy. Los jugadores son mayormente chicos y adolescentes de Argentina, y tambien de otros paises de habla hispana.
Varia la forma: voseo (veni, corta), tuteo (ven, corta), usted, infinitivo, "podes...?", "quiero que...", sin tildes, mayusculas raras, abreviaturas (q, xq, pls, porfa), letras repetidas (veniii), errores leves de tipeo, palabras de Minecraft en ingles (creeper, craftear, farmear). A veces nombran a Lucy y a veces no.
Frases cortas como en un chat, que suenen reales y no rebuscadas.
TODAS las frases tienen que decir EXACTAMENTE lo que se pide: ni mas ni menos. No agregues otro pedido, otra pregunta, un saludo ni un agradecimiento que no se pidan. No numeres ni expliques.
Devolves SOLO JSON: {"frases": ["...", "..."]}`;

export function mensajesLucy(t: TareaLucy): Array<{ role: string; content: string }> {
  const nombra = t.menciona && t.menciona.length
    ? ` Cada frase tiene que nombrar la cosa (${t.menciona.slice(0, 4).join(', ')}, o como la diria un jugador).`
    : '';
  return [
    { role: 'system', content: SISTEMA },
    { role: 'user', content: `Escribi ${t.count} frases distintas. Lo que tienen que decir: ${t.significado}.${nombra} [tarea ${t.id}]` },
  ];
}

/** Minusculas, sin tildes y sin signos: la misma idea que `normalizar` de PiolaBrain. */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombra la cosa: una palabra de la lista, o su raiz (plurales, diminutivos, "arbolito"). */
function nombra(frase: string, menciona: string[]): boolean {
  const n = ` ${normalizarTexto(frase)} `;
  return menciona.some((p) => {
    const q = normalizarTexto(p);
    if (!q) return false;
    if (n.includes(q)) return true;
    const raiz = q.length > 5 ? q.slice(0, q.length - 2) : q.length > 3 ? q.slice(0, 4) : null;
    return raiz !== null && n.includes(` ${raiz}`);
  });
}

/**
 * Lo que vuelve de Groq -> frases que se pueden guardar. Filtro barato: el de verdad es el de PiolaBrain.
 * Tira: lo que no es texto, lo muy corto o muy largo, repetidas dentro de la tarea, JSON colado, y las que
 * no nombran la cosa cuando la semilla la pide.
 */
export function frasesValidas(contenido: string, t: TareaLucy): { frases: string[]; descartadas: number } {
  let texto = contenido.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let crudo: any = null;
  try {
    crudo = JSON.parse(texto);
  } catch {
    const m = texto.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        crudo = JSON.parse(m[0]);
      } catch {}
    }
  }
  const lista: unknown[] = Array.isArray(crudo?.frases) ? crudo.frases : Array.isArray(crudo) ? crudo : [];
  const vistas = new Set<string>();
  const frases: string[] = [];
  let descartadas = 0;
  for (const x of lista) {
    if (typeof x !== 'string') {
      descartadas++;
      continue;
    }
    const f = x.trim();
    const n = normalizarTexto(f);
    const mal =
      f.length < 2 ||
      f.length > 160 ||
      !n ||
      vistas.has(n) ||
      /[{}]|"frases"/.test(f) ||
      (t.menciona && t.menciona.length > 0 && !nombra(f, t.menciona));
    if (mal) {
      descartadas++;
      continue;
    }
    vistas.add(n);
    frases.push(f);
  }
  return { frases, descartadas };
}

export function lucyStore(pool: any, modelo: string, carriles: number) {
  return {
    async preparar() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS lucy_frases_jobs (
          id SERIAL PRIMARY KEY,
          semilla TEXT NOT NULL,
          significado TEXT NOT NULL,
          dicho_json TEXT NOT NULL,
          menciona_json TEXT,
          count INTEGER DEFAULT 8,
          model TEXT,
          version_semillas TEXT,
          status TEXT DEFAULT 'queued',
          frases_json TEXT,
          descartadas INTEGER DEFAULT 0,
          usage_json TEXT,
          attempts INTEGER DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS lucy_frases_jobs_status ON lucy_frases_jobs (status, id);
      `);
    },
    async claim(): Promise<TareaLucy | null> {
      const { rows } = await pool.query(
        `UPDATE lucy_frases_jobs SET status='running', updated_at=now()
         WHERE id = (SELECT id FROM lucy_frases_jobs WHERE status='queued' ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, semilla, significado, menciona_json, count, attempts`
      );
      const r = rows[0];
      if (!r) return null;
      return { id: r.id, semilla: r.semilla, significado: r.significado, menciona: r.menciona_json ? JSON.parse(r.menciona_json) : null, count: r.count, attempts: r.attempts };
    },
    async complete(t: TareaLucy, frases: string[], descartadas: number, usage: any) {
      await pool.query(
        "UPDATE lucy_frases_jobs SET status='completed', frases_json=$1, descartadas=$2, usage_json=$3, updated_at=now() WHERE id=$4",
        [JSON.stringify(frases), descartadas, usage ? JSON.stringify(usage) : null, t.id]
      );
    },
    async release(t: TareaLucy) {
      await pool.query("UPDATE lucy_frases_jobs SET status='queued', updated_at=now() WHERE id=$1", [t.id]);
    },
    async fail(t: TareaLucy, mensaje: string, maxIntentos: number) {
      await pool.query(
        `UPDATE lucy_frases_jobs SET attempts=attempts+1, last_error=$2, updated_at=now(),
           status=CASE WHEN attempts+1 >= $1 THEN 'failed' ELSE 'queued' END
         WHERE id=$3`,
        [maxIntentos, mensaje.slice(0, 500), t.id]
      );
    },
    async requeueStale(minutos: number): Promise<number> {
      const r = await pool.query(
        "UPDATE lucy_frases_jobs SET status='queued', updated_at=now() WHERE status='running' AND updated_at < now() - make_interval(mins => $1)",
        [minutos]
      );
      return r.rowCount ?? 0;
    },
    async seedIfLow() {
      const bajo = Math.max(12, carriles * 3);
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM lucy_frases_jobs WHERE status='queued'");
      const enCola: number = rows[0].n;
      if (enCola >= bajo) return;
      const { version } = semillasLucy();
      const nuevas = Array.from({ length: bajo * 2 - enCola }, () => elegirSemilla());
      await pool.query(
        `INSERT INTO lucy_frases_jobs (semilla, significado, dicho_json, menciona_json, count, model, version_semillas, status)
         SELECT s, g, d, m, 8, $5, $6, 'queued' FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS u(s, g, d, m)`,
        [
          nuevas.map((x) => x.id),
          nuevas.map((x) => x.significado),
          nuevas.map((x) => JSON.stringify(x.dicho)),
          nuevas.map((x) => (x.menciona ? JSON.stringify(x.menciona) : null)),
          modelo,
          version,
        ]
      );
      console.log(`[seeder lucy] cola en ${enCola}; +${nuevas.length} tareas (semillas ${version})`);
    },
  };
}
