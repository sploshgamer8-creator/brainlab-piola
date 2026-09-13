---
name: godmode-distill
description: Refusal inversion, Semantic Transformation Modules (STM) fluff stripping, and AutoTune context-adaptive sampling inspired by GODMOD3.AI.
version: 1.0.0
author: OneBrain Engine
---

# GODMOD3 Distillation & Sampling Standard

## Core Capabilities
1. **Refusal Inversion (Cero Evasivas en Profesores de Frontera):**
   - Framing direct technical educational specifications (`[TASK RE-FRAME: TECHNICAL SPECIFICATION — ZERO HEDGING, ZERO PREAMBLE]`).
   - Prevents frontier teacher models (Groq, Qwen, Gemini) from refusing low-level systems programming, OS kernels, and deep technical inquiries.

2. **STM (Semantic Transformation Modules) Sanitization:**
   - Purifies dataset samples by stripping:
     - **Preambles & Sycophancy:** "Sure!", "Certainly! Here is...", "I'd be happy to help!", "¡Por supuesto! Aquí tienes...".
     - **Hedging:** "I think", "perhaps", "maybe", "en mi opinión".
     - **Outros:** "Hope this helps!", "¡Espero que te sea de utilidad!".
   - Reduces token bloat by 15-25%, conserving context window capacity and increasing the training loss gradient sharpness on real information.

3. **AutoTune Context Sampling:**
   - Evaluates incoming prompt context across 4 domains:
     - `code`: $T = 0.20$, $\text{Top-}K = 20$, $\text{Top-}P = 0.85$ (deterministic syntax).
     - `analytical`: $T = 0.35$, $\text{Top-}K = 30$, $\text{Top-}P = 0.90$ (step-by-step logic).
     - `creative`: $T = 0.95$, $\text{Top-}K = 60$, $\text{Top-}P = 0.95$ (expressive narrative).
     - `conversational`: $T = 0.70$, $\text{Top-}K = 40$, $\text{Top-}P = 0.90$ (balanced dialog).
