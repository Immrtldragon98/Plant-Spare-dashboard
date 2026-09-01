CREATE TABLE IF NOT EXISTS knowledge_documents(
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Manual',
  manufacturer TEXT,
  department_code TEXT,
  equipment TEXT,
  sub_equipment TEXT,
  discipline TEXT,
  material_code TEXT,
  notes TEXT,
  mime_type TEXT,
  file_size BIGINT,
  content_hash TEXT,
  storage_provider TEXT NOT NULL DEFAULT 'text-only',
  storage_bucket TEXT,
  storage_key TEXT,
  storage_url TEXT,
  original_archived BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by BIGINT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_scope ON knowledge_documents(department_code,equipment,sub_equipment,discipline);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_material ON knowledge_documents(material_code) WHERE material_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_hash_unique ON knowledge_documents(content_hash) WHERE content_hash IS NOT NULL AND active=TRUE;

CREATE TABLE IF NOT EXISTS knowledge_chunks(
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_hint INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id,chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id,chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON knowledge_chunks USING GIN(to_tsvector('simple',content));
