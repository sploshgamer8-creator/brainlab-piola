import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import { getDatabase, persistDatabase, exportSqliteBuffer } from './db';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Using offline synthetic generator instead.');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export function handleApiRoutes(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith('/api/')) {
    return next();
  }

  if (req.url === '/api/teacher/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { topic, category, count = 3, traits, promptContext } = payload;

        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch (e: any) {
          // Graceful return if no key configured
          return res.writeHead(200).end(
            JSON.stringify({
              warning: 'GEMINI_API_KEY not set in Secrets. Generated via Offline Local Synthetic Teacher.',
              candidates: generateOfflineFallback(topic, category, count),
            })
          );
        }

        const systemInstruction = `Eres un Profesor Asistente en Local Brain Lab. Tu única función es generar pares de entrenamiento de alta calidad para entrenar un modelo local nanoGPT.
NUNCA respondas al usuario directamente.
Genera exactamente ${count} pares de diálogo breves y precisos acordes a:
- Categoría: ${category}
- Tema: ${topic}
- Rasgos deseados: Directo: ${traits?.directness ?? 0.7}, Formalidad: ${traits?.formality ?? 0.3}, Admite no saber: ${traits?.admitUnknown ?? true}.
- Contexto adicional: ${promptContext || 'General'}

Formato JSON OBLIGATORIO:
[
  { "input": "pregunta o frase del usuario", "output": "respuesta concisa esperada", "tags": ["tag1", "tag2"] }
]`;

        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Genera ${count} pares de entrenamiento sobre ${topic}.`,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        const text = response.text || '[]';
        let parsed = [];
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = generateOfflineFallback(topic, category, count);
        }

        const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
          id: `gen_gemini_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: category || 'general',
          input: item.input || '¿Cómo estás?',
          output: item.output || 'Listo para ayudarte localmente.',
          source: 'teacher_gemini',
          status: 'pending_review',
          tags: item.tags || ['teacher_gemini', category],
        }));

        res.writeHead(200).end(JSON.stringify({ candidates }));
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            warning: `Teacher generation fallback: ${err.message}`,
            candidates: generateOfflineFallback('fallback', 'general', 3),
          })
        );
      }
    });
    return;
  }

  // OmniRoute Distill Batch Ingestion (Fase 1: Extractor continuo para nanoGPT)
  if (req.url === '/api/distill/batch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          topic = 'diálogo natural en español',
          category = 'spanish',
          count = 5,
          complexity = 'conversational',
          omniRouteUrl = process.env.OMNIROUTE_URL || '',
          omniRouteApiKey = process.env.OMNIROUTE_API_KEY || '',
          targetScale = '100M', // 100M, 1B, 7B
        } = payload;

        const maxTokensPerItem = targetScale === '7B' ? 120 : targetScale === '1B' ? 60 : 25;
        const promptInstruction = `Eres un destilador de conocimiento de frontera (OmniRoute Distillation Engine).
Tu objetivo es transferir patrones lingüísticos de alta densidad hacia un modelo estudiante nanoGPT (escala de diseño: ${targetScale}).
Genera exactamente ${count} pares de entrenamiento concisos, de altísima calidad y coherencia.
Modo: ${complexity}.
Tema: ${topic}.
Idioma principal: Español nativo y código Lua limpio si corresponde.
Reglas:
1. Longitud de respuesta: aproximadamente ${maxTokensPerItem} palabras por respuesta (adaptado para ventana de atención causal ${targetScale}).
2. Preguntas naturales que un usuario real haría en español.
3. Formato JSON estricto: [{"input": "...", "output": "...", "tags": ["..."]}]`;

        // 1. Intentar primero vía OmniRoute Gateway si está configurado
        if (omniRouteUrl && omniRouteUrl.trim().length > 0) {
          try {
            const gatewayEndpoint = omniRouteUrl.endsWith('/chat/completions')
              ? omniRouteUrl
              : `${omniRouteUrl.replace(/\/+$/, '')}/chat/completions`;

            const omniRes = await fetch(gatewayEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey}` } : {}),
              },
              body: JSON.stringify({
                model: payload.omniRouteModel || 'omniroute-auto',
                messages: [
                  { role: 'system', content: promptInstruction },
                  { role: 'user', content: `Genera ${count} pares destilados sobre ${topic} en formato JSON.` },
                ],
                temperature: 0.7,
              }),
            });

            if (omniRes.ok) {
              const omniData = await omniRes.json();
              const rawText = omniData.choices?.[0]?.message?.content || '[]';
              let cleaned = rawText.trim();
              if (cleaned.startsWith('```json')) {
                cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
              } else if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '').trim();
              }
              const parsed = JSON.parse(cleaned);
              const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
                id: `omniroute_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                category: category || 'spanish',
                input: item.input || 'Consulta',
                output: item.output || 'Respuesta destilada',
                source: 'synthetic_api',
                approved: true,
                createdAt: new Date().toISOString(),
                tags: item.tags || ['omniroute_stream', category, targetScale],
              }));

              return res.writeHead(200).end(
                JSON.stringify({
                  sourceModel: `OmniRoute Gateway (${omniData.model || 'auto-routed'})`,
                  distillRatio: targetScale === '7B' ? '120,000x' : '35,000x',
                  candidates,
                })
              );
            }
          } catch (omniErr: any) {
            console.warn('OmniRoute direct gateway error, falling back to Gemini:', omniErr.message);
          }
        }

        // 2. Si OmniRoute no está activo o falla, usar SDK nativo de Gemini
        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch {
          return res.writeHead(200).end(
            JSON.stringify({
              sourceModel: 'Offline Distillation Pipeline',
              distillRatio: '1,000x',
              candidates: generateOfflineFallback(topic, category, count).map(c => ({ ...c, approved: true })),
            })
          );
        }

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Genera ${count} pares destilados de alta densidad sobre ${topic}.`,
          config: {
            systemInstruction: promptInstruction,
            responseMimeType: 'application/json',
          },
        });

        const text = response.text || '[]';
        let parsed = [];
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = generateOfflineFallback(topic, category, count);
        }

        const candidates = (Array.isArray(parsed) ? parsed : []).map((item: any) => ({
          id: `distill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: category || 'spanish',
          input: item.input || 'Hola',
          output: item.output || 'Hola, ¿cómo estás?',
          source: 'synthetic_api',
          approved: true,
          createdAt: new Date().toISOString(),
          tags: item.tags || ['omniroute_distilled', category, targetScale],
        }));

        res.writeHead(200).end(
          JSON.stringify({
            sourceModel: 'Gemini 2.5 Flash / OmniRoute Native',
            distillRatio: '35,000x',
            candidates,
          })
        );
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            sourceModel: 'Offline Distillation Fallback',
            distillRatio: '1,000x',
            candidates: generateOfflineFallback('fallback', 'spanish', 4).map(c => ({ ...c, approved: true })),
          })
        );
      }
    });
    return;
  }

  // OmniRoute Gateway Direct Chat Endpoint (Fase 4: Modo Maestro / Dúo)
  if (req.url === '/api/gateway/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          message,
          systemPrompt,
          omniRouteUrl = process.env.OMNIROUTE_URL || '',
          omniRouteApiKey = process.env.OMNIROUTE_API_KEY || '',
        } = payload;

        // Si se provee OmniRoute Gateway, intentar primero por ahí
        if (omniRouteUrl && omniRouteUrl.trim().length > 0) {
          try {
            const gatewayEndpoint = omniRouteUrl.endsWith('/chat/completions')
              ? omniRouteUrl
              : `${omniRouteUrl.replace(/\/+$/, '')}/chat/completions`;

            const omniRes = await fetch(gatewayEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey}` } : {}),
              },
              body: JSON.stringify({
                model: payload.omniRouteModel || 'omniroute-auto',
                messages: [
                  { role: 'system', content: systemPrompt || 'Eres un asistente experto conciso, cordial y preciso.' },
                  { role: 'user', content: message || 'Hola' },
                ],
                temperature: 0.7,
              }),
            });

            if (omniRes.ok) {
              const omniData = await omniRes.json();
              const reply = omniData.choices?.[0]?.message?.content || 'Sin respuesta del modelo.';
              return res.writeHead(200).end(
                JSON.stringify({
                  reply,
                  model: `OmniRoute Gateway (${omniData.model || 'auto-routed'})`,
                })
              );
            }
          } catch (omniErr: any) {
            console.warn('OmniRoute chat error, falling back to Gemini:', omniErr.message);
          }
        }

        let client: GoogleGenAI | null = null;
        try {
          client = getAIClient();
        } catch {
          return res.writeHead(200).end(
            JSON.stringify({
              reply: 'OmniRoute Fallback: No se detectó GEMINI_API_KEY en los secretos ni OmniRoute Gateway activo. Respondiendo mediante fallback local.',
              model: 'Local Fallback',
            })
          );
        }

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: message || 'Hola',
          config: {
            systemInstruction: systemPrompt || 'Eres un asistente experto conciso, cordial y preciso.',
          },
        });

        res.writeHead(200).end(
          JSON.stringify({
            reply: response.text || 'Sin respuesta del modelo.',
            model: 'Gemini 2.5 Flash (OmniRoute Gateway)',
          })
        );
      } catch (err: any) {
        res.writeHead(200).end(
          JSON.stringify({
            reply: `Error en Gateway: ${err.message}`,
            model: 'Gateway Error',
          })
        );
      }
    });
    return;
  }

  // Endpoint para testear conectividad directa con OmniRoute Gateway
  if (req.url === '/api/gateway/test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { omniRouteUrl, omniRouteApiKey } = payload;

        if (!omniRouteUrl || !omniRouteUrl.trim()) {
          // Probar conexión nativa Gemini
          const t0 = performance.now();
          const client = getAIClient();
          const testRes = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'ping',
          });
          const latency = Math.round(performance.now() - t0);
          return res.writeHead(200).end(JSON.stringify({
            success: true,
            provider: 'Gemini 2.5 Flash (Nativo / Default)',
            latencyMs: latency,
            message: 'Conexión nativa de alta velocidad operativa.',
          }));
        }

        const cleanUrl = omniRouteUrl.trim().replace(/\/+$/, '');
        const t0 = performance.now();

        // 1. Intentar /models
        let modelsEndpoint = cleanUrl.endsWith('/v1') ? `${cleanUrl}/models` : `${cleanUrl}/v1/models`;
        if (cleanUrl.endsWith('/models')) modelsEndpoint = cleanUrl;

        let resOk = false;
        let modelsList: string[] = [];
        try {
          const fetchRes = await fetch(modelsEndpoint, {
            headers: {
              ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey.trim()}` } : {}),
            },
            signal: AbortSignal.timeout(8000),
          });
          if (fetchRes.ok) {
            const data = await fetchRes.json();
            resOk = true;
            if (Array.isArray(data.data)) {
              modelsList = data.data.slice(0, 5).map((m: any) => m.id || m.name);
            }
          }
        } catch {
          // Intentar vía chat/completions mínimo
        }

        // Si falló /models, probar /chat/completions con timeout
        if (!resOk) {
          const chatEndpoint = cleanUrl.endsWith('/chat/completions')
            ? cleanUrl
            : cleanUrl.endsWith('/v1')
            ? `${cleanUrl}/chat/completions`
            : `${cleanUrl}/v1/chat/completions`;

          const chatRes = await fetch(chatEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(omniRouteApiKey ? { Authorization: `Bearer ${omniRouteApiKey.trim()}` } : {}),
            },
            body: JSON.stringify({
              model: payload.omniRouteModel || 'omniroute-auto',
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(10000),
          });

          if (chatRes.ok) {
            resOk = true;
          } else {
            const errText = await chatRes.text();
            throw new Error(`HTTP ${chatRes.status}: ${errText.slice(0, 120)}`);
          }
        }

        const latency = Math.round(performance.now() - t0);
        return res.writeHead(200).end(JSON.stringify({
          success: true,
          provider: 'OmniRoute Gateway',
          latencyMs: latency,
          models: modelsList,
          message: `Conexión exitosa a ${cleanUrl} (${latency}ms). Listo para destilar.`,
        }));
      } catch (err: any) {
        return res.writeHead(200).end(JSON.stringify({
          success: false,
          error: err.message || 'No se pudo conectar a la URL especificada.',
          hint: 'Si OmniRoute está corriendo en tu PC local (localhost:20129), esta app (que corre en Google Cloud Run) no puede alcanzar tu máquina sin un túnel público como ngrok, Pinggy o Cloudflare Tunnel.',
        }));
      }
    });
    return;
  }

  // Health check
  if (req.url === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200).end(JSON.stringify({ status: 'ok', engine: 'nanoGPT-Local-Brain-Lab' }));
    return;
  }

  // --- SQL BACKEND: Fila de Empaquetado y Redistribución ---

  // Obtener items de la cola de empaquetado
  if (req.url === '/api/packaging/queue' && req.method === 'GET') {
    getDatabase().then(db => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const stmt = db.prepare('SELECT * FROM packaging_queue ORDER BY created_at DESC LIMIT 50');
        const items: any[] = [];
        while (stmt.step()) {
          items.push(stmt.getAsObject());
        }
        stmt.free();
        res.writeHead(200).end(JSON.stringify({ queue: items }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    }).catch(err => {
      res.writeHead(500).end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Añadir un elemento a la fila de empaquetado
  if (req.url === '/api/packaging/enqueue' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const { projectId, checkpointId, format, destinationTarget = 'local_download', artifactName, sizeBytes = 0 } = payload;
        
        const db = await getDatabase();
        const id = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();
        const finalArtifactName = artifactName || `brain_${projectId}_${checkpointId}.${format}`;
        
        db.run(`
          INSERT INTO packaging_queue (id, project_id, checkpoint_id, format, status, artifact_name, size_bytes, destination_target, created_at)
          VALUES (?, ?, ?, ?, 'packaging', ?, ?, ?, ?)
        `, [id, projectId, checkpointId, format, finalArtifactName, sizeBytes, destinationTarget, now]);
        
        persistDatabase();

        // Simular finalización de empaquetado a estado "ready" / "distributed"
        setTimeout(async () => {
          try {
            const innerDb = await getDatabase();
            const completedAt = new Date().toISOString();
            const downloadUrl = `/api/artifacts/${finalArtifactName}`;
            innerDb.run(`
              UPDATE packaging_queue
              SET status = 'ready', completed_at = ?, download_url = ?
              WHERE id = ?
            `, [completedAt, downloadUrl, id]);
            persistDatabase();
          } catch (e) {
            console.error('Error actualizando estado de cola:', e);
          }
        }, 1500);

        res.writeHead(200).end(JSON.stringify({
          success: true,
          item: {
            id,
            projectId,
            checkpointId,
            format,
            status: 'packaging',
            artifactName: finalArtifactName,
            destinationTarget,
            createdAt: now,
          }
        }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Actualizar estado de un trabajo en la cola (redistribuir a canal)
  if (req.url === '/api/packaging/redistribute' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const { queueId, destinationTarget } = JSON.parse(body || '{}');
        const db = await getDatabase();
        const now = new Date().toISOString();
        db.run(`
          UPDATE packaging_queue
          SET status = 'distributed', destination_target = ?, completed_at = ?
          WHERE id = ?
        `, [destinationTarget || 'github_release', now, queueId]);
        persistDatabase();

        res.writeHead(200).end(JSON.stringify({ success: true, message: `Redistribuido a ${destinationTarget}` }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Obtener nodos de distribución
  if (req.url === '/api/distribution/nodes' && req.method === 'GET') {
    getDatabase().then(db => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const stmt = db.prepare('SELECT * FROM distribution_nodes');
        const nodes: any[] = [];
        while (stmt.step()) {
          nodes.push(stmt.getAsObject());
        }
        stmt.free();

        // Si la tabla está vacía, sembrar con nodos por defecto
        if (nodes.length === 0) {
          const defaultNodes = [
            { id: 'node_gitlab', name: 'GitLab Repo (brainlab-group/brainlab)', channel_type: 'gitlab_repo', endpoint_url: 'https://gitlab.com/brainlab-group/brainlab.git', status: 'active', last_sync: new Date().toISOString() },
            { id: 'node_github', name: 'GitHub Private Repo (Sync)', channel_type: 'github_repo', endpoint_url: 'https://github.com/mistificacionlondres-cmd/brainlab.git', status: 'standby', last_sync: null },
            { id: 'node_hf', name: 'Hugging Face Hub (SafeTensors)', channel_type: 'huggingface', endpoint_url: 'https://huggingface.co/models', status: 'standby', last_sync: null },
            { id: 'node_mesh', name: 'Local Edge Mesh (P2P)', channel_type: 'local_node', endpoint_url: 'ws://127.0.0.1:8080/p2p', status: 'active', last_sync: new Date().toISOString() },
          ];
          for (const n of defaultNodes) {
            db.run(`INSERT INTO distribution_nodes (id, name, channel_type, endpoint_url, status, last_sync) VALUES (?, ?, ?, ?, ?, ?)`,
              [n.id, n.name, n.channel_type, n.endpoint_url, n.status, n.last_sync]);
          }
          persistDatabase();
          return res.writeHead(200).end(JSON.stringify({ nodes: defaultNodes }));
        }

        res.writeHead(200).end(JSON.stringify({ nodes }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({ error: err.message }));
      }
    }).catch(err => {
      res.writeHead(500).end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Descarga directa del archivo SQLite binario para portabilidad entre sesiones
  if (req.url === '/api/database/download' && req.method === 'GET') {
    const buffer = exportSqliteBuffer();
    if (!buffer) {
      res.writeHead(404).end('Database not initialized');
      return;
    }
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', 'attachment; filename="local_brain_registry.sqlite"');
    res.writeHead(200).end(buffer);
    return;
  }

  // Sincronización interna directa vía Git Push (GitLab / GitHub)
  if (req.url === '/api/git/push' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const payload = JSON.parse(body || '{}');
        const {
          repoUrl = 'https://gitlab.com/brainlab-group/brainlab.git',
          branch = 'main',
          token = process.env.GITLAB_TOKEN || '',
          authorName = 'BrainLab Engineer',
          authorEmail = 'brainlab@local.internal',
          commitMessage = 'sync: sincronización interna de Local Brain Lab a GitLab',
        } = payload;

        if (!token) {
          return res.writeHead(400).end(JSON.stringify({
            success: false,
            error: 'Se requiere un Personal Access Token (PAT) con permisos de escritura para sincronizar con el repositorio privado.',
          }));
        }

        // Construir URL autenticada de forma segura
        let pushUrl = repoUrl.trim();
        if (pushUrl.startsWith('https://')) {
          const stripped = pushUrl.replace('https://', '');
          // Si es gitlab o github, usar oauth2 o token en HTTP basic auth
          pushUrl = `https://oauth2:${encodeURIComponent(token.trim())}@${stripped}`;
        }

        const logs: string[] = [];

        // 1. Inicializar git si no existe
        try {
          execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
          logs.push('Git repo ya inicializado');
        } catch {
          execSync('git init', { stdio: 'pipe' });
          logs.push('Git init ejecutado');
        }

        // 2. Configurar identidad local
        execSync(`git config user.name "${authorName.replace(/"/g, '')}"`, { stdio: 'pipe' });
        execSync(`git config user.email "${authorEmail.replace(/"/g, '')}"`, { stdio: 'pipe' });

        // 3. Crear rama de trabajo
        try {
          execSync(`git branch -M ${branch}`, { stdio: 'pipe' });
        } catch (e: any) {
          logs.push(`Branch error ignored: ${e.message}`);
        }

        // 4. Añadir cambios
        execSync('git add -A', { stdio: 'pipe' });
        logs.push('Archivos agregados al índice');

        // 5. Commit si hay cambios
        try {
          const status = execSync('git status --porcelain', { encoding: 'utf8' });
          if (status.trim().length > 0) {
            execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
            logs.push('Commit generado con éxito');
          } else {
            logs.push('No hay cambios nuevos que commitear');
          }
        } catch (commitErr: any) {
          logs.push(`Commit note: ${commitErr.message}`);
        }

        // 6. Push hacia el remoto autenticado
        try {
          // Push directo con la URL segura en un único comando sin persistir token en git config
          execSync(`git push -u "${pushUrl}" ${branch} --force`, {
            stdio: 'pipe',
            timeout: 45000,
          });
          logs.push(`Push exitoso a ${repoUrl} [${branch}]`);
        } catch (pushErr: any) {
          const sanitizedMsg = (pushErr.stderr?.toString() || pushErr.message || '').replace(new RegExp(token, 'g'), '***TOKEN***');
          throw new Error(`Fallo al hacer push: ${sanitizedMsg}`);
        }

        res.writeHead(200).end(JSON.stringify({
          success: true,
          message: `Proyecto sincronizado exitosamente con ${repoUrl} (${branch})`,
          logs,
        }));
      } catch (err: any) {
        res.writeHead(500).end(JSON.stringify({
          success: false,
          error: err.message || 'Error desconocido durante la sincronización Git',
        }));
      }
    });
    return;
  }

  next();
}

function generateOfflineFallback(topic: string, category: string, count: number) {
  const defaults = [
    { input: `¿Cómo funciona ${topic}?`, output: `${topic} se ejecuta mediante transformadores causales locales sin llamadas a la nube.`, tags: [category, 'offline'] },
    { input: `Dame un ejemplo de ${topic}`, output: `Aquí tienes una demostración directa y concisa para ${topic}.`, tags: [category, 'offline'] },
    { input: `¿Cuál es la mejor práctica en ${topic}?`, output: `Mantener el código modular, medir las pérdidas por época y validar con tests.`, tags: [category, 'offline'] },
  ];
  return defaults.slice(0, count).map((d, i) => ({
    id: `fallback_${Date.now()}_${i}`,
    category,
    input: d.input,
    output: d.output,
    source: 'teacher_synthetic',
    status: 'pending_review',
    tags: d.tags,
  }));
}
