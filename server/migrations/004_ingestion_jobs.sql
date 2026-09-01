CREATE TABLE IF NOT EXISTS ingestion_jobs(
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
  source_name TEXT,
  request_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_created ON ingestion_jobs(status,created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_type_created ON ingestion_jobs(job_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_request ON ingestion_jobs(request_id) WHERE request_id IS NOT NULL;
