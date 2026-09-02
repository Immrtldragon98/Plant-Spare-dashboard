CREATE TABLE IF NOT EXISTS equipment_components(
  id BIGSERIAL PRIMARY KEY,
  location_id BIGINT REFERENCES locations(id) ON DELETE CASCADE,
  parent_component_id BIGINT REFERENCES equipment_components(id) ON DELETE CASCADE,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL DEFAULT 'Assembly',
  description TEXT,
  drawing_number TEXT,
  oem TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'planner',
  confidence NUMERIC(5,4),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_components_location ON equipment_components(location_id,active);
CREATE INDEX IF NOT EXISTS idx_equipment_components_parent ON equipment_components(parent_component_id) WHERE parent_component_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_components_name ON equipment_components(lower(component_name));

CREATE TABLE IF NOT EXISTS component_material_links(
  id BIGSERIAL PRIMARY KEY,
  component_id BIGINT NOT NULL REFERENCES equipment_components(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  part_number TEXT,
  drawing_item TEXT,
  source TEXT NOT NULL DEFAULT 'planner',
  confidence NUMERIC(5,4),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(component_id,material_id)
);

CREATE INDEX IF NOT EXISTS idx_component_material_links_material ON component_material_links(material_id);
CREATE INDEX IF NOT EXISTS idx_component_material_links_component ON component_material_links(component_id);

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
