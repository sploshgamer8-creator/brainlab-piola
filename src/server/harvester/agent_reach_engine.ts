/**
 * Agent Reach Engine
 * Conector multi-plataforma para IA: permite leer YouTube (subtítulos/transcripciones),
 * GitHub (código/README/issues), Reddit (hilos/comentarios técnicos) y feeds RSS
 * sin requerir claves de API de pago.
 */

export interface AgentReachOptions {
  platform: 'youtube' | 'github' | 'reddit' | 'rss' | 'web';
  target: string; // URL, repo ID, o video ID
  limit?: number;
}

export interface AgentReachResult {
  success: boolean;
  platform: string;
  target: string;
  title: string;
  content: string; // Texto consolidado para síntesis o dataset
  itemsCount: number;
  metadata?: Record<string, any>;
  error?: string;
}

export async function ingestWithAgentReach(options: AgentReachOptions): Promise<AgentReachResult> {
  const { platform, target, limit = 15 } = options;

  try {
    switch (platform) {
      case 'youtube':
        return await ingestYouTube(target);
      case 'github':
        return await ingestGitHub(target);
      case 'reddit':
        return await ingestReddit(target, limit);
      case 'rss':
        return await ingestRSS(target, limit);
      default:
        throw new Error(`Plataforma ${platform} no soportada.`);
    }
  } catch (err: any) {
    return {
      success: false,
      platform,
      target,
      title: 'Error de ingesta',
      content: '',
      itemsCount: 0,
      error: err.message || 'Error desconocido al conectar con la plataforma'
    };
  }
}

/**
 * 1. Ingesta de YouTube: Extrae título y transcripciones/subtítulos públicos
 */
