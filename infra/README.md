# Infrastructure for OneBrain experiments

This directory contains the full stack needed to benchmark and iterate on architectural blocks.

```
infra/
├─ repos/            # All cloned GitHub repositories
├─ env/              # Conda/venv environment (created by create_env.sh)
├─ benchmarks/       # Benchmark harness and results
├─ scripts/          # Helper scripts (clone, env creation, builds)
└─ datasets/         # Tokens harvested and standard evaluation datasets
```

All scripts are written for a Unix‑like shell (bash). They work on Windows with Git‑Bash or WSL.

**Next steps**
1. Run `bash infra/scripts/clone_repos.sh` to fetch the repos.
2. Run `bash infra/scripts/create_env.sh` to set up the Python environment.
3. Build optional high‑performance libraries (e.g., FlashAttention) with the provided build scripts.
4. Use `python infra/benchmarks/benchmark.py …` to compare different model blocks.
