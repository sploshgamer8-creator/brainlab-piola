CREATE TABLE IF NOT EXISTS teacher_pool_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  count INT NOT NULL,
  model TEXT NOT NULL DEFAULT 'qwen7b',
  status TEXT NOT NULL DEFAULT 'queued',
  samples_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
