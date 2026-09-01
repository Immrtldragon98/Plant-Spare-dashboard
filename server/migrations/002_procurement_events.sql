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
