"""
Sample from a trained nanoGPT model.
Origin: Andrej Karpathy's nanoGPT (https://github.com/karpathy/nanoGPT)
"""

import os
import pickle
import torch
from model import GPTConfig, GPT

init_from = 'resume' # either 'resume' (from an out_dir) or a gpt2 variant (e.g. 'gpt2-xl')
out_dir = 'out' # ignored if init_from is not 'resume'
start = "\n" # or "<|user|>hola<|assistant|>"
num_samples = 3 # number of samples to draw
max_new_tokens = 60 # number of tokens generated in each sample
temperature = 0.8 # 1.0 = no change, < 1.0 = less random, > 1.0 = more random, in predictions
top_k = 40 # retain only the top_k most likely tokens, clamp others to zero
seed = 1337
device = 'cpu'
dtype = 'float32'

print(f"Sampling from nanoGPT checkpoint with start: {start!r}")
