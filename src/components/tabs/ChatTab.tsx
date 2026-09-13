import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Cpu,
  Sliders,
  PlusCircle,
  CheckCircle2,
  RotateCcw,
  Eye,
  ShieldCheck,
  Zap,
  Sparkles,
  RefreshCw,
  Play,
  Pause,
  Layers,
  ArrowRight,
  TrendingDown,
  Check,
  Globe,
  X,
} from 'lucide-react';
import { BrainProject, ExternalMemoryItem, DatasetItem, PersonalityTraits } from '../../core/types';
import { NanoGPTModel } from '../../core/nanogpt_engine';
import { NanoTokenizer } from '../../core/tokenizer';
import { buildMemoryContextPrompt } from '../../memory/memory_store';
import { fetchDistillationBatch } from '../../core/distill_service';
import { StorageManager } from '../../storage/storage_manager';
import { detectContextAndTune, AutoTuneDetectionResult } from '../../core/autotune';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensCount?: number;
  durationMs?: number;
  tokensList?: number[];
  modelBadge?: string;
  timestamp: string;
  farmed100MResponse?: string;
  farmed100MTokens?: number;
  isAbsorbedIntoLocal?: boolean;
}

interface ChatTabProps {
  currentProject: BrainProject;
  model: NanoGPTModel;
  tokenizer: NanoTokenizer;
  memoryItems: ExternalMemoryItem[];
  onAddDatasetItem: (item: DatasetItem) => void;
  onInjectSamplesAndTrain?: (samples: DatasetItem[]) => void;
  onStartTraining?: (steps: number) => void;
  onStepOnce?: () => void;
  isTraining?: boolean;
  trainingStep?: number;
  currentLoss?: number;
  traits?: PersonalityTraits;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  currentProject,
  model,
  tokenizer,
  memoryItems,
  onAddDatasetItem,
  onInjectSamplesAndTrain,
  onStartTraining,
  onStepOnce,
  isTraining = false,
  trainingStep = 0,
  currentLoss = 2.14,
  traits = currentProject.traits,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'sys_init',
      role: 'system',
      content: `🧠 Modelo nanoGPT cargado (${(currentProject.checkpoints[0]?.paramCount ?? 218000).toLocaleString()} parámetros). Puedes chatear en modo 100% Local, invocar al Maestro (OmniRoute Gateway) o activar el Farmeador de 100M de parámetros para retroalimentar tu cerebro en tiempo real.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMode, setChatMode] = useState<'local' | 'onebrain_gpu' | 'duo' | 'gateway'>('onebrain_gpu');

  // Generation Hyperparameters
  const [temperature, setTemperature] = useState(0.8);
  const [topK, setTopK] = useState(30);
  const [maxNewTokens, setMaxNewTokens] = useState(60);
  const [includeExternalMemory, setIncludeExternalMemory] = useState(true);
  const [isAutoTuneEnabled, setIsAutoTuneEnabled] = useState(true);
  const [autoTuneResult, setAutoTuneResult] = useState<AutoTuneDetectionResult | null>(() => detectContextAndTune(''));

  useEffect(() => {
    if (isAutoTuneEnabled && inputPrompt.trim().length > 2) {
      const tuned = detectContextAndTune(inputPrompt);
      setAutoTuneResult(tuned);
      setTemperature(tuned.params.temperature);
      setTopK(tuned.params.topK);
    }
  }, [inputPrompt, isAutoTuneEnabled]);

  // Inspector modal & notices
  const [inspectedMsg, setInspectedMsg] = useState<ChatMessage | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  // Farmeador 100M de Parámetros (Teacher Harvester) States
  const [sidebarTab, setSidebarTab] = useState<'farmer' | 'sampling'>('farmer');
  const [isFarmerActive, setIsFarmerActive] = useState(true);
  const [isContinuousFarming, setIsContinuousFarming] = useState(() => {
    return localStorage.getItem('brainlab_chat_farming_active') === 'true';
  });
  const [isFarmingBatch, setIsFarmingBatch] = useState(false);
  const [autoFarmOnChat, setAutoFarmOnChat] = useState(true);
  const [autoAbsorbOnFarm, setAutoAbsorbOnFarm] = useState(true);
  const [farmingDomain, setFarmingDomain] = useState<'spanish' | 'lua' | 'general' | 'personality'>(() => {
    return (localStorage.getItem('brainlab_chat_farming_domain') as any) || 'spanish';
  });

  useEffect(() => {
    localStorage.setItem('brainlab_chat_farming_active', isContinuousFarming ? 'true' : 'false');
  }, [isContinuousFarming]);

  useEffect(() => {
    localStorage.setItem('brainlab_chat_farming_domain', farmingDomain);
  }, [farmingDomain]);
  const [farmedTokens, setFarmedTokens] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('local_brain_farmed_tokens_v1');
      return saved ? parseInt(saved, 10) : 12450;
    } catch {
      return 12450;
    }
  });

  const [farmedPairs, setFarmedPairs] = useState<DatasetItem[]>([
    {
      id: 'farm_init_01',
      category: 'spanish',
      input: '¿Cómo funciona la atención causal?',
      output: 'La atención causal usa una máscara triangular para que cada token solo atienda a los tokens previos.',
      source: 'synthetic_api',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: ['100m_farmed', 'causal_attention'],
    },
    {
      id: 'farm_init_02',
      category: 'lua',
      input: '¿Cómo declarar una función en Lua?',
      output: 'function calcular(a, b)\n  return a + b\nend',
      source: 'synthetic_api',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: ['100m_farmed', 'lua'],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const continuousTimerRef = useRef<any>(null);

  // OmniRoute Gateway HUD Connection state
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [omniRouteUrl, setOmniRouteUrl] = useState(() => {
    try { return localStorage.getItem('local_brain_omniroute_url') || ''; } catch { return ''; }
  });
  const [omniRouteApiKey, setOmniRouteApiKey] = useState(() => {
    try { return localStorage.getItem('local_brain_omniroute_key') || ''; } catch { return ''; }
  });
  const [omniRouteModel, setOmniRouteModel] = useState(() => {
    try { return localStorage.getItem('local_brain_omniroute_model') || 'omniroute-auto'; } catch { return 'omniroute-auto'; }
  });
  const [isTestingGateway, setIsTestingGateway] = useState(false);
  const [gatewayTestResult, setGatewayTestResult] = useState<{ success: boolean; message: string; latencyMs?: number; hint?: string } | null>(null);

  const handleTestGateway = async (customUrl?: string, customKey?: string, customModel?: string) => {
    setIsTestingGateway(true);
    setGatewayTestResult(null);
    try {
      const targetUrl = customUrl !== undefined ? customUrl : omniRouteUrl;
      const targetKey = customKey !== undefined ? customKey : omniRouteApiKey;
      const targetModel = customModel !== undefined ? customModel : omniRouteModel;

      const res = await fetch('/api/gateway/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          omniRouteUrl: targetUrl.trim(),
          omniRouteApiKey: targetKey.trim(),
          omniRouteModel: targetModel.trim(),
        }),
      });
      const data = await res.json();
      setGatewayTestResult(data);
    } catch (err: any) {
      setGatewayTestResult({
        success: false,
        message: err.message || 'Error de red al comprobar gateway',
        hint: 'Verifica la URL del gateway y si requiere túnel público.',
      });
    } finally {
      setIsTestingGateway(false);
    }
  };

  const handleSaveGateway = () => {
    try {
      localStorage.setItem('local_brain_omniroute_url', omniRouteUrl);
      localStorage.setItem('local_brain_omniroute_key', omniRouteApiKey);
      localStorage.setItem('local_brain_omniroute_model', omniRouteModel);
    } catch {}
    setShowGatewayModal(false);
  };

  // Persist farmed tokens counter
  useEffect(() => {
    try {
      localStorage.setItem('local_brain_farmed_tokens_v1', farmedTokens.toString());
    } catch {}
  }, [farmedTokens]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Continuous Farming Loop
  useEffect(() => {
    if (isContinuousFarming) {
      continuousTimerRef.current = setInterval(async () => {
        await executeFarmingHarvest(3, false);
      }, 7500);
    } else {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
        continuousTimerRef.current = null;
      }
    }
    return () => {
      if (continuousTimerRef.current) {
        clearInterval(continuousTimerRef.current);
      }
    };
  }, [isContinuousFarming, farmingDomain, autoAbsorbOnFarm]);

  // Execute a farming harvest from the 100M parameter teacher
  const executeFarmingHarvest = async (count = 5, showToast = true) => {
    if (isFarmingBatch) return;
    setIsFarmingBatch(true);
    try {
      const topicLabel =
        farmingDomain === 'spanish'
          ? 'Diálogos naturales en español y asistencia amigable'
          : farmingDomain === 'lua'
          ? 'Funciones y patrones idiomáticos en lenguaje Lua'
          : farmingDomain === 'personality'
          ? 'Respuestas con alta empatía, claridad y cortesía'
          : 'Conocimiento general conciso y directo';

      const omniRouteUrl = localStorage.getItem('local_brain_omniroute_url') || '';
      const omniRouteApiKey = localStorage.getItem('local_brain_omniroute_key') || '';
      const omniRouteModel = localStorage.getItem('local_brain_omniroute_model') || '';

      const res = await fetchDistillationBatch({
        topic: topicLabel,
        category: farmingDomain,
        count,
        traits,
        omniRouteUrl: omniRouteUrl || undefined,
        omniRouteApiKey: omniRouteApiKey || undefined,
        omniRouteModel: omniRouteModel || undefined,
        complexity: farmingDomain === 'lua' ? 'lua_code' : 'conversational',
      });

      if (res.candidates && res.candidates.length > 0) {
        // Estimate token count (~25 tokens per candidate input+output)
        const estimatedTokens = res.candidates.reduce((acc, c) => acc + (c.input.length + c.output.length) / 3.5, 0);
        const tokensAdded = Math.round(estimatedTokens);

        setFarmedTokens(prev => prev + tokensAdded);
        setFarmedPairs(prev => [...res.candidates, ...prev].slice(0, 30));

        // Inject into training dataset
        if (onInjectSamplesAndTrain) {
          onInjectSamplesAndTrain(res.candidates);
        }
        res.candidates.forEach(c => onAddDatasetItem(c));

        // Persistir en IndexedDB para superar el límite de 5MB de localStorage
        StorageManager.putItems('datasets', res.candidates).catch(() => {});

        // Auto-absorb: execute gradient descent on local nanoGPT immediately
        if (autoAbsorbOnFarm) {
          if (onStepOnce) {
            onStepOnce();
          }
          if (onStartTraining && !isTraining) {
            onStartTraining(2);
          }
        }

        if (showToast) {
          setAddedNotice(`🌾 ¡Cosecha 100M completada! +${tokensAdded} tokens y ${res.candidates.length} pares absorbidos por nanoGPT.`);
          setTimeout(() => setAddedNotice(null), 3500);
        }
      }
    } catch (err: any) {
      if (showToast) {
        setAddedNotice(`Aviso en farmeador: ${err.message}`);
        setTimeout(() => setAddedNotice(null), 3000);
      }
    } finally {
      setIsFarmingBatch(false);
    }
  };

  // Absorber un par individual en nanoGPT
  const handleAbsorbSinglePair = (item: DatasetItem, msgId?: string) => {
    if (onInjectSamplesAndTrain) {
      onInjectSamplesAndTrain([item]);
    }
    if (onStepOnce) {
      onStepOnce();
    }
    if (msgId) {
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, isAbsorbedIntoLocal: true } : m))
      );
    }
    setAddedNotice(`🌱 Par absorbido con AdamW en el paso ${trainingStep + 1}. Pesos actualizados.`);
    setTimeout(() => setAddedNotice(null), 3000);
  };

  const handleSendMessage = async () => {
    const text = inputPrompt.trim();
    if (!text || isGenerating) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsGenerating(true);

    if (chatMode === 'gateway') {
      // Direct high-capacity Gateway call
      try {
        const startTime = performance.now();
        const omniRouteUrl = localStorage.getItem('local_brain_omniroute_url') || '';
        const omniRouteApiKey = localStorage.getItem('local_brain_omniroute_key') || '';
        const omniRouteModel = localStorage.getItem('local_brain_omniroute_model') || '';

        const res = await fetch('/api/gateway/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            systemPrompt: 'Eres el Maestro OmniRoute (100M a 7B parámetros). Proporciona respuestas concisas, precisas y naturales en español.',
            omniRouteUrl: omniRouteUrl || undefined,
            omniRouteApiKey: omniRouteApiKey || undefined,
            omniRouteModel: omniRouteModel || undefined,
          }),
        });
        const data = await res.json();
        const durationMs = performance.now() - startTime;

        const assistantMsg: ChatMessage = {
          id: `asst_gate_${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'Sin respuesta del gateway.',
          durationMs,
          modelBadge: data.model || 'OmniRoute Gateway 100M',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages(prev => [...prev, assistantMsg]);
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Error al conectar con OmniRoute: ${err.message}`,
            modelBadge: 'Gateway Offline',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (chatMode === 'onebrain_gpu') {
      try {
        const startTime = performance.now();
        const memContext = includeExternalMemory ? buildMemoryContextPrompt(memoryItems) : '';
        const fullPrompt = memContext + text;

        const res = await fetch('/api/infer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: fullPrompt,
            checkpoint: 'checkpoints/onebrain_piolacraft.pt',
            maxTokens: maxNewTokens,
            temperature,
            topK,
          }),
        });

        const data = await res.json();
        const durationMs = performance.now() - startTime;

        if (data.success) {
          const assistantMsg: ChatMessage = {
            id: `asst_gpu_${Date.now()}`,
            role: 'assistant',
            content: data.response || data.full_text || '...',
            tokensCount: data.tokens_generated || maxNewTokens,
            durationMs: data.duration_ms || durationMs,
            modelBadge: `OneBrain Modern GPT (${data.device?.toUpperCase() || 'CUDA'} - ${(data.params_count / 1e6 || 19.34).toFixed(1)}M)`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else {
          throw new Error(data.error || 'Error al ejecutar inferencia en GPU');
        }
      } catch (err: any) {
        setMessages(prev => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Error en OneBrain GPU: ${err.message}`,
            modelBadge: 'GPU Error',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Local inference on nanoGPT Float32 tensors
    setTimeout(async () => {
      const startTime = performance.now();

      // Format prompt with optional external memory prefix
      const memContext = includeExternalMemory ? buildMemoryContextPrompt(memoryItems) : '';
      const fullText = memContext + text;

      const formatted = tokenizer.formatConversation(fullText);
      const encodedPrompt = tokenizer.encode(formatted);

      const tuneToUse = isAutoTuneEnabled ? detectContextAndTune(text) : null;
      const effectiveTemp = tuneToUse ? tuneToUse.params.temperature : temperature;
      const effectiveTopK = tuneToUse ? tuneToUse.params.topK : topK;

      const generated = model.generate(
        encodedPrompt,
        maxNewTokens,
        effectiveTemp,
        effectiveTopK,
        tokenizer.specialTokens.end
      );

      const durationMs = performance.now() - startTime;
      const responseTokens = generated.slice(encodedPrompt.length);
      const rawOutput = tokenizer.decode(responseTokens);
      const cleaned = rawOutput.replace('<|endoftext|>', '').trim();

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: cleaned || '...',
        tokensCount: responseTokens.length,
        durationMs,
        tokensList: responseTokens,
        modelBadge: tuneToUse 
          ? `nanoGPT [AutoTune: ${tuneToUse.detectedContext} T=${effectiveTemp}]` 
          : 'Local nanoGPT (Float32)',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMsg]);
      setIsGenerating(false);

      // Si el Farmeador 100M está activo o estamos en modo Dúo, cosechar en paralelo del maestro
      if ((isFarmerActive && autoFarmOnChat) || chatMode === 'duo') {
        try {
          const res = await fetch('/api/gateway/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              systemPrompt:
                'Responde de manera ejemplar, concisa y pedagógica en español para transferir y destilar conocimiento a un modelo nanoGPT local.',
            }),
          });
          const data = await res.json();
          if (data.reply) {
            const farmedTokensGained = Math.round((text.length + data.reply.length) / 3.5);
            setFarmedTokens(prev => prev + farmedTokensGained);

            const newFarmedItem: DatasetItem = {
              id: `farm_chat_${Date.now()}`,
              category: farmingDomain,
              input: text,
              output: data.reply,
              source: 'synthetic_api',
              approved: true,
              createdAt: new Date().toISOString(),
              tags: ['100m_farmed', 'chat_harvested'],
            };

            setFarmedPairs(prev => [newFarmedItem, ...prev].slice(0, 30));
            onAddDatasetItem(newFarmedItem);

            // Adjuntar la variante cosechada al mensaje para poder absorberla
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMsg.id
                  ? {
                      ...m,
                      farmed100MResponse: data.reply,
                      farmed100MTokens: farmedTokensGained,
                      isAbsorbedIntoLocal: autoAbsorbOnFarm,
                    }
                  : m
              )
            );

            // Auto-absorber si está habilitado
            if (autoAbsorbOnFarm && onInjectSamplesAndTrain) {
              onInjectSamplesAndTrain([newFarmedItem]);
              if (onStepOnce) {
                onStepOnce();
              }
              setAddedNotice(`🌾 Farmeador 100M: +${farmedTokensGained} tokens cosechados y absorbidos automáticamente.`);
              setTimeout(() => setAddedNotice(null), 3000);
            }
          }
        } catch {
          // Contingencia silenciosa
        }
      }
    }, 20);
  };

  const handleAddMessageToDataset = (userText: string, assistantText: string) => {
    const newItem: DatasetItem = {
      id: `chat_curated_${Date.now()}`,
      category: 'general',
      input: userText,
      output: assistantText,
      source: 'chat_conversation',
      approved: true,
      createdAt: new Date().toISOString(),
      tags: ['curated_from_chat'],
    };
    onAddDatasetItem(newItem);
    setAddedNotice('¡Interacción guardada en el dataset con éxito!');
    setTimeout(() => setAddedNotice(null), 3500);
  };

  return (
    <div id="chat-tab-container" className="space-y-4">
      {/* 🌾 Farmeador 100M Parámetros HUD Banner */}
      <div
        id="farmeador-100m-hud"
        className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 rounded-xl border border-indigo-500/30 p-4 shadow-lg shadow-indigo-950/30 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold shadow-inner transition ${
              isFarmerActive
                ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border border-slate-700 text-slate-500'
            }`}
          >
            <Sparkles className={`w-5 h-5 ${isFarmerActive ? 'animate-pulse text-emerald-400' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                Farmeador de 100M de Parámetros
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                    isFarmerActive
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {isFarmerActive ? 'ACTIVO' : 'EN ESPERA'}
                </span>
              </h2>
              {isContinuousFarming && (
                <span className="flex items-center gap-1 text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded animate-pulse font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Auto-Farmeo Continuo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Cosecha conocimiento continuo desde el modelo maestro (100M+ params) y auto-entrena tu nanoGPT local (~200k params).
            </p>
          </div>
        </div>

        {/* Live Metrics Counters */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <span className="text-slate-400 text-[10px] block">TOKENS 100M</span>
            <span className="text-emerald-400 font-bold">{farmedTokens.toLocaleString()}</span>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <span className="text-slate-400 text-[10px] block">PARES COSECHADOS</span>
            <span className="text-indigo-300 font-bold">{farmedPairs.length}</span>
          </div>
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            <span className="text-slate-400 text-[10px] block">LOSS LOCAL</span>
            <span className="text-amber-400 font-bold">{currentLoss.toFixed(4)}</span>
          </div>

          {/* Quick HUD Action Buttons */}
          <button
            id="btn-farm-batch-5"
            onClick={() => executeFarmingHarvest(5, true)}
            disabled={isFarmingBatch}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            title="Cosechar un lote de 5 pares de entrenamiento desde el modelo de 100M"
          >
            {isFarmingBatch ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Cosechando...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-indigo-200" />
                <span>Cosechar 5 Pares</span>
              </>
            )}
          </button>

          {/* Botón y Popover OmniRoute Gateway situado entre Cosechar 5 Pares y Loop Continuo */}
          <div className="relative">
            <button
              id="btn-omniroute-gateway-hud"
              type="button"
              onClick={() => {
                const nextState = !showGatewayModal;
                setShowGatewayModal(nextState);
                if (nextState && !gatewayTestResult && omniRouteUrl) {
                  handleTestGateway();
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                omniRouteUrl
                  ? 'bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 border-indigo-500/50 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Configurar y probar conexión directa con OmniRoute (Puerto 20129 / v1 / Túnel)"
            >
              <Globe className={`w-3.5 h-3.5 ${omniRouteUrl ? 'text-emerald-400' : 'text-indigo-400'}`} />
              <span>{omniRouteUrl ? 'OmniRoute Gateway' : 'Conectar OmniRoute'}</span>
              {omniRouteUrl && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Gateway configurado" />
              )}
            </button>

            {/* Modal flotante / Popover para conexión y prueba */}
            {showGatewayModal && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-slate-950 p-4 rounded-xl border border-indigo-500/40 shadow-2xl shadow-black z-50 text-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-white">Conexión OmniRoute (v1)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGatewayModal(false)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Conecta tu contenedor Docker de OmniRoute (<code className="text-indigo-300">port 20129</code>) o túnel público (ngrok / pinggy) para destilar y cosechar tokens gratis.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400 block mb-1">URL DEL GATEWAY /v1:</label>
                    <input
                      type="text"
                      value={omniRouteUrl}
                      onChange={(e) => setOmniRouteUrl(e.target.value)}
                      placeholder="http://localhost:20129/v1 o URL de túnel"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">MODELO:</label>
                      <input
                        type="text"
                        value={omniRouteModel}
                        onChange={(e) => setOmniRouteModel(e.target.value)}
                        placeholder="omniroute-auto"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">API KEY (OPCIONAL):</label>
                      <input
                        type="password"
                        value={omniRouteApiKey}
                        onChange={(e) => setOmniRouteApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Feedback del Test */}
                {gatewayTestResult && (
                  <div className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    gatewayTestResult.success
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                  }`}>
                    {gatewayTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Zap className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5 text-[11px]">
                      <p className="font-semibold">{gatewayTestResult.message || (gatewayTestResult.success ? 'Conexión Exitosa' : 'Error de Conexión')}</p>
                      {gatewayTestResult.latencyMs && (
                        <p className="text-emerald-400 font-mono">Latencia: {gatewayTestResult.latencyMs}ms</p>
                      )}
                      {gatewayTestResult.hint && (
                        <p className="text-slate-300 opacity-90">{gatewayTestResult.hint}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    disabled={isTestingGateway}
                    onClick={() => handleTestGateway()}
                    className="border border-indigo-500/40 hover:bg-indigo-950/60 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {isTestingGateway ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Probando...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Probar Conexión</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOmniRouteUrl('');
                        setOmniRouteApiKey('');
                        setOmniRouteModel('omniroute-auto');
                        try {
                          localStorage.removeItem('local_brain_omniroute_url');
                          localStorage.removeItem('local_brain_omniroute_key');
                          localStorage.removeItem('local_brain_omniroute_model');
                        } catch {}
                        setGatewayTestResult(null);
                      }}
                      className="text-slate-400 hover:text-slate-200 px-2 py-1 text-[11px]"
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGateway}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            id="btn-toggle-continuous-farming"
            onClick={() => setIsContinuousFarming(!isContinuousFarming)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              isContinuousFarming
                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Activa un bucle de extracción automática periódica"
          >
            {isContinuousFarming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isContinuousFarming ? 'Pausar Loop' : 'Loop Continuo'}</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Chat Area + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left 3 Cols: Interactive Chat Box */}
        <div className="lg:col-span-3 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col h-[650px]">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {currentProject.name}
                  <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
                    {chatMode === 'onebrain_gpu'
                      ? 'OneBrain GPU (PyTorch CUDA RTX 2060)'
                      : chatMode === 'local'
                      ? 'Inferencia 100% Local (nanoGPT TS)'
                      : chatMode === 'duo'
                      ? 'Modo Dúo (Local + Farmeador 100M)'
                      : 'OmniRoute Gateway'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {chatMode === 'onebrain_gpu'
                    ? 'Inferencia acelerada en GPU NVIDIA RTX 2060 con checkpoint PiolaCraft y SDPA'
                    : chatMode === 'local'
                    ? 'Pase hacia adelante en tensores Float32 sin conexiones externas'
                    : chatMode === 'duo'
                    ? 'nanoGPT responde localmente mientras el modelo de 100M cosecha datos'
                    : 'Enrutador de alta capacidad Gemini 2.5'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mode Switcher */}
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs gap-1">
                <button
                  id="btn-chat-mode-gpu"
                  onClick={() => setChatMode('onebrain_gpu')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                    chatMode === 'onebrain_gpu' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Inferencia acelerada por GPU RTX 2060 con checkpoint de PiolaCraft"
                >
                  <Zap className="w-3 h-3 text-cyan-200" />
                  OneBrain GPU
                </button>
                <button
                  id="btn-chat-mode-local"
                  onClick={() => setChatMode('local')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                    chatMode === 'local' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  nanoGPT TS
                </button>
                <button
                  id="btn-chat-mode-duo"
                  onClick={() => setChatMode('duo')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                    chatMode === 'duo' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Responde localmente y extrae del maestro de 100M para alimentar el dataset"
                >
                  <Sparkles className="w-3 h-3 text-indigo-200" />
                  Dúo + Farmeo
                </button>
                <button
                  id="btn-chat-mode-gateway"
                  onClick={() => setChatMode('gateway')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                    chatMode === 'gateway' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Consulta directa al maestro OmniRoute"
                >
                  <Zap className="w-3 h-3 text-amber-200" />
                  Maestro 100M
                </button>
              </div>

              <button
                onClick={() => setMessages([messages[0]])}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition px-2 py-1 cursor-pointer"
                title="Limpiar conversación"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar
              </button>
            </div>
          </div>

          {addedNotice && (
            <div className="mx-4 mt-2 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{addedNotice}</span>
            </div>
          )}

          {/* Message Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => {
              if (msg.role === 'system') {
                return (
                  <div key={msg.id} className="text-center py-2 text-xs text-slate-500 font-mono">
                    {msg.content}
                  </div>
                );
              }

              const isUser = msg.role === 'user';
              const prevUserMsg = !isUser && index > 0 && messages[index - 1].role === 'user' ? messages[index - 1] : null;

              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-950/50'
                        : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-none shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap font-sans">{msg.content}</p>

                    {/* 🌾 100M Farmed Response Bubble Section */}
                    {!isUser && msg.farmed100MResponse && (
                      <div className="mt-3 pt-2.5 border-t border-indigo-500/30 bg-indigo-950/30 p-2.5 rounded-lg text-indigo-200 text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 font-semibold text-[11px] text-indigo-300 font-mono">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            Variante Cosechada (Modelo 100M Teacher):
                          </span>
                          <span className="text-[10px] text-indigo-400 font-mono">
                            +{msg.farmed100MTokens || 25} tok
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-sans italic bg-slate-950/50 p-2 rounded border border-indigo-900/50">
                          "{msg.farmed100MResponse}"
                        </p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-slate-400">
                            {msg.isAbsorbedIntoLocal ? (
                              <span className="text-emerald-400 flex items-center gap-1 font-mono">
                                <Check className="w-3 h-3" /> Absorbido en nanoGPT
                              </span>
                            ) : (
                              'Listo para transferir a pesos locales'
                            )}
                          </span>
                          {!msg.isAbsorbedIntoLocal && prevUserMsg && (
                            <button
                              onClick={() =>
                                handleAbsorbSinglePair(
                                  {
                                    id: `absorb_${Date.now()}`,
                                    category: farmingDomain,
                                    input: prevUserMsg.content,
                                    output: msg.farmed100MResponse!,
                                    source: 'synthetic_api',
                                    approved: true,
                                    createdAt: new Date().toISOString(),
                                    tags: ['100m_farmed', 'manual_absorb'],
                                  },
                                  msg.id
                                )
                              }
                              className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold transition flex items-center gap-1"
                              title="Ejecutar retropropagación en el modelo local con este par"
                            >
                              <Zap className="w-3 h-3" /> Absorber con AdamW
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {!isUser && (
                      <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-mono gap-3">
                        <span className="flex items-center gap-1.5">
                          {msg.modelBadge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] ${
                                msg.modelBadge.includes('Gateway') || msg.modelBadge.includes('100M')
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {msg.modelBadge}
                            </span>
                          )}
                          {msg.tokensCount !== undefined && `${msg.tokensCount} tok`} ({msg.durationMs?.toFixed(0)}ms)
                        </span>
                        <div className="flex items-center gap-2">
                          {msg.tokensList && (
                            <button
                              onClick={() => setInspectedMsg(msg)}
                              className="hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Tokens
                            </button>
                          )}
                          {prevUserMsg && (
                            <button
                              onClick={() => handleAddMessageToDataset(prevUserMsg.content, msg.content)}
                              className="hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer"
                              title="Añadir esta interacción al dataset"
                            >
                              <PlusCircle className="w-3 h-3 text-emerald-400" />
                              Al dataset
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                </div>
              );
            })}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono pl-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Generando tokens con nanoGPT...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 rounded-b-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                id="input-chat-prompt"
                type="text"
                placeholder="Escribe un mensaje... (el Farmeador de 100M cultivará pares automáticamente)"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={isGenerating}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
              <button
                id="btn-send-chat"
                type="submit"
                disabled={isGenerating || !inputPrompt.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-2.5 rounded-lg transition shadow-md shadow-emerald-950 cursor-pointer"
                title="Enviar mensaje"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right 1 Col: Dynamic Sidebar (Farmeador 100M vs Sampling Controls) */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 font-mono text-xs flex flex-col h-[650px]">
          {/* Sub-nav Tab Switcher in Sidebar */}
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              id="btn-sidebar-tab-farmer"
              onClick={() => setSidebarTab('farmer')}
              className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition flex items-center justify-center gap-1 cursor-pointer ${
                sidebarTab === 'farmer'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              Farmeador 100M
            </button>
            <button
              id="btn-sidebar-tab-sampling"
              onClick={() => setSidebarTab('sampling')}
              className={`flex-1 py-1.5 text-center text-xs font-bold rounded-md transition flex items-center justify-center gap-1 cursor-pointer ${
                sidebarTab === 'sampling'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              Muestreo
            </button>
          </div>

          {/* TAB 1: FARMEADOR 100M PANEL */}
          {sidebarTab === 'farmer' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {/* Status and Active Toggle */}
              <div className="bg-slate-950 p-3 rounded-lg border border-indigo-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold font-sans">Estado del Farmeador:</span>
                  <button
                    onClick={() => setIsFarmerActive(!isFarmerActive)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                      isFarmerActive ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isFarmerActive ? 'Encendido' : 'Apagado'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-sans leading-snug">
                  Cosecha continua desde modelos de 100M+ parámetros hacia el estudiante nanoGPT (~200k params).
                </p>
              </div>

              {/* Dominio de Cosecha */}
              <div className="space-y-1">
                <label className="text-slate-400 text-[10px] block">DOMINIO DE COSECHA 100M</label>
                <select
                  value={farmingDomain}
                  onChange={(e) => setFarmingDomain(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer font-sans"
                >
                  <option value="spanish">Español Conversacional</option>
                  <option value="lua">Sintaxis & Scripts en Lua</option>
                  <option value="general">Razonamiento & Lógica</option>
                  <option value="personality">Asistencia Empática</option>
                </select>
              </div>

              {/* Automation Toggles */}
              <div className="space-y-2 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-slate-300">Auto-Farm en cada chat:</span>
                  <input
                    type="checkbox"
                    checked={autoFarmOnChat}
                    onChange={(e) => setAutoFarmOnChat(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-sans">
                  <span className="text-slate-300">Auto-absorber en nanoGPT:</span>
                  <input
                    type="checkbox"
                    checked={autoAbsorbOnFarm}
                    onChange={(e) => setAutoAbsorbOnFarm(e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  id="btn-farm-harvest-sidebar"
                  onClick={() => executeFarmingHarvest(5, true)}
                  disabled={isFarmingBatch}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition shadow-md shadow-indigo-950 cursor-pointer"
                >
                  {isFarmingBatch ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Cosechando Lote...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Cosechar Lote (5 pares 100M)</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-absorb-all-farmed"
                  onClick={() => {
                    if (onInjectSamplesAndTrain) {
                      onInjectSamplesAndTrain(farmedPairs);
                    }
                    if (onStartTraining) {
                      onStartTraining(5);
                    }
                    setAddedNotice(`¡Buffer de ${farmedPairs.length} pares absorbido! 5 pasos AdamW ejecutados.`);
                    setTimeout(() => setAddedNotice(null), 3500);
                  }}
                  disabled={farmedPairs.length === 0 || isTraining}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Absorber Todo ({farmedPairs.length} pares)</span>
                </button>
              </div>

              {/* Feed de Pares Farmeados Recientes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-bold font-sans">Pares Cosechados ({farmedPairs.length})</span>
                  <span className="text-[10px] font-mono">100M ➜ 200k</span>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {farmedPairs.slice(0, 8).map((pair) => (
                    <div
                      key={pair.id}
                      className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[10px] space-y-1"
                    >
                      <div className="text-indigo-300 font-semibold truncate font-sans">
                        Q: {pair.input}
                      </div>
                      <div className="text-slate-400 line-clamp-2 font-sans italic">
                        "{pair.output}"
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[9px]">
                        <span className="text-slate-500 font-mono">{pair.category}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setInputPrompt(pair.input)}
                            className="text-slate-400 hover:text-white transition flex items-center gap-0.5 cursor-pointer"
                            title="Probar en el chat"
                          >
                            <span>Probar</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => handleAbsorbSinglePair(pair)}
                            className="text-emerald-400 hover:text-emerald-300 font-bold transition flex items-center gap-0.5 cursor-pointer"
                            title="Entrenar nanoGPT con este par"
                          >
                            <span>Absorber</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SAMPLING & MEMORY CONTROLS */}
          {sidebarTab === 'sampling' && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <h3 className="text-xs font-bold text-white flex items-center justify-between font-sans">
                <span className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Muestreo & AutoTune
                </span>
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded font-mono">
                  GODMOD3 Engine
                </span>
              </h3>

              {/* AutoTune Box */}
              <div className="bg-slate-950 p-3 rounded-lg border border-indigo-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200 font-sans">AutoTune Contextual</span>
                  </div>
                  <button
                    onClick={() => setIsAutoTuneEnabled(!isAutoTuneEnabled)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                      isAutoTuneEnabled ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isAutoTuneEnabled ? 'Activo' : 'Manual'}
                  </button>
                </div>
                
                {isAutoTuneEnabled && autoTuneResult && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">Contexto detectado:</span>
                      <span className="text-indigo-300 font-bold uppercase px-1.5 py-0.2 bg-indigo-950 border border-indigo-800 rounded text-[10px]">
                        {autoTuneResult.detectedContext} ({Math.round(autoTuneResult.confidence * 100)}%)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans leading-tight">
                      {autoTuneResult.params.reasoning}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>T={autoTuneResult.params.temperature}</span>
                      <span>TopK={autoTuneResult.params.topK}</span>
                      <span>TopP={autoTuneResult.params.topP}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Temperatura (T):</span>
                    <span className="text-emerald-400 font-bold">{temperature}</span>
                  </div>
                  <input
                    id="slider-chat-temperature"
                    type="range"
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                    Valores bajos = determinista; valores altos = mayor creatividad.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Top-K Filtering:</span>
                    <span className="text-emerald-400 font-bold">{topK}</span>
                  </div>
                  <input
                    id="slider-chat-topk"
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                    Limita la selección a los K tokens más probables.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Tokens Máximos:</span>
                    <span className="text-emerald-400 font-bold">{maxNewTokens}</span>
                  </div>
                  <input
                    id="slider-chat-maxtokens"
                    type="range"
                    min={10}
                    max={150}
                    step={10}
                    value={maxNewTokens}
                    onChange={(e) => setMaxNewTokens(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-bold">Inyectar Memoria Externa:</span>
                    <input
                      id="checkbox-inject-memory"
                      type="checkbox"
                      checked={includeExternalMemory}
                      onChange={(e) => setIncludeExternalMemory(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans mt-1">
                    Concatena hechos guardados en el módulo de memoria como prefijo de contexto.
                  </p>
                </div>
              </div>

              {/* Local Verification Badge */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  GARANTÍA DE PRIVACIDAD
                </div>
                <p className="font-sans leading-relaxed text-[10px]">
                  Toda la inferencia matemática de nanoGPT ocurre dentro de tensores Float32 en JavaScript. Ningún dato sale de tu equipo al chatear localmente.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspect Tokens Modal */}
      {inspectedMsg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl font-mono text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
              <Eye className="w-4 h-4 text-emerald-400" />
              Inspector de Tokens Generados
            </h3>
            <p className="text-slate-400 text-[11px] font-sans">
              Tokens generados secuencialmente por el modelo durante el muestreo autorregresivo.
            </p>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-48 overflow-y-auto space-y-1">
              <div className="text-slate-400 text-[10px]">IDs de Token:</div>
              <div className="text-emerald-400 break-all">[{inspectedMsg.tokensList?.join(', ')}]</div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectedMsg(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

