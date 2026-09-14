// [PiolaBrain G1] Exporta las frases de la fabrica de Lucy como JSONL por stdout. Corre DENTRO del servicio de
// Railway (la base solo se ve por la red interna), y el laboratorio lo llama asi:
//   railway ssh -- node scripts/exportar_lucy_frases.mjs --desde <ultimo id> --max 5000 > crudo.jsonl
// No imprime variables ni credenciales: solo filas completadas y una linea final "#FIN".
import pg from 'pg';

const arg = (k, def) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const desde = Number(arg('desde', '0'));
const max = Math.min(20000, Number(arg('max', '5000')));

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('#ERROR sin DATABASE_URL');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: url.includes('railway.internal') ? false : { rejectUnauthorized: false } });
try {
  const { rows } = await pool.query(
    `SELECT id, semilla, dicho_json, frases_json, descartadas, version_semillas, model, usage_json
     FROM lucy_frases_jobs WHERE status='completed' AND id > $1 ORDER BY id ASC LIMIT $2`,
    [desde, max]
  );
  let hasta = desde;
  for (const r of rows) {
    hasta = Math.max(hasta, Number(r.id));
    const usage = r.usage_json ? JSON.parse(r.usage_json) : null;
    process.stdout.write(
      JSON.stringify({
        id: Number(r.id),
        semilla: r.semilla,
        dicho: JSON.parse(r.dicho_json),
        frases: JSON.parse(r.frases_json || '[]'),
        descartadas: r.descartadas,
        version: r.version_semillas,
        modelo: r.model,
        tokens: usage ? usage.total_tokens ?? null : null,
      }) + '\n'
    );
  }
  const cuentas = await pool.query(
    `SELECT status, count(*)::int AS n FROM lucy_frases_jobs GROUP BY status ORDER BY status`
  );
  const estado = Object.fromEntries(cuentas.rows.map((x) => [x.status, x.n]));
  console.log(`#FIN hasta=${hasta} n=${rows.length} estado=${JSON.stringify(estado)}`);
} catch (e) {
  console.log(`#ERROR ${String(e?.message ?? e).slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
