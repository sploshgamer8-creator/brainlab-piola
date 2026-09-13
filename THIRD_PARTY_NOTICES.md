# Third-Party Software Notices and Licenses

This project incorporates and adapts concepts and patterns from open-source projects under permissible licenses. We gratefully acknowledge the authors and contributors of the following software:

---

## 1. nanoGPT
- **Copyright**: (c) 2022-2024 Andrej Karpathy
- **License**: MIT License
- **Notice**: The mathematical architecture of causal self-attention, projection layers, layer normalization, GeLU activation, and AdamW gradient descent implemented in `src/core/nanogpt_engine.ts` is based upon Andrej Karpathy's open-source nanoGPT repository.

```
MIT License

Copyright (c) 2022-2024 Andrej Karpathy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 2. llama.cpp
- **Copyright**: (c) 2023-2025 Georgi Gerganov and contributors
- **License**: MIT License
- **Notice**: The runtime connector interface in `src/runtime/LlamaCppBackend.ts` and teacher harvest provider in `src/harvesting/teacher_provider.ts` connect via HTTP API to external llama.cpp server instances.

```
MIT License

Copyright (c) 2023-2025 Georgi Gerganov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 3. WebLLM / MLC-LLM
- **Copyright**: (c) 2023-2025 MLC-AI Team
- **License**: Apache License, Version 2.0
- **Notice**: The WebGPU abstraction adapter in `src/runtime/WebLLMBackend.ts` defines execution interfaces aligned with the WebLLM runtime specification.

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## 4. SafeTensors
- **Copyright**: (c) 2022-2025 Hugging Face Inc.
- **License**: Apache License, Version 2.0
- **Notice**: The binary format serializer implemented in `src/storage/safetensors_exporter.ts` conforms to the Hugging Face SafeTensors specification (8-byte little-endian header length + UTF-8 JSON header + raw tensor buffers).

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

## 5. Lucide React
- **Copyright**: (c) 2022-2025 Lucide Contributors
- **License**: ISC License

---

## 6. Tailwind CSS
- **Copyright**: (c) Tailwind Labs, Inc.
- **License**: MIT License
