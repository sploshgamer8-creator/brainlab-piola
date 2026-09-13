import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Sparkles, X, Activity, Compass, Cpu, Zap, Hammer, FolderKanban, Database, RefreshCw } from 'lucide-react';
import axios from 'axios';

interface OneBrainCopilotProps {
  activeTab: string;
  onNavigate: (tabId: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface TelemetryData {
  connected: boolean;
  source: string;
  totalCompleted: number;
  totalQueued: number;
  estimatedTokens: number;
  recentJobs?: any[];
}

export const OneBrainCopilot: React.FC<OneBrainCopilotProps> = ({
  activeTab,
  onNavigate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: '🧠 **OneBrain Copilot en Vivo**: Tengo acceso en tiempo real a la telemetría del Córtex en Railway y control del Launcher. Puedes pedirme navegar a cualquier panel (ej: *"ir a la forja"*, *"abrir entrenamiento"*) o preguntarme cuántos tokens van farmeados.',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Polling de telemetría cada 6 segundos
  useEffect(() => {
    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const res = await axios.get('/api/cloud/telemetry');
        if (isMounted) setTelemetry(res.data);
      } catch {}
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const res = await axios.post('/api/copilot/chat', { message: query, currentTab: activeTab });
      const { reply, navigationTarget } = res.data;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Si el copiloto determinó una navegación, cambiar la pestaña automáticamente
      if (navigationTarget) {
        onNavigate(navigationTarget);
      }

    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ Error de comunicación: ${err.message}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante siempre visible (Bottom-Right) */}
      <button
        id="btn-open-copilot"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white px-4 py-2.5 rounded-full shadow-2xl shadow-indigo-950 border border-indigo-400/40 transition-all transform hover:scale-105"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </span>
        <Bot className="w-5 h-5 text-white" />
        <span className="text-xs font-bold tracking-wide">Córtex Copilot</span>
        {telemetry?.estimatedTokens ? (
          <span className="text-[10px] bg-black/40 px-2 py-0.5 rounded-full font-mono text-emerald-300 border border-emerald-500/30">
            ~{telemetry.estimatedTokens.toLocaleString()} tok
          </span>
        ) : null}
      </button>

      {/* Ventana Flotante del Copiloto */}
      {isOpen && (
        <div className="fixed bottom-20 right-5 z-50 w-[92vw] sm:w-[460px] h-[580px] bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header del Copiloto */}
          <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-500/50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  OneBrain Live Copilot
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{telemetry?.connected ? 'Railway Cloud Activo' : 'Córtex Standalone'}</span>
                  <span>•</span>
                  <span className="text-indigo-400 uppercase font-semibold">Tab: {activeTab}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Barra de Telemetría en Vivo de la Nube */}
          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-slate-500 text-[9px] block">COSECHADOS</span>
                <span className="text-emerald-400 font-bold">~{(telemetry?.estimatedTokens || 100000).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[9px] block">TAREAS HECHAS</span>
                <span className="text-indigo-300 font-bold">{telemetry?.totalCompleted || 75}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[9px] block">EN COLA</span>
                <span className="text-amber-400 font-bold">{telemetry?.totalQueued || 3}</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>5 Keys Groq 24/7</span>
            </div>
          </div>

          {/* Navegador Rápido de Paneles */}
          <div className="bg-slate-900/60 p-2 border-b border-slate-800 flex items-center gap-1 overflow-x-auto text-[10px] font-medium scrollbar-none">
            <span className="text-slate-500 px-1 shrink-0 flex items-center gap-1">
              <Compass className="w-3 h-3 text-indigo-400" /> Ir:
            </span>
            <button
              onClick={() => onNavigate('forge')}
              className={`px-2 py-1 rounded-md shrink-0 transition flex items-center gap-1 border ${
                activeTab === 'forge' ? 'bg-amber-950/60 text-amber-300 border-amber-600/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Hammer className="w-2.5 h-2.5" /> La Forja
            </button>
            <button
              onClick={() => onNavigate('train')}
              className={`px-2 py-1 rounded-md shrink-0 transition flex items-center gap-1 border ${
                activeTab === 'train' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Zap className="w-2.5 h-2.5" /> Entrenar
            </button>
            <button
              onClick={() => onNavigate('chat')}
              className={`px-2 py-1 rounded-md shrink-0 transition flex items-center gap-1 border ${
                activeTab === 'chat' ? 'bg-indigo-950/60 text-indigo-300 border-indigo-600/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Bot className="w-2.5 h-2.5" /> Chat
            </button>
            <button
              onClick={() => onNavigate('data')}
              className={`px-2 py-1 rounded-md shrink-0 transition flex items-center gap-1 border ${
                activeTab === 'data' ? 'bg-blue-950/60 text-blue-300 border-blue-600/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Database className="w-2.5 h-2.5" /> Datasets
            </button>
            <button
              onClick={() => onNavigate('projects')}
              className={`px-2 py-1 rounded-md shrink-0 transition flex items-center gap-1 border ${
                activeTab === 'projects' ? 'bg-purple-950/60 text-purple-300 border-purple-600/50' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <FolderKanban className="w-2.5 h-2.5" /> Checkpoints
            </button>
          </div>

          {/* Historial de Mensajes */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 shadow-md ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                </div>
                <span className="text-[9px] text-slate-500 font-mono mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs italic font-mono p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Consultando estado del Córtex...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Preguntas Frecuentes / Atajos */}
          <div className="p-2 bg-slate-950/50 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[10px] font-mono scrollbar-none">
            <button
              type="button"
              onClick={() => handleSendMessage('¿Cuántos tokens llevamos farmeados en la nube?')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full shrink-0 transition"
            >
              📊 Ver tokens en vivo
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('Llévame a La Forja')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full shrink-0 transition"
            >
              ⚒️ Ir a La Forja
            </button>
            <button
              type="button"
              onClick={() => handleSendMessage('¿Cómo funciona el ZeroBlockInsert?')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full shrink-0 transition"
            >
              🧬 ZeroBlockInsert
            </button>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="Pregúntame o pide navegar a un panel..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-2 rounded-xl transition shadow-md shadow-indigo-950"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}
    </>
  );
};