async function ingestYouTube(urlOrId: string): Promise<AgentReachResult> {
  // Extraer ID de video
  let videoId = urlOrId.trim();
  const match = videoId.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/watch\?v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    videoId = match[1];
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
    }
  });

  if (!res.ok) {
    throw new Error(`No se pudo acceder al video de YouTube (HTTP ${res.status})`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : `YouTube Video ${videoId}`;

  // Buscar timedtext player captions
  const captionsRegex = /"captionTracks":\s*(\[.*?\])/;
  const captionMatch = html.match(captionsRegex);

  let transcriptText = '';
  if (captionMatch) {
    try {
      const tracks = JSON.parse(captionMatch[1]);
      if (tracks && tracks.length > 0) {
        // Preferir español o inglés
        const preferred = tracks.find((t: any) => t.languageCode === 'es') ||
                          tracks.find((t: any) => t.languageCode === 'en') ||
                          tracks[0];
        if (preferred && preferred.baseUrl) {
          const capRes = await fetch(preferred.baseUrl);
          if (capRes.ok) {
            const capXml = await capRes.text();
            // Limpiar XML de subtítulos
            transcriptText = capXml
              .replace(/<text[^>]*>/gi, ' ')
              .replace(/<\/text>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&amp;#39;/g, "'")
              .replace(/&amp;quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&gt;/g, '>')
              .replace(/&lt;/g, '<')
              .replace(/\n\s*\n+/g, '\n')
              .trim();
          }
        }
      }
    } catch {}
  }

  // Si no hay captions directos, extraer descripción del video
  if (!transcriptText || transcriptText.length < 50) {
    const descMatch = html.match(/"shortDescription":"([\s\S]*?)","isCrawlable"/);
    const desc = descMatch ? JSON.parse(`"${descMatch[1]}"`) : '';
    transcriptText = `[Descripción del Video]:\n${desc}\n\n(Nota: Los subtítulos automáticos no estaban disponibles o requieren sesión de navegador).`;
  }

  return {
    success: true,
    platform: 'youtube',
    target: watchUrl,
    title: rawTitle,
    content: `# ${rawTitle}\n\n${transcriptText}`,
    itemsCount: 1,
    metadata: { videoId }
  };
}

/**
 * 2. Ingesta de GitHub: Extrae README y detalles del repositorio
 */
async function ingestGitHub(repoOrUrl: string): Promise<AgentReachResult> {
  let repoPath = repoOrUrl.replace(/https?:\/\/github\.com\//i, '').replace(/\/$/, '').trim();
  const parts = repoPath.split('/');
  if (parts.length < 2) {
    throw new Error('Formato de repositorio inválido. Use "owner/repo" o "https://github.com/owner/repo"');
  }
  const [owner, repo] = parts;

  // 1. Obtener README vía raw.githubusercontent.com
  const branches = ['main', 'master'];
  let readmeContent = '';
  for (const b of branches) {
    try {
      const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`);
      if (rawRes.ok) {
        readmeContent = await rawRes.text();
        break;
      }
    } catch {}
  }

  // 2. Obtener descripción de API pública de GitHub si es posible
  let description = '';
  try {
    const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'OneBrain-AgentReach/1.0' }
    });
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      description = apiData.description || '';
    }
  } catch {}

  const fullContent = [
    `# Repositorio GitHub: ${owner}/${repo}`,
    description ? `> ${description}\n` : '',
    readmeContent ? readmeContent : '(No se encontró archivo README.md directo)'
  ].filter(Boolean).join('\n\n');

  return {
    success: true,
    platform: 'github',
    target: `https://github.com/${owner}/${repo}`,
    title: `${owner}/${repo}`,
    content: fullContent,
    itemsCount: 1,
    metadata: { owner, repo, description }
  };
}

/**
 * 3. Ingesta de Reddit: Lee posts y comentarios técnicos agregando .json
 */
async function ingestReddit(url: string, limit: number): Promise<AgentReachResult> {
  let cleanUrl = url.trim();
  if (!cleanUrl.endsWith('.json')) {
    cleanUrl = cleanUrl.replace(/\/$/, '') + '.json';
  }

  const res = await fetch(cleanUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OneBrain-Harvester/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`Reddit devolvió estado HTTP ${res.status}`);
  }

  const data = await res.json();
  let title = 'Hilo de Reddit';
  const pieces: string[] = [];

  if (Array.isArray(data) && data.length > 0) {
    // Post individual con comentarios
    const postData = data[0]?.data?.children?.[0]?.data;
    if (postData) {
      title = postData.title || title;
      pieces.push(`# ${title}\n`);
      if (postData.selftext) {
        pieces.push(`**Post Principal:**\n${postData.selftext}\n`);
      }
    }

    const comments = data[1]?.data?.children || [];
    pieces.push(`## Comentarios de la Comunidad (${Math.min(comments.length, limit)}):\n`);
    let count = 0;
    for (const c of comments) {
      if (count >= limit) break;
      const body = c.data?.body;
      const author = c.data?.author || 'anónimo';
      const score = c.data?.score || 0;
      if (body && body !== '[deleted]' && body !== '[removed]') {
        pieces.push(`> **${author}** (+${score}):\n${body}\n`);
        count++;
      }
    }
  } else if (data.data?.children) {
    // Subreddit listing
    pieces.push(`# Discusiones en ${url}\n`);
    for (const item of data.data.children.slice(0, limit)) {
      const d = item.data;
      if (d) {
        pieces.push(`### [${d.score || 0} pts] ${d.title}\n${d.selftext ? d.selftext.slice(0, 300) + '...' : ''}\nLink: ${d.url}\n`);
      }
    }
  }

  return {
    success: true,
    platform: 'reddit',
    target: url,
    title,
    content: pieces.join('\n'),
    itemsCount: pieces.length,
    metadata: { url }
  };
}

/**
 * 4. Ingesta de Feeds RSS / Atom
 */
async function ingestRSS(feedUrl: string, limit: number): Promise<AgentReachResult> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'OneBrain-AgentReach/1.0' }
  });

  if (!res.ok) {
    throw new Error(`Fallo al leer feed RSS (HTTP ${res.status})`);
  }

  const xml = await res.text();
  const channelTitleMatch = xml.match(/<title>([\s\S]*?)<\/title>/i);
  const feedTitle = channelTitleMatch ? channelTitleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Feed RSS';

  const items: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < limit) {
    const itemXml = match[1] || match[2];
    const itTitle = (itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
    const itDesc = (itemXml.match(/<description>([\s\S]*?)<\/description>|<summary>([\s\S]*?)<\/summary>|<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
    const itLink = (itemXml.match(/<link[^>]*>(?:([\s\S]*?)<\/link>)?/i)?.[1] || itemXml.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] || '').trim();

    if (itTitle) {
      items.push(`### ${itTitle}\n${itDesc ? itDesc.replace(/<[^>]+>/g, ' ').trim() : ''}\n${itLink ? `Enlace: ${itLink}` : ''}\n`);
      count++;
    }
  }

  return {
    success: true,
    platform: 'rss',
    target: feedUrl,
    title: feedTitle,
    content: `# Feed RSS: ${feedTitle}\n\n` + items.join('\n---\n'),
    itemsCount: count,
    metadata: { feedUrl }
  };
}
