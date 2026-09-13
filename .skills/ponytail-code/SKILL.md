---
name: ponytail-code
description: Anti-overengineering standard, Laziness Ladder, and compact single-line coding discipline for OneBrain.
version: 1.0.0
author: OneBrain Engine
---

# Ponytail Code Discipline

## Philosophy
Write the absolute minimum code necessary to solve the problem reliably. Reject premature abstractions, enterprise bloat, and defensive boilerplate.

## The Laziness Ladder (Prioridad de Ejecución)
Before adding any code or dependency, climb down the ladder in order:

1. **Standard Library First:**
   - Always leverage built-in Node.js / JavaScript / Python capabilities (`fs`, `path`, `fetch`, `crypto`, `os`) before adding external packages.
2. **Inline & Single-Line Utility Functions:**
   - If an operation can be expressed cleanly in 1-3 lines, write it inline. Do not create separate "utility helper manager factory" files.
3. **No Premature Abstractions:**
   - Do not create an abstract class or generic interface until you have at least 3 distinct, proven consumers requiring polymorphism.
4. **File Size Budget:**
   - Strive to keep modules under 100 lines. If a single file exceeds 300 lines, isolate distinct responsibilities.
5. **Direct Data Flow:**
   - Prefer plain objects and pure functions over complex class hierarchies. State should flow linearly.

## Anti-Patterns to Reject
- Creating custom wrapper types for primitive values without invariant enforcement.
- Wrapping fetch in 4 layers of middleware when a direct call suffices.
- Adding unneeded micro-packages (e.g. `is-number`, `left-pad`).
