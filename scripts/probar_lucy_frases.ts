/**
 * [PiolaBrain G1] Prueba SIN red ni base de la fabrica reapuntada: carga las semillas, arma el pedido de
 * una tarea y pasa por el filtro una respuesta inventada con casos buenos y malos. No gasta Groq.
 *   npx tsx scripts/probar_lucy_frases.ts
 */
import { elegirSemilla, frasesValidas, mensajesLucy, semillasLucy } from './lucy_frases.js';

let fallas = 0;
const esperar = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallas++;
  console.log(`${ok ? 'OK ' : 'MAL'} ${nombre}${detalle ? ' · ' + detalle : ''}`);
};

const { version, semillas } = semillasLucy();
esperar('semillas cargadas', semillas.length > 100, `${semillas.length} semillas, version ${version}`);

const porCategoria: Record<string, number> = {};
let s = 1;
const azar = () => ((s = (s * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 5000; i++) {
  const x = elegirSemilla(azar);
  porCategoria[x.categoria] = (porCategoria[x.categoria] ?? 0) + 1;
}
const pct = (k: string) => Math.round(((porCategoria[k] ?? 0) / 5000) * 100);
esperar('reparto por peso', Math.abs(pct('PREGUNTA') - 45) <= 3 && Math.abs(pct('ORDEN') - 18) <= 3, JSON.stringify(porCategoria));

const arbol = semillas.find((x) => x.id === 'ORDEN|ROMPER|arbol|mira')!;
const tarea = { id: 1, semilla: arbol.id, significado: arbol.significado, menciona: arbol.menciona, count: 8, attempts: 0 };
const msgs = mensajesLucy(tarea);
esperar('pedido armado', msgs.length === 2 && msgs[1].content.includes('arbol'), msgs[1].content.slice(0, 140));

const respuesta = JSON.stringify({
  frases: [
    'lucy corta ese arbol',
    'cortá ese árbol porfa',
    'podes talar esos arbolitos?',
    'rompe eso',            // no nombra el arbol: se tira
    'lucy corta ese arbol', // repetida: se tira
    '',                     // vacia: se tira
    42,                     // no es texto: se tira
    'tala el tree ese de ahi',
  ],
});
const r = frasesValidas('```json\n' + respuesta + '\n```', tarea);
esperar('filtro', r.frases.length === 4 && r.descartadas === 4, `quedan ${r.frases.length} (${r.frases.join(' | ')}), descartadas ${r.descartadas}`);

const saludo = semillas.find((x) => x.id === 'SALUDO')!;
const r2 = frasesValidas('{"frases":["hola lucy","buenaaas","hey"]}', { id: 2, semilla: saludo.id, significado: saludo.significado, menciona: saludo.menciona, count: 3, attempts: 0 });
esperar('sin cosa que nombrar no exige mencion', r2.frases.length === 3, r2.frases.join(' | '));

esperar('respuesta rota no revienta', frasesValidas('no es json', tarea).frases.length === 0);

console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
