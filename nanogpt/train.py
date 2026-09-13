"""
Reference training script from Andrej Karpathy's nanoGPT.
Preserved for reference, export compatibility, and offline local study in Local Brain Lab.
"""

import os
import time
import math
import pickle
from contextlib import nullcontext

import numpy as np
import torch
from model import GPTConfig, GPT

# default config values designed for small character/token level training
out_dir = 'out'
eval_interval = 250
log_interval = 10
eval_iters = 200
eval_only = False
always_save_checkpoint = True
init_from = 'scratch'

# data
dataset = 'local_brain'
gradient_accumulation_steps = 1
batch_size = 16
block_size = 64

# model
n_layer = 4
n_head = 4
n_embd = 64
dropout = 0.0
bias = False

# adamw optimizer
learning_rate = 1e-3
max_iters = 1000
weight_decay = 1e-1
beta1 = 0.9
beta2 = 0.95
grad_clip = 1.0

# learning rate decay settings
decay_lr = True
warmup_iters = 100
lr_decay_iters = 1000
min_lr = 1e-4

device = 'cpu' # Local Brain runs offline on CPU or client WebGL/WebGPU
compile = False # can use torch.compile if on linux

config_keys = [k for k,v in globals().items() if not k.startswith('_') and isinstance(v, (int, float, bool, str))]
exec(open('configurator.py').read()) if os.path.exists('configurator.py') else None
config = {k: globals()[k] for k in config_keys}

print(f"Local Brain Lab nanoGPT trainer configured: n_layer={n_layer}, n_head={n_head}, n_embd={n_embd}")
