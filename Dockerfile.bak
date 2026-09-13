FROM node:18-bullseye-slim

# Install wget and tar for downloading llama.cpp
RUN apt-get update && apt-get install -y wget tar && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files
COPY . .

# Build the frontend and Express backend
RUN npm run build:railway

# Download Linux version of llama-server (b4382)
RUN mkdir -p bin && \
    wget https://github.com/ggerganov/llama.cpp/releases/download/b4382/llama-b4382-bin-ubuntu-x64.zip -O bin/llama.zip && \
    apt-get update && apt-get install -y unzip && \
    unzip bin/llama.zip -d bin && \
    rm bin/llama.zip && \
    chmod +x bin/llama-server

# Download the tiny model (Qwen 0.5B)
RUN mkdir -p models && \
    wget https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf -O models/qwen2.5-0.5b.gguf

# Expose dynamic port (provided by Railway)
EXPOSE $PORT
# Expose llama.cpp port internally just in case
EXPOSE 8080

# Make start script executable
RUN chmod +x scripts/start_railway.sh

# Start everything
CMD ["./scripts/start_railway.sh"]
