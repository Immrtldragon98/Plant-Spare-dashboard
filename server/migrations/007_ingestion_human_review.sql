CREATE TABLE IF NOT EXISTS ingestion_human_reviews(
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL UNIQUE REFERENCES raw_upload_batches(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
  note TEXT,
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_human_reviews_time ON ingestion_human_reviews(reviewed_at DESC);
