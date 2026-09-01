CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,username TEXT,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('viewer','planner','admin')),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users(lower(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS departments(id BIGSERIAL PRIMARY KEY,plant_code TEXT NOT NULL,department_code TEXT UNIQUE NOT NULL,department_name TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS areas(id BIGSERIAL PRIMARY KEY,department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,area_code TEXT,area_name TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(department_id,area_name));
CREATE TABLE IF NOT EXISTS locations(id BIGSERIAL PRIMARY KEY,plant_code TEXT NOT NULL,department_code TEXT NOT NULL,department_name TEXT NOT NULL,area_code TEXT,area_name TEXT NOT NULL,equipment_code TEXT,equipment_name TEXT,sub_equipment_code TEXT,sub_equipment_name TEXT,sap_location_code TEXT UNIQUE,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_locations_department_path ON locations(department_code,area_name,equipment_name,sub_equipment_name);

CREATE TABLE IF NOT EXISTS materials(id BIGSERIAL PRIMARY KEY,material_code TEXT,spare_name TEXT,description TEXT,part_number TEXT,uom TEXT,store_qty NUMERIC,pr_qty NUMERIC,po_qty NUMERIC,manufacturer TEXT,vendor TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,created_by BIGINT REFERENCES users(id),updated_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS materials_material_code_unique_not_null ON materials(material_code) WHERE material_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS material_usages(id BIGSERIAL PRIMARY KEY,material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,location_id BIGINT NOT NULL REFERENCES locations(id),required_qty NUMERIC,discipline TEXT,notes TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,created_by BIGINT REFERENCES users(id),updated_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(material_id,location_id));

-- Import type is intentionally open-ended. New ingestion adapters must not require a schema change.
CREATE TABLE IF NOT EXISTS import_history(id BIGSERIAL PRIMARY KEY,import_type TEXT NOT NULL,file_name TEXT,total_rows INT NOT NULL DEFAULT 0,added_rows INT NOT NULL DEFAULT 0,updated_rows INT NOT NULL DEFAULT 0,skipped_rows INT NOT NULL DEFAULT 0,issue_rows INT NOT NULL DEFAULT 0,details JSONB,imported_by BIGINT REFERENCES users(id),imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

-- Append-only operational history. Current quantities remain on materials for fast reads; events preserve change over time.
CREATE TABLE IF NOT EXISTS material_events(id BIGSERIAL PRIMARY KEY,material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,material_code TEXT NOT NULL,event_type TEXT NOT NULL,event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),quantity NUMERIC,old_value NUMERIC,new_value NUMERIC,uom TEXT,source_type TEXT,source_ref TEXT,import_history_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_material_events_material_time ON material_events(material_id,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_code_time ON material_events(material_code,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_type_time ON material_events(event_type,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_events_import ON material_events(import_history_id) WHERE import_history_id IS NOT NULL;

-- Procurement events preserve document-level PR/PO/RGP/NRGP history separately from current aggregate quantities.
CREATE TABLE IF NOT EXISTS procurement_events(id BIGSERIAL PRIMARY KEY,material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,material_code TEXT,event_type TEXT NOT NULL CHECK(event_type IN ('PR_SNAPSHOT','PO_SNAPSHOT','PR_OPENED','PO_CREATED','PO_DELIVERY','RGP_OUT','RGP_IN','NRGP_OUT','NRGP_IN')),document_number TEXT,document_item TEXT,quantity NUMERIC,open_quantity NUMERIC,vendor TEXT,event_date TIMESTAMPTZ,expected_date TIMESTAMPTZ,source_batch_id BIGINT REFERENCES import_history(id) ON DELETE SET NULL,source_file TEXT,metadata JSONB,created_by BIGINT REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_procurement_events_material_time ON procurement_events(material_code,COALESCE(event_date,created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_events_document ON procurement_events(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_events_type_time ON procurement_events(event_type,COALESCE(event_date,created_at) DESC);

-- RAG knowledge model. Original binaries belong in object storage; Postgres keeps metadata and searchable chunks.
CREATE TABLE IF NOT EXISTS knowledge_documents(id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,file_name TEXT NOT NULL,document_type TEXT NOT NULL DEFAULT 'Manual',manufacturer TEXT,department_code TEXT,equipment TEXT,sub_equipment TEXT,discipline TEXT,material_code TEXT,notes TEXT,mime_type TEXT,file_size BIGINT,content_hash TEXT,storage_provider TEXT NOT NULL DEFAULT 'text-only',storage_bucket TEXT,storage_key TEXT,storage_url TEXT,original_archived BOOLEAN NOT NULL DEFAULT FALSE,active BOOLEAN NOT NULL DEFAULT TRUE,uploaded_by BIGINT REFERENCES users(id),uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_scope ON knowledge_documents(department_code,equipment,sub_equipment,discipline);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_material ON knowledge_documents(material_code) WHERE material_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_hash_unique ON knowledge_documents(content_hash) WHERE content_hash IS NOT NULL AND active=TRUE;
CREATE TABLE IF NOT EXISTS knowledge_chunks(id BIGSERIAL PRIMARY KEY,document_id BIGINT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,chunk_index INT NOT NULL,content TEXT NOT NULL,token_hint INT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(document_id,chunk_index));
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id,chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts ON knowledge_chunks USING GIN(to_tsvector('simple',content));

CREATE TABLE IF NOT EXISTS audit_log(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id),action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id BIGINT,material_code TEXT,old_data JSONB,new_data JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
