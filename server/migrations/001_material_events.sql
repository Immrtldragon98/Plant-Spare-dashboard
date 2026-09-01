BEGIN;

ALTER TABLE import_history DROP CONSTRAINT IF EXISTS import_history_import_type_check;

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

COMMIT;
