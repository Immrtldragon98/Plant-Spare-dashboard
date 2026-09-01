CREATE TABLE IF NOT EXISTS raw_upload_batches(
  id BIGSERIAL PRIMARY KEY,
  import_history_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'excel',
  content_hash TEXT NOT NULL,
  workbook_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_provider TEXT NOT NULL DEFAULT 'db-only',
  storage_bucket TEXT,
  storage_key TEXT,
  original_archived BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewed','committed','rejected','failed')),
  uploaded_by BIGINT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_raw_upload_batches_time ON raw_upload_batches(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_upload_batches_hash ON raw_upload_batches(content_hash);

CREATE TABLE IF NOT EXISTS raw_upload_rows(
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES raw_upload_batches(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  row_number INT NOT NULL,
  cells JSONB NOT NULL,
  row_object JSONB,
  row_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id,sheet_name,row_number)
);
CREATE INDEX IF NOT EXISTS idx_raw_upload_rows_batch_sheet ON raw_upload_rows(batch_id,sheet_name,row_number);

CREATE TABLE IF NOT EXISTS ingestion_reviews(
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES raw_upload_batches(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK(review_type IN ('deterministic','llm')),
  decision TEXT NOT NULL CHECK(decision IN ('accept','warn','reject','unavailable')),
  confidence NUMERIC,
  model TEXT,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_reviews_batch ON ingestion_reviews(batch_id,created_at DESC);
