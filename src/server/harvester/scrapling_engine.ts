/**
 * Scrapling Engine (TypeScript / Node.js native core)
 * Implementa emulacion stealth de navegador, bypass de firmas basicas,
 * filtrado por selectores, bloqueo de rastreadores y conversion limpia a Markdown.
 */

export interface ScraplingFetchOptions {
  url: string;
  cssSelector?: string;
  timeoutMs?: number;
  impersonate?: 'chrome120' | 'firefox120' | 'safari17';
}

export interface ScraplingFetchResult {
  success: boolean;
  url: string;
  status: number;
  title?: string;
  content: string; // Markdown limpio o texto filtrado
  rawLength: number;
  extractedLength: number;
  error?: string;
}

export async function fetchWithScraplingStealth(options: ScraplingFetchOptions): Promise<ScraplingFetchResult> {
  const { url, cssSelector, timeoutMs = 20000 } = options;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Headers realistas de navegador moderno (Chrome 128 / Windows)
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        url,
        status: response.status,
        content: '',
        rawLength: 0,
        extractedLength: 0,
        error: `HTTP Error ${response.status} ${response.statusText}`
      };
    }

    const html = await response.text();
    const rawLength = html.length;

    // Extraer titulo
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Filtrar contenido con selector o extraccion del cuerpo principal
    let targetHtml = html;

    if (cssSelector) {
      const idMatch = cssSelector.match(/^#([a-zA-Z0-9_-]+)/);
      const classMatch = cssSelector.match(/^\.([a-zA-Z0-9_-]+)/);
      const tagMatch = cssSelector.match(/^[a-zA-Z0-9]+/);

      if (idMatch) {
        const idRegex = new RegExp(`<[^>]+id=["']${idMatch[1]}["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
        const m = html.match(idRegex);
        if (m) targetHtml = m[1];
      } else if (classMatch) {
        const classRegex = new RegExp(`<[^>]+class=["'][^"']*\\b${classMatch[1]}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
        const m = html.match(classRegex);
        if (m) targetHtml = m[1];
      } else if (tagMatch) {
        const tagRegex = new RegExp(`<${tagMatch[0]}[^>]*>([\\s\\S]*?)<\\/${tagMatch[0]}>`, 'i');
        const m = html.match(tagRegex);
        if (m) targetHtml = m[1];
      }
    } else {
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                           html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                           html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (articleMatch) {
        targetHtml = articleMatch[1];
      }
    }

    const cleanMarkdown = sanitizeHtmlToMarkdown(targetHtml);

    return {
      success: true,
      url,
      status: response.status,
      title,
      content: cleanMarkdown,
      rawLength,
      extractedLength: cleanMarkdown.length
    };

  } catch (err: any) {
    return {
      success: false,
      url,
      status: 0,
      content: '',
      rawLength: 0,
      extractedLength: 0,
      error: err.message || 'Fallo de conexion o timeout'
    };
  }
}

/**
 * Convierte HTML a Markdown limpio removiendo scripts, estilos, tracking y tags invisibles
 */
export function sanitizeHtmlToMarkdown(html: string): string {
  let text = html;

  // 1. Eliminar scripts, estilos, svgs, iframes, comentarios
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Encabezados
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');

  // 3. Parrafos y saltos
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<hr\s*[\/]?>/gi, '\n---\n');

  // 4. Bloques de codigo y pre
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // 5. Listas
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n* $1');

  // 6. Eliminar el resto de etiquetas HTML
  text = text.replace(/<[^>]+>/g, ' ');

  // 7. Decodificar entidades HTML comunes
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'");

  // 8. Normalizar espacios en blanco
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');

  return text.trim();
}
