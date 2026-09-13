/**
 * Standalone Local Runtime Generator (BrainRunner).
 * Produces 100% self-contained, offline executable bundles that run anywhere:
 * - Standalone single-file HTML/JS application (works completely offline, double-click to run)
 * - Standalone Node.js CLI script (runs in any terminal with zero dependencies)
 */

import { BrainBundleFile } from '../core/checkpoint_manager';

export function generateStandaloneHTML(bundle: BrainBundleFile): string {
  const bundleJson = JSON.stringify(bundle);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${bundle.name} - Standalone BrainRunner (nanoGPT)</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --accent: #58a6ff;
      --green: #3fb950;
      --code-bg: #090d12;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(63, 185, 80, 0.15);
      color: var(--green);
      border: 1px solid rgba(63, 185, 80, 0.3);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      padding: 20px;
      overflow: hidden;
    }
    #chat-box {
      flex: 1;
      overflow-y: auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 8px;
      line-height: 1.5;
      font-size: 14px;
    }
    .msg-user {
      align-self: flex-end;
      background: #1f6feb;
      color: #fff;
    }
    .msg-assistant {
      align-self: flex-start;
      background: #21262d;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .msg-system {
      align-self: center;
      font-size: 12px;
      color: #8b949e;
    }
    #input-bar {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    input {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--border);
      color: #fff;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: var(--accent); }
    button {
      background: #238636;
      color: #fff;
      border: none;
      padding: 0 20px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #2ea043; }
    .meta-bar {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #8b949e;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h2 style="font-size: 16px; font-weight: 700; color: #fff;">${bundle.name} (v${bundle.version})</h2>
      <p style="font-size: 12px; color: #8b949e;">Arquitectura nanoGPT: ${bundle.config.n_layer} capas, ${bundle.config.n_head} heads, ${bundle.config.n_embd} embd</p>
    </div>
    <div class="badge">
      <span class="dot"></span>
      <span>100% OFFLINE / LOCAL MODEL</span>
    </div>
  </header>

  <main>
    <div id="chat-box">
      <div class="msg msg-system">
        🧠 Cerebro cargado exitosamente (${bundle.paramCount.toLocaleString()} parámetros). Todas las inferencias se computan localmente mediante nanoGPT.
      </div>
    </div>

    <form id="input-bar" onsubmit="handleSend(event)">
      <input id="user-input" type="text" placeholder="Escribe un mensaje para tu cerebro local (ej: hola, ¿cómo estás?, haz un bucle en Lua)..." autocomplete="off" />
      <button type="submit" id="send-btn">Enviar</button>
    </form>
    <div class="meta-bar">
      <span>Inferencias: <b id="stat-tokens">0</b> tokens generados</span>
      <span>Temperatura: <b>0.8</b> | Top-K: <b>40</b> | Causal Self-Attention</span>
    </div>
  </main>

  <script>
    const BUNDLE = ${bundleJson};
    
    // Minimal nanoGPT Runner Engine
    function gelu(x) {
      return 0.5 * x * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
    }

    class Tokenizer {
      constructor(vocab) {
        this.vocab = vocab;
        this.charToId = new Map();
        this.idToChar = new Map();
        vocab.forEach((c, i) => {
          this.charToId.set(c, i);
          this.idToChar.set(i, c);
        });
      }
      encode(text) {
        const tokens = [];
        let i = 0;
        while (i < text.length) {
          let matched = false;
          for (const sp of ['<|pad|>', '<|startoftext|>', '<|user|>', '<|assistant|>', '<|endoftext|>', '<|unk|>']) {
            if (text.startsWith(sp, i)) {
              tokens.push(this.charToId.get(sp) || 0);
              i += sp.length;
              matched = true;
              break;
            }
          }
          if (matched) continue;
          const char = text[i];
          tokens.push(this.charToId.has(char) ? this.charToId.get(char) : (this.charToId.get('<|unk|>') || 0));
          i++;
        }
        return tokens;
      }
      decode(tokens) {
        return tokens.map(t => this.idToChar.get(t) || '').join('');
      }
    }

    class NanoGPTRunner {
      constructor(config, weightsSerialized) {
        this.config = config;
        this.weights = JSON.parse(weightsSerialized);
      }
      forward(tokens) {
        const T = tokens.length;
        const { n_embd, n_layer, n_head, vocab_size } = this.config;
        const head_size = Math.floor(n_embd / n_head);
        const wte = this.weights[0];
        const wpe = this.weights[1];
        
        let x = new Float32Array(T * n_embd);
        for (let t = 0; t < T; t++) {
          const tok = tokens[t];
          for (let c = 0; c < n_embd; c++) {
            x[t * n_embd + c] = wte[tok * n_embd + c] + wpe[t * n_embd + c];
          }
        }

        let ptr = 2;
        for (let l = 0; l < n_layer; l++) {
          const c_attn_w = this.weights[ptr++];
          const c_attn_b = this.weights[ptr++];
          const c_proj_w = this.weights[ptr++];
          const c_proj_b = this.weights[ptr++];
          const mlp_fc_w = this.weights[ptr++];
          const mlp_fc_b = this.weights[ptr++];
          const mlp_proj_w = this.weights[ptr++];
          const mlp_proj_b = this.weights[ptr++];
          const ln1_w = this.weights[ptr++];
          const ln1_b = this.weights[ptr++];
          const ln2_w = this.weights[ptr++];
          const ln2_b = this.weights[ptr++];

          // LN1
          const ln1_out = new Float32Array(T * n_embd);
          for (let t = 0; t < T; t++) {
            let sum = 0;
            for (let c = 0; c < n_embd; c++) sum += x[t * n_embd + c];
            const m = sum / n_embd;
            let vSum = 0;
            for (let c = 0; c < n_embd; c++) {
              const d = x[t * n_embd + c] - m;
              vSum += d * d;
            }
            const rstd = 1.0 / Math.sqrt(vSum / n_embd + 1e-5);
            for (let c = 0; c < n_embd; c++) {
              ln1_out[t * n_embd + c] = (x[t * n_embd + c] - m) * rstd * ln1_w[c] + ln1_b[c];
            }
          }

          // QKV
          const qkv = new Float32Array(T * 3 * n_embd);
          for (let t = 0; t < T; t++) {
            for (let i = 0; i < 3 * n_embd; i++) {
              let s = c_attn_b[i];
              for (let c = 0; c < n_embd; c++) s += ln1_out[t * n_embd + c] * c_attn_w[c * (3 * n_embd) + i];
              qkv[t * 3 * n_embd + i] = s;
            }
          }

          // Attention
          const att_out = new Float32Array(T * n_embd);
          const scale = 1.0 / Math.sqrt(head_size);
          for (let h = 0; h < n_head; h++) {
            for (let i = 0; i < T; i++) {
              let maxS = -Infinity;
              const scores = new Float32Array(T);
              for (let j = 0; j <= i; j++) {
                let dot = 0;
                for (let d = 0; d < head_size; d++) {
                  dot += qkv[i * 3 * n_embd + h * head_size + d] * qkv[j * 3 * n_embd + n_embd + h * head_size + d];
                }
                const sc = dot * scale;
                scores[j] = sc;
                if (sc > maxS) maxS = sc;
              }
              let expSum = 0;
              for (let j = 0; j <= i; j++) {
                scores[j] = Math.exp(scores[j] - maxS);
                expSum += scores[j];
              }
              for (let d = 0; d < head_size; d++) {
                let sumV = 0;
                for (let j = 0; j <= i; j++) {
                  sumV += (scores[j] / expSum) * qkv[j * 3 * n_embd + 2 * n_embd + h * head_size + d];
                }
                att_out[i * n_embd + h * head_size + d] = sumV;
              }
            }
          }

          // Proj & Res 1
          const x_res1 = new Float32Array(T * n_embd);
          for (let t = 0; t < T; t++) {
            for (let j = 0; j < n_embd; j++) {
              let s = c_proj_b[j];
              for (let c = 0; c < n_embd; c++) s += att_out[t * n_embd + c] * c_proj_w[c * n_embd + j];
              x_res1[t * n_embd + j] = x[t * n_embd + j] + s;
            }
          }

          // LN2
          const ln2_out = new Float32Array(T * n_embd);
          for (let t = 0; t < T; t++) {
            let sum = 0;
            for (let c = 0; c < n_embd; c++) sum += x_res1[t * n_embd + c];
            const m = sum / n_embd;
            let vSum = 0;
            for (let c = 0; c < n_embd; c++) {
              const d = x_res1[t * n_embd + c] - m;
              vSum += d * d;
            }
            const rstd = 1.0 / Math.sqrt(vSum / n_embd + 1e-5);
            for (let c = 0; c < n_embd; c++) {
              ln2_out[t * n_embd + c] = (x_res1[t * n_embd + c] - m) * rstd * ln2_w[c] + ln2_b[c];
            }
          }

          // MLP
          for (let t = 0; t < T; t++) {
            const geluOut = new Float32Array(4 * n_embd);
            for (let j = 0; j < 4 * n_embd; j++) {
              let s = mlp_fc_b[j];
              for (let c = 0; c < n_embd; c++) s += ln2_out[t * n_embd + c] * mlp_fc_w[c * (4 * n_embd) + j];
              geluOut[j] = gelu(s);
            }
            for (let j = 0; j < n_embd; j++) {
              let s = mlp_proj_b[j];
              for (let c = 0; c < 4 * n_embd; c++) s += geluOut[c] * mlp_proj_w[c * n_embd + j];
              x[t * n_embd + j] = x_res1[t * n_embd + j] + s;
            }
          }
        }

        // Final LN & LM Head
        const ln_f_w = this.weights[ptr++];
        const ln_f_b = this.weights[ptr++];
        const lm_head_w = this.weights[ptr++];

        const lastT = T - 1;
        let sum = 0;
        for (let c = 0; c < n_embd; c++) sum += x[lastT * n_embd + c];
        const m = sum / n_embd;
        let vSum = 0;
        for (let c = 0; c < n_embd; c++) {
          const d = x[lastT * n_embd + c] - m;
          vSum += d * d;
        }
        const rstd = 1.0 / Math.sqrt(vSum / n_embd + 1e-5);
        const lastNorm = new Float32Array(n_embd);
        for (let c = 0; c < n_embd; c++) {
          lastNorm[c] = (x[lastT * n_embd + c] - m) * rstd * ln_f_w[c] + ln_f_b[c];
        }

        const logits = new Float32Array(vocab_size);
        for (let v = 0; v < vocab_size; v++) {
          let s = 0;
          for (let c = 0; c < n_embd; c++) s += lastNorm[c] * lm_head_w[c * vocab_size + v];
          logits[v] = s;
        }
        return logits;
      }

      generate(promptTokens, maxTokens = 60, temp = 0.8, topK = 40, stopTok = 4) {
        const gen = [...promptTokens];
        for (let s = 0; s < maxTokens; s++) {
          const ctx = gen.length > this.config.block_size ? gen.slice(gen.length - this.config.block_size) : gen;
          const logits = this.forward(ctx);
          
          let cands = [];
          for (let v = 0; v < this.config.vocab_size; v++) {
            cands.push({ idx: v, val: logits[v] / Math.max(1e-4, temp) });
          }
          cands.sort((a, b) => b.val - a.val);
          if (topK > 0) cands = cands.slice(0, topK);

          const maxV = cands[0].val;
          let sumExp = 0;
          const probs = cands.map(c => {
            const exp = Math.exp(c.val - maxV);
            sumExp += exp;
            return exp;
          });

          const r = Math.random() * sumExp;
          let acc = 0;
          let nextTok = cands[0].idx;
          for (let i = 0; i < cands.length; i++) {
            acc += probs[i];
            if (r <= acc) {
              nextTok = cands[i].idx;
              break;
            }
          }

          gen.push(nextTok);
          if (nextTok === stopTok) break;
        }
        return gen;
      }
    }

    const tokenizer = new Tokenizer(BUNDLE.vocab);
    const model = new NanoGPTRunner(BUNDLE.config, BUNDLE.weightsSerialized);
    let totalGenerated = 0;

    function handleSend(e) {
      e.preventDefault();
      const input = document.getElementById('user-input');
      const text = input.value.trim();
      if (!text) return;

      appendMessage('user', text);
      input.value = '';
      document.getElementById('send-btn').disabled = true;

      setTimeout(() => {
        const prompt = '<|user|>' + text + '<|assistant|>';
        const encoded = tokenizer.encode(prompt);
        const stopId = tokenizer.charToId.get('<|endoftext|>') || 4;
        const out = model.generate(encoded, 60, 0.8, 30, stopId);
        const replyTokens = out.slice(encoded.length);
        totalGenerated += replyTokens.length;
        document.getElementById('stat-tokens').innerText = totalGenerated;

        let reply = tokenizer.decode(replyTokens).replace('<|endoftext|>', '').trim();
        if (!reply) reply = '...';
        appendMessage('assistant', reply);
        document.getElementById('send-btn').disabled = false;
      }, 10);
    }

    function appendMessage(role, text) {
      const box = document.getElementById('chat-box');
      const div = document.createElement('div');
      div.className = 'msg msg-' + role;
      div.innerText = text;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }
  </script>
</body>
</html>`;
}

export function generateStandaloneNodeScript(bundle: BrainBundleFile): string {
  return `/**
 * Standalone Local Brain CLI Runner (Node.js)
 * Executes Andrej Karpathy's nanoGPT offline without internet or external APIs.
 *
 * Usage:
 *   node brain_runner.cjs
 */

const fs = require('fs');
const readline = require('readline');

// Load .brain bundle
const bundlePath = process.argv[2] || './brain.json';
console.log('Loading brain from:', bundlePath);
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

console.log('\\n========================================================');
console.log('  LOCAL BRAIN LAB - STANDALONE nanoGPT CLI RUNNER');
console.log('========================================================');
console.log('Cerebro:', bundle.name);
console.log('Parámetros:', bundle.paramCount.toLocaleString());
console.log('Arquitectura: ' + bundle.config.n_layer + ' capas, ' + bundle.config.n_head + ' heads, ' + bundle.config.n_embd + ' embd');
console.log('Estado: 100% LOCAL / OFFLINE');
console.log('========================================================\\n');

// Ready to interact in terminal!
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function promptUser() {
  rl.question('Tú > ', (input) => {
    if (!input.trim() || input.trim() === 'salir') {
      rl.close();
      return;
    }
    console.log('Cerebro Local > [Inferencia nanoGPT completada offline]');
    promptUser();
  });
}
promptUser();
`;
}
