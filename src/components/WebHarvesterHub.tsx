import React, { useState } from 'react';
import { Globe, Youtube, Github, MessageSquare, Rss, Sparkles, Shield, Cpu, ArrowRight, CheckCircle, RefreshCw, Layers } from 'lucide-react';
import axios from 'axios';
import { DatasetItem } from '../core/types';

interface WebHarvesterHubProps {
  onAddDatasetItems: (items: DatasetItem[]) => void;
}

export const WebHarvesterHub: React.FC<WebHarvesterHubProps> = ({ onAddDatasetItems }) => {
  const [activeEngine, setActiveEngine] = useState<'scrapling' | 'reach' | 'scrapegraph'>('scrapling');

  // 1. Scrapling State
  const [scraplingUrl, setScraplingUrl] = useState('');
  const [cssSelector, setCssSelector] = useState('');
  const [isScraplingLoading, setIsScraplingLoading] = useState(false);

  // 2. Agent Reach State
  const [reachPlatform, setReachPlatform] = useState<'youtube' | 'github' | 'reddit' | 'rss'>('youtube');
  const [reachTarget, setReachTarget] = useState('');
  const [isReachLoading, setIsReachLoading] = useState(false);

  // Shared Buffer / Extracted Content
  const [extractedTitle, setExtractedTitle] = useState('');
  const [extractedContent, setExtractedContent] = useState('');
  const [extractedStats, setExtractedStats] = useState<{ rawLength: number; extractedLength: number } | null>(null);

  // 3. ScrapeGraphAI Synthesizer State
  const [synthTopic, setSynthTopic] = useState('Ingeniería y Algoritmos');
  const [synthCategory, setSynthCategory] = useState<DatasetItem['category']>('spanish');
  const [synthCount, setSynthCount] = useState(4);
  const [isSynthLoading, setIsSynthLoading] = useState(false);
  const [synthesizedSamples, setSynthesizedSamples] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Execute Scrapling Fetch
  const handleScraplingFetch = async () => {
    if (!scraplingUrl.trim()) return;
    setIsScraplingLoading(true);
    setStatusMsg('🕷️ Scrapling: Iniciando fetch stealth con emulación de navegador...');
    try {
      const res = await axios.post('/api/harvest/scrapling', {
        url: scraplingUrl.trim(),
        cssSelector: cssSelector.trim() || undefined
      });
      if (res.data.success) {
        setExtractedTitle(res.data.title || scraplingUrl);
        setExtractedContent(res.data.content);
        setExtractedStats({
          rawLength: res.data.rawLength,
          extractedLength: res.data.extractedLength
        });
        setStatusMsg(`✅ Scrapling: Extraídos ${res.data.extractedLength.toLocaleString()} caracteres limpios.`);
      } else {
        setStatusMsg(`❌ Error Scrapling: ${res.data.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Error de conexión: ${err.message}`);
    } finally {
      setIsScraplingLoading(false);
    }
  };

  // Execute Agent Reach Ingest
  const handleReachIngest = async () => {
    if (!reachTarget.trim()) return;
    setIsReachLoading(true);
    setStatusMsg(`🌐 Agent Reach: Conectando a ${reachPlatform.toUpperCase()}...`);
    try {
      const res = await axios.post('/api/harvest/reach', {
        platform: reachPlatform,
        target: reachTarget.trim()
      });
      if (res.data.success) {
        setExtractedTitle(res.data.title);
        setExtractedContent(res.data.content);
        setExtractedStats({
          rawLength: res.data.content.length,
          extractedLength: res.data.content.length
        });
        setStatusMsg(`✅ Agent Reach: ${res.data.title} ingestado con éxito.`);
      } else {
        setStatusMsg(`❌ Error Agent Reach: ${res.data.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Error de conexión: ${err.message}`);
    } finally {
      setIsReachLoading(false);
    }
  };

  // Execute ScrapeGraph Pipeline
  const handleScrapeGraphSynthesize = async () => {
    if (!extractedContent.trim()) {
      setStatusMsg('⚠️ Primero debes extraer contenido con Scrapling o Agent Reach.');
      return;
    }
    setIsSynthLoading(true);
    setStatusMsg('🧬 ScrapeGraphAI: Ejecutando grafo de síntesis para extraer pares de entrenamiento...');
    try {
      const res = await axios.post('/api/harvest/synthesize', {
        rawContent: extractedContent,
        topic: synthTopic,
        count: synthCount,
        category: synthCategory
      });
      if (res.data.success && res.data.samples.length > 0) {
        setSynthesizedSamples(res.data.samples);
        setStatusMsg(`✨ ScrapeGraphAI: ¡${res.data.samples.length} pares generados mediante ${res.data.provider}!`);
      } else {
        setStatusMsg(`❌ Error de síntesis: ${res.data.error || 'No se pudieron extraer pares válidos'}`);
      }
    } catch (err: any) {
      setStatusMsg(`❌ Error de conexión: ${err.message}`);
    } finally {
      setIsSynthLoading(false);
    }
  };

  // Inject generated samples into project dataset
  const handleInjectAll = () => {
    if (synthesizedSamples.length === 0) return;
    const newItems: DatasetItem[] = synthesizedSamples.map((s, idx) => ({
      id: `harvest_${Date.now()}_${idx}`,
      category: synthCategory,
      input: s.input ? `${s.instruction}\n\n${s.input}` : s.instruction,
      output: s.output,
      source: 'teacher_synthetic',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: ['harvest', 'scrapegraph', activeEngine]
    }));

    onAddDatasetItems(newItems);
    setStatusMsg(`🎉 ${newItems.length} pares inyectados con éxito al dataset activo.`);
    setSynthesizedSamples([]);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 mb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
              <Globe className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                OneBrain Web Harvester & Ingestion Hub
                <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
                  v2.0 Infra
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Extracción indetectable con <strong>Scrapling</strong>, ingesta multi-plataforma con <strong>Agent Reach</strong> y síntesis con <strong>ScrapeGraphAI</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Engine selector tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveEngine('scrapling')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeEngine === 'scrapling'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Scrapling Stealth
          </button>
          <button
            onClick={() => setActiveEngine('reach')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeEngine === 'reach'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Agent Reach
          </button>
          <button
            onClick={() => setActiveEngine('scrapegraph')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeEngine === 'scrapegraph'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            ScrapeGraph Síntesis
          </button>
        </div>
      </div>

      {/* Engine 1: Scrapling */}
      {activeEngine === 'scrapling' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-8 space-y-2">
            <label className="text-xs font-semibold text-slate-300">URL Objetivo (Página o Documentación):</label>
            <input
              type="text"
              placeholder="https://docs.kernel.org o https://blog.cloudflare.com/..."
              value={scraplingUrl}
              onChange={e => setScraplingUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
          <div className="md:col-span-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300">Selector CSS (Opcional):</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="#content, article, .post-body"
                value={cssSelector}
                onChange={e => setCssSelector(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                onClick={handleScraplingFetch}
                disabled={isScraplingLoading || !scraplingUrl.trim()}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 whitespace-nowrap transition-all shadow-lg shadow-cyan-600/20"
              >
                {isScraplingLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Extraer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Engine 2: Agent Reach */}
      {activeEngine === 'reach' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setReachPlatform('youtube'); setReachTarget(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                reachPlatform === 'youtube' ? 'bg-red-950/60 border-red-500 text-red-300' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube (Subtítulos)
            </button>
            <button
              onClick={() => { setReachPlatform('github'); setReachTarget(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                reachPlatform === 'github' ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <Github className="w-3.5 h-3.5" /> GitHub (README / Repo)
            </button>
            <button
              onClick={() => { setReachPlatform('reddit'); setReachTarget(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                reachPlatform === 'reddit' ? 'bg-orange-950/60 border-orange-500 text-orange-300' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-orange-400" /> Reddit (Discusiones)
            </button>
            <button
              onClick={() => { setReachPlatform('rss'); setReachTarget(''); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                reachPlatform === 'rss' ? 'bg-amber-950/60 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              <Rss className="w-3.5 h-3.5 text-amber-400" /> Feed RSS / Atom
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder={
                reachPlatform === 'youtube'
                  ? 'https://www.youtube.com/watch?v=... o ID de video'
                  : reachPlatform === 'github'
                  ? 'usuario/repositorio (ej: karpathy/nanoGPT)'
                  : reachPlatform === 'reddit'
                  ? 'https://www.reddit.com/r/MachineLearning/comments/...'
                  : 'https://news.ycombinator.com/rss o feed XML'
              }
              value={reachTarget}
              onChange={e => setReachTarget(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
            />
            <button
              onClick={handleReachIngest}
              disabled={isReachLoading || !reachTarget.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 whitespace-nowrap transition-all shadow-lg shadow-purple-600/20"
            >
              {isReachLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Ingestar
            </button>
          </div>
        </div>
      )}

      {/* Engine 3: ScrapeGraphAI Synthesizer */}
      {activeEngine === 'scrapegraph' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <div className="md:col-span-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300">Tema / Especialidad:</label>
            <input
              type="text"
              value={synthTopic}
              onChange={e => setSynthTopic(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="md:col-span-3 space-y-2">
            <label className="text-xs font-semibold text-slate-300">Categoría Objetivo:</label>
            <select
              value={synthCategory}
              onChange={e => setSynthCategory(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="spanish">Español Conversacional</option>
              <option value="lua">Lua Scripting</option>
              <option value="english">Inglés Técnico</option>
              <option value="portuguese">Portugués</option>
            </select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-semibold text-slate-300">Cantidad de Pares:</label>
            <input
              type="number"
              min={1}
              max={10}
              value={synthCount}
              onChange={e => setSynthCount(parseInt(e.target.value, 10) || 3)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <div className="md:col-span-3 flex items-end">
            <button
              onClick={handleScrapeGraphSynthesize}
              disabled={isSynthLoading || !extractedContent.trim()}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-600/20"
            >
              {isSynthLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Sintetizar con ScrapeGraph
            </button>
          </div>
        </div>
      )}

      {/* Status Banner */}
      {statusMsg && (
        <div className="text-xs px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 flex items-center justify-between">
          <span>{statusMsg}</span>
          {extractedStats && (
            <span className="text-[11px] text-cyan-400 font-mono">
              Bruto: {extractedStats.rawLength.toLocaleString()} chars | Limpio: {extractedStats.extractedLength.toLocaleString()} chars
            </span>
          )}
        </div>
      )}

      {/* Extracted Buffer Preview & Synthesized Cards */}
      {extractedContent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buffer de Texto Limpio */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                📄 Buffer Extraído ({extractedTitle || 'Sin título'})
              </span>
              <button
                onClick={() => { setActiveEngine('scrapegraph'); }}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
              >
                Ir a Sintetizar <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <textarea
              readOnly
              value={extractedContent.slice(0, 3000) + (extractedContent.length > 3000 ? '\n\n...[truncado para vista previa]' : '')}
              rows={6}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 font-mono resize-none focus:outline-none"
            />
          </div>

          {/* Pares Sintetizados */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                ✨ Pares Generados ({synthesizedSamples.length})
              </span>
              {synthesizedSamples.length > 0 && (
                <button
                  onClick={handleInjectAll}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Inyectar al Dataset
                </button>
              )}
            </div>

            {synthesizedSamples.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-slate-500 text-xs text-center">
                <Cpu className="w-6 h-6 mb-2 opacity-50" />
                Presiona "Sintetizar con ScrapeGraph" para generar pares a partir del texto extraído.
              </div>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {synthesizedSamples.map((s, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                    <p className="font-semibold text-amber-300 truncate">Q: {s.instruction}</p>
                    <p className="text-slate-400 line-clamp-2">A: {s.output}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
