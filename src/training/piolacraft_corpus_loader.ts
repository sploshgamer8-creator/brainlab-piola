/**
 * 🎮 PIOLACRAFT CORPUS LOADER (Completo: Enciclopedia + 70 Mecánicas + Diálogos de Lucy + Lua)
 */

import fs from 'fs';
import path from 'path';
import { DatasetItem } from '../core/types';

const PIOLABRAIN_DIR = 'C:\\Users\\totol\\Desktop\\piolabrain';

export function loadPiolacraftCorpus(): DatasetItem[] {
  const corpus: DatasetItem[] = [];
  const now = new Date().toISOString();

  // 1. MECÁNICAS DE JUEGO (mecanicas.json)
  const mecanicasPath = path.join(PIOLABRAIN_DIR, 'src', 'knowledge', 'mecanicas.json');
  if (fs.existsSync(mecanicasPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(mecanicasPath, 'utf8'));
      if (Array.isArray(data.mecanicas)) {
        for (const m of data.mecanicas) {
          const tema = m.tema || 'juego';
          const dice = m.dice || '';
          if (!dice) continue;

          let input = `¿Qué pasa con ${m.id.replace(/_/g, ' ')}?`;
          if (m.claves && Array.isArray(m.claves) && m.claves[0]) {
            const principal = m.claves[0][0] || m.id;
            const accion = m.claves[1] ? m.claves[1][0] : '';
            input = accion ? `¿Cómo funciona ${principal} con ${accion}?` : `¿Qué sabés sobre ${principal}?`;
          }

          corpus.push({
            id: `piolacraft_mecanica_${m.id}`,
            category: 'piolacraft_mechanics',
            input,
            output: dice.charAt(0).toUpperCase() + dice.slice(1) + '.',
            source: 'voxelibre_mecanicas',
            approved: true,
            createdAt: now,
            tags: ['piolacraft', 'mecanicas', tema, 'lucy_saber']
          });
        }
      }
    } catch (err: any) {
      console.warn('[PiolacraftCorpus] Error cargando mecanicas.json:', err.message);
    }
  }

  // 2. ENCICLOPEDIA VOXELIBRE (enciclopedia.json)
  const enciclopediaPath = path.join(PIOLABRAIN_DIR, 'src', 'knowledge', 'enciclopedia.json');
  if (fs.existsSync(enciclopediaPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(enciclopediaPath, 'utf8'));
      if (data.items && typeof data.items === 'object') {
        for (const [key, item] of Object.entries<any>(data.items)) {
          const nombre = item.es || key.split(':').pop()?.replace(/_/g, ' ');
          if (!nombre) continue;

          if (item.ayuda && item.ayuda.length > 10) {
            corpus.push({
              id: `piolacraft_item_${key.replace(/[:_]/g, '_')}`,
              category: 'piolacraft_enciclopedia',
              input: `¿Qué es ${nombre}?`,
              output: `${nombre}: ${item.ayuda.trim()}`,
              source: 'voxelibre_enciclopedia',
              approved: true,
              createdAt: now,
              tags: ['piolacraft', 'enciclopedia', 'items', item.tipo || 'general']
            });
          }

          if (item.uso && item.uso.length > 10) {
            corpus.push({
              id: `piolacraft_uso_${key.replace(/[:_]/g, '_')}`,
              category: 'piolacraft_enciclopedia',
              input: `¿Cómo se usa ${nombre}?`,
              output: item.uso.trim(),
              source: 'voxelibre_enciclopedia',
              approved: true,
              createdAt: now,
              tags: ['piolacraft', 'uso', 'mecanicas']
            });
          }

          if (Array.isArray(item.suelta) && item.suelta.length > 0) {
            const drops = item.suelta.map((s: string) => s.split(':').pop()?.replace(/_/g, ' ')).join(', ');
            corpus.push({
              id: `piolacraft_drop_${key.replace(/[:_]/g, '_')}`,
              category: 'piolacraft_enciclopedia',
              input: `¿Qué suelta ${nombre}?`,
              output: `${nombre} suelta: ${drops}.`,
              source: 'voxelibre_enciclopedia',
              approved: true,
              createdAt: now,
              tags: ['piolacraft', 'drops']
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[PiolacraftCorpus] Error cargando enciclopedia.json:', err.message);
    }
  }

  // 3. BANCOS DE DIÁLOGO DE JUGADORES (banco.json y dev4_banco.json)
  const charlaFiles = ['banco.json', 'dev4_banco.json'];
  for (const fName of charlaFiles) {
    const fPath = path.join(PIOLABRAIN_DIR, 'lab', 'frases', 'charla', fName);
    if (!fs.existsSync(fPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      const itemsList = Array.isArray(raw) ? raw : (raw.mensajes || []);
      for (let i = 0; i < itemsList.length; i++) {
        const m = itemsList[i];
        const txt = (m.texto || m.mensaje || '').trim();
        const cat = m.categoria || 'social';
        if (!txt || txt.length < 3) continue;

        let resp = 'Entendido.';
        if (cat === 'SALUDO' || txt.includes('hola')) resp = '¡Hola! ¿Cómo andás? ¿En qué te ayudo en PiolaCraft?';
        else if (cat === 'QUIEN_SOS' || txt.includes('quien sos') || txt.includes('quién sos')) resp = 'Soy Lucy, tu compañera en PiolaCraft.';
        else if (cat === 'SEGUIME' || txt.includes('seguime')) resp = 'Te sigo, decime a dónde vamos.';
        else if (cat === 'QUEDATE' || txt.includes('quedate')) resp = 'Me quedo acá vigilando la zona.';
        else if (cat === 'TIEMPO' || txt.includes('dia') || txt.includes('dura')) resp = 'Un día entero dura 20 minutos de verdad en el juego.';
        else if (cat === 'NO_SABE') resp = 'No tengo certeza de eso, tendría que comprobarlo en el juego.';
        else resp = `Sobre eso en PiolaCraft: ${txt}`;

        corpus.push({
          id: `piolacraft_charla_${fName}_${i}`,
          category: 'piolacraft_dialogue',
          input: txt,
          output: resp,
          source: `lucy_charla_${fName}`,
          approved: true,
          createdAt: now,
          tags: ['piolacraft', 'lucy', 'dialogo', cat]
        });
      }
    } catch (err: any) {
      console.warn(`[PiolacraftCorpus] Error cargando ${fName}:`, err.message);
    }
  }

  // 4. PROGRAMACIÓN LUA PARA LUANTI
  corpus.push(
    {
      id: 'piolacraft_lua_01',
      category: 'piolacraft_lua',
      input: '¿Cómo registro un bloque en Luanti / VoxeLibre?',
      output: 'Se usa minetest.register_node("mod:bloque", { description = "Mi Bloque", tiles = {"textura.png"}, groups = {cracky=3} })',
      source: 'luanti_docs',
      approved: true,
      createdAt: now,
      tags: ['lua', 'luanti', 'bloques', 'piolacraft']
    },
    {
      id: 'piolacraft_lua_02',
      category: 'piolacraft_lua',
      input: '¿Cómo obtengo la posición del jugador en PiolaCraft?',
      output: 'Usa local pos = player:get_pos() que devuelve una tabla con {x, y, z}.',
      source: 'luanti_docs',
      approved: true,
      createdAt: now,
      tags: ['lua', 'luanti', 'jugador', 'piolacraft']
    },
    {
      id: 'piolacraft_lua_03',
      category: 'piolacraft_lua',
      input: '¿Cómo hago hablar a un NPC o mandar un mensaje en el chat?',
      output: 'Para enviar un mensaje global usa core.chat_send_all("Texto") o minetest.chat_send_player(nombre, "Texto").',
      source: 'luanti_docs',
      approved: true,
      createdAt: now,
      tags: ['lua', 'luanti', 'chat', 'npc']
    }
  );

  return corpus;
}
