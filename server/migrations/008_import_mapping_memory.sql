CREATE TABLE IF NOT EXISTS import_mapping_memory (
  id BIGSERIAL PRIMARY KEY,
  template_signature TEXT NOT NULL,
  file_type TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT '',
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'approved-import',
  source_batch_id BIGINT NULL REFERENCES raw_upload_batches(id) ON DELETE SET NULL,
  approved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_signature,file_type,sheet_name)
);
CREATE INDEX IF NOT EXISTS idx_import_mapping_memory_file_type ON import_mapping_memory(file_type,updated_at DESC);
