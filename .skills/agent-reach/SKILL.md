---
name: agent-reach
description: Multi-platform public content ingestion without paid API keys (YouTube transcripts, GitHub repos, Reddit discussions, RSS feeds).
version: 1.0.0
author: OneBrain Engine
---

# Agent Reach Multi-Platform Ingestion

## Supported Targets
1. **YouTube (`platform: 'youtube'`):**
   - Extracts full video transcripts and titles using public timedtext endpoints.
   - Ideal for coding lectures, conferences, and technical interviews.
2. **GitHub (`platform: 'github'`):**
   - Fetches repository READMEs, documentation, and raw file trees via `raw.githubusercontent.com` and public API endpoints.
3. **Reddit (`platform: 'reddit'`):**
   - Extracts top threads and comments using public `.json` endpoints (e.g., `reddit.com/r/MachineLearning.json`).
4. **RSS / Atom (`platform: 'rss'`):**
   - Parses engineering blogs, arXiv feeds, and project release notes.

## Execution Rules
- **Endpoint:** `POST /api/harvest/reach`
- Payload: `{ platform: 'youtube' | 'github' | 'reddit' | 'rss', target: string, limit?: number }`
- Always forward the clean extracted text buffer directly to `ScrapeGraphAI Pipeline` (`POST /api/harvest/synthesize`) to format into NanoGPT instruction-output pairs.
