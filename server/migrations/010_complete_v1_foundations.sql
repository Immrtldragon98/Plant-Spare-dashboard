-- Final idempotent V1 foundation migration.
-- Completes optional history/knowledge tables, query indexes and the document side of the equipment knowledge graph.

CREATE TABLE IF NOT EXISTS material_events(
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity NUMERIC,
  old_value NUMERIC,
  new_value NUMERIC,
  uom TEXT,
  source_type TEXT,
  source_ref TEXT,
  import_history_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_material_events_material_time ON material_events(material_id,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_code_time ON material_events(material_code,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_type_time ON material_events(event_type,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_import ON material_events(import_history_id) WHERE import_history_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS procurement_events(
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
  material_code TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('PR_SNAPSHOT','PO_SNAPSHOT','PR_OPENED','PO_CREATED','PO_DELIVERY','RGP_OUT','RGP_IN','NRGP_OUT','NRGP_IN')),
  document_number TEXT,
  document_item TEXT,
  quantity NUMERIC,
  open_quantity NUMERIC,
  vendor TEXT,
  event_date TIMESTAMPTZ,
  expected_date TIMESTAMPTZ,
  source_batch_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,
  source_file TEXT,
  metadata JSONB,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_procurement_events_material_time ON procurement_events(material_code,COALESCE(event_date,created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_events_document ON procurement_events(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_events_type_time ON procurement_events(event_type,COALESCE(event_date,created_at) DESC);

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

CREATE INDEX IF NOT EXISTS idx_material_usages_active_location_material ON material_usages(active,location_id,material_id);
CREATE INDEX IF NOT EXISTS idx_material_usages_active_discipline ON material_usages(active,discipline) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_materials_active_code ON materials(active,material_code);
CREATE INDEX IF NOT EXISTS idx_materials_active_vendor ON materials(active,vendor) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_department_area_equipment ON locations(department_code,area_name,equipment_name,sub_equipment_name) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_equipment ON locations(equipment_name,sub_equipment_name) WHERE active=TRUE;

CREATE TABLE IF NOT EXISTS component_knowledge_links(
  id BIGSERIAL PRIMARY KEY,
  component_id BIGINT NOT NULL REFERENCES equipment_components(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'reference',
  source TEXT NOT NULL DEFAULT 'planner',
  confidence NUMERIC(5,4),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(component_id,document_id,relation_type)
);
CREATE INDEX IF NOT EXISTS idx_component_knowledge_links_component ON component_knowledge_links(component_id);
CREATE INDEX IF NOT EXISTS idx_component_knowledge_links_document ON component_knowledge_links(document_id);
