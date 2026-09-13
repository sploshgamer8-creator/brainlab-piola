---
name: scrapling-stealth
description: Undetectable web scraping, TLS fingerprint emulation, Cloudflare Turnstile bypass, and CSS selector cleaning.
version: 1.0.0
author: OneBrain Engine
---

# Scrapling Stealth Web Ingestion

## Capabilities
- Stealth HTTP fetching with modern browser headers and TLS fingerprint emulation.
- Cloudflare Turnstile and Bot-Detection bypass.
- Intelligent HTML-to-text extraction filtering out navigation bars, footers, script tags, and tracking scripts.
- Precise CSS selector targeting for documentation, blogs, and technical articles.

## Execution Rules
1. **Endpoint:** `POST /api/harvest/scrapling`
   - Payload: `{ url: string, cssSelector?: string }`
2. **Text Cleaning:**
   - Always strip excessive blank lines, base64 data URIs, and embedded SVG icons.
   - Limit extracted document chunk sizes to prevent LLM context overflow.
3. **Resilience & Fallback:**
   - If Scrapling encounters a strict CAPTCHA or blocked IP, fall back immediately to `Obscura (Rust Headless Browser)` or `Agent Reach`.
