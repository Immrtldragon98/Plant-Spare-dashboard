CREATE TABLE IF NOT EXISTS ingestion_canonical_rows(
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES raw_upload_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  file_type TEXT NOT NULL,
  material_code TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id,row_index)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_canonical_rows_batch ON ingestion_canonical_rows(batch_id,row_index);
CREATE INDEX IF NOT EXISTS idx_ingestion_canonical_rows_material ON ingestion_canonical_rows(material_code) WHERE material_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingestion_human_reviews(
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL UNIQUE REFERENCES raw_upload_batches(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
  note TEXT,
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_human_reviews_time ON ingestion_human_reviews(reviewed_at DESC);
