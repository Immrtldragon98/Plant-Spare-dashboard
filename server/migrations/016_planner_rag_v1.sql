CREATE TABLE IF NOT EXISTS knowledge_fact_proposals(
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_id BIGINT REFERENCES knowledge_chunks(id) ON DELETE SET NULL,
  fact_type TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_excerpt TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id,chunk_id,fact_type,fact_key)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_fact_proposals_status ON knowledge_fact_proposals(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_fact_proposals_document ON knowledge_fact_proposals(document_id);
