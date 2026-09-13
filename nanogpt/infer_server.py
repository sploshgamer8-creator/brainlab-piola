"""
OneBrain Persistent GPU Inference Server
Mantiene los modelos OneBrainGPT y el NanoTokenizer cargados en VRAM (CUDA/PyTorch)
para servir inferencias en tiempo real de ultra-baja latencia (<80ms) via HTTP JSON.
"""

import os
import sys
import time
import json
import argparse
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import torch

sys.path.append(os.path.dirname(__file__))
from modern_model import OneBrainConfig, OneBrainGPT

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'scratch'))
try:
    from tokenizer import PythonNanoTokenizer
except ImportError:
    sys.path.append('C:/Users/totol/.gemini/antigravity/brain/2af92075-19fb-4def-9609-b448b953a675/scratch')
    from tokenizer import PythonNanoTokenizer

# Estado global del worker
device = 'cuda' if torch.cuda.is_available() else 'cpu'
tokenizer = None
model_cache = {}
model_lock = threading.Lock()

def get_or_load_model(ckpt_rel_path):
    ckpt_path = os.path.join(os.path.dirname(__file__), ckpt_rel_path)
    if not os.path.exists(ckpt_path):
        fallback = os.path.join(os.path.dirname(__file__), "checkpoints", "onebrain_best.pt")
        if os.path.exists(fallback):
            ckpt_path = fallback
        else:
            raise FileNotFoundError(f"Checkpoint no encontrado: {ckpt_rel_path}")

    norm_path = os.path.normpath(ckpt_path)
    file_mtime = os.path.getmtime(norm_path)
    with model_lock:
        if norm_path in model_cache and model_cache[norm_path].get("mtime", 0) >= file_mtime:
            return model_cache[norm_path]

        checkpoint = torch.load(norm_path, map_location=device, weights_only=False)
        config = checkpoint['config']
        model = OneBrainGPT(config).to(device)
        model.load_state_dict(checkpoint['model_state'])
        model.eval()

        model_cache[norm_path] = {
            "model": model,
            "config": config,
            "params_count": model.get_num_params(),
            "filename": os.path.basename(norm_path),
            "mtime": file_mtime
        }
        return model_cache[norm_path]

class InferenceHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silenciar logs ruidosos para mantener consola limpia
        pass

    def do_GET(self):
        if self.path == '/health' or self.path == '/api/health':
            vram_mb = round(torch.cuda.memory_allocated(0) / 1024**2, 2) if device == 'cuda' else 0.0
            resp = {
                "status": "ok",
                "worker": "persistent",
                "device": device,
                "vram_allocated_mb": vram_mb,
                "cached_models": [info["filename"] for info in model_cache.values()]
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == '/infer' or self.path == '/api/infer':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode('utf-8') if body else '{}')
                prompt = (data.get('prompt') or '').strip()
                if not prompt:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Prompt requerido"}).encode('utf-8'))
                    return

                ckpt_req = data.get('checkpoint') or 'checkpoints/onebrain_piolacraft.pt'
                max_tokens = min(256, max(5, int(data.get('maxTokens') or data.get('max_tokens') or 60)))
                temperature = max(0.1, min(1.5, float(data.get('temperature') or 0.7)))
                top_k = max(1, min(100, int(data.get('topK') or data.get('top_k') or 40)))

                # Cargar modelo desde cache
                model_entry = get_or_load_model(ckpt_req)
                model = model_entry["model"]

                # Tokenizar prompt
                prompt_ids = tokenizer.encode(prompt)
                x = torch.tensor(prompt_ids, dtype=torch.long, device=device).unsqueeze(0)

                t0 = time.time()
                with torch.no_grad():
                    out_ids = model.generate(x, max_new_tokens=max_tokens, temperature=temperature, top_k=top_k)
                duration_ms = (time.time() - t0) * 1000.0

                raw_ids = out_ids[0].cpu().numpy().tolist()
                generated_text = tokenizer.decode(raw_ids)
                prompt_len = len(prompt_ids)
                new_token_ids = raw_ids[prompt_len:]
                response_text = tokenizer.decode(new_token_ids).replace('<|endoftext|>', '').strip()
                tokens_count = len(new_token_ids)
                tok_per_sec = (tokens_count / (duration_ms / 1000.0)) if duration_ms > 0 else 0.0

                resp = {
                    "success": True,
                    "prompt": prompt,
                    "response": response_text,
                    "full_text": generated_text,
                    "tokens_generated": tokens_count,
                    "duration_ms": round(duration_ms, 2),
                    "tokens_per_sec": round(tok_per_sec, 2),
                    "device": device,
                    "params_count": model_entry["params_count"],
                    "checkpoint": model_entry["filename"],
                    "worker": "persistent"
                }

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def main():
    global tokenizer
    parser = argparse.ArgumentParser(description="OneBrain Persistent Inference Server")
    parser.add_argument("--port", type=int, default=5005, help="Puerto HTTP (def: 5005)")
    parser.add_argument("--preload", type=str, default="checkpoints/onebrain_piolacraft.pt", help="Checkpoint a precalentar")
    args = parser.parse_args()

    print("=" * 60)
    print("[ONEBRAIN] PERSISTENT GPU INFERENCE WORKER")
    print(f"Device: {device.upper()} ({torch.cuda.get_device_name(0) if device=='cuda' else 'CPU'})")
    print("=" * 60)

    tokenizer = PythonNanoTokenizer()
    print("[+] NanoTokenizer cargado en memoria.")

    print(f"[+] Precargando checkpoint: {args.preload}...")
    entry = get_or_load_model(args.preload)
    print(f"[OK] Modelo '{entry['filename']}' ({entry['params_count']/1e6:.2f}M) listo y caliente en VRAM.")

    server_address = ('127.0.0.1', args.port)
    httpd = HTTPServer(server_address, InferenceHandler)
    print(f"[+] Inference Worker escuchando en http://127.0.0.1:{args.port}")
    print("[+] Latencia esperada por inferencia: <80ms.")
    print("Presiona Ctrl+C para finalizar.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando Inference Worker...")
        httpd.server_close()

if __name__ == '__main__':
    main()
