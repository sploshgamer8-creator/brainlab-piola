---
name: obscura-runner
description: Ultralight Rust headless browser execution, V8 JavaScript runtime, DOM dumping, and CDP port 9222 integration.
version: 1.0.0
author: OneBrain Engine
---

# Obscura Runner (Rust Headless Browser)

## Highlights
- Written in Rust with embedded V8 JavaScript execution.
- Consumes only ~30MB RAM (compared to 200MB+ for standard Chromium instances).
- Cold startup time < 100ms.
- Built-in Chrome DevTools Protocol (CDP) on `http://127.0.0.1:9222`.

## Execution Modes
1. **Plain Text Dump (`dump: 'text'`):**
   - Renders DOM, evaluates scripts, and outputs clean readable text.
2. **HTML Dump (`dump: 'html'`):**
   - Volcado completo del DOM post-hidratación JS.
3. **Links Dump (`dump: 'links'`):**
   - Extrae todos los hipervínculos para rastreo recursivo (crawler).
4. **JS Evaluation (`evalScript`):**
   - Ejecuta expresiones JavaScript arbitrarias en el contexto de la página (ej. `document.title`, `window.__INITIAL_STATE__`).

## Execution Rules
- **Endpoint:** `POST /api/harvest/obscura`
- Payload: `{ url: string, dump?: 'text' | 'html' | 'links', evalScript?: string, stealth?: boolean, timeoutSecs?: number }`
- **Status Endpoint:** `GET /api/harvest/obscura/status`
