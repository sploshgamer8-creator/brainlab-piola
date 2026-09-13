---
name: model-growth
description: ZeroBlockInsert weight doubling protocols, identity projection, and progressive model depth scaling without loss spikes.
version: 1.0.0
author: OneBrain Engine
---

# Model Growth Protocol (ZeroBlockInsert)

## Core Principle
Model growth enables expanding the depth of a trained Transformer (e.g. from 4 layers to 8 layers) while mathematically preserving 100% of the learned representations:
$$\Delta \text{Logits} = 0.000000$$

## Mechanism
1. **Layer Duplication / Interleaving:**
   - New Transformer blocks are inserted after existing trained blocks.
   - Attention weights and MLP feed-forward matrices are initialized from the previous layer or Gaussian weights.
2. **Zero-Projection Identity:**
   - The final residual projection weights ($c\_proj$ in Self-Attention and $c\_proj$ in MLP) of the newly inserted layers are initialized strictly to **0.0**.
   - As a result:
     $$\text{Block}(x) = x + \text{Residual}(x) = x + 0 = x$$
   - The network output before any new training steps is bit-for-bit identical to the unexpanded model.
3. **Progressive Unfreezing & Training:**
   - Train the model on new shards. The zero-initialized residual projections smoothly diverge from zero as AdamW updates the parameters, absorbing new capacity without catastrophic forgetting.
