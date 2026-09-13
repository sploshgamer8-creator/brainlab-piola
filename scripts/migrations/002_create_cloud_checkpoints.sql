-- Migration 002: Cloud checkpoints and projects storage
CREATE TABLE IF NOT EXISTS brain_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  current_checkpoint_id TEXT,
  active_branch TEXT DEFAULT 'main',
  branches_json JSONB DEFAULT '["main"]'::jsonb,
  traits_json JSONB,
  multilingual_ratio_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_checkpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  branch TEXT DEFAULT 'main',
  step INTEGER DEFAULT 0,
  loss REAL DEFAULT 0.0,
  total_tokens_trained BIGINT DEFAULT 0,
  config_json JSONB NOT NULL,
  param_count INTEGER DEFAULT 0,
  history_json JSONB,
  traits_json JSONB,
  notes TEXT,
  weights_serialized TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_checkpoints_project ON brain_checkpoints(project_id);
