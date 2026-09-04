CREATE UNIQUE INDEX IF NOT EXISTS uq_material_events_source_row
ON material_events(source_type,source_ref,event_type)
WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_material_events_consumption
ON material_events(material_code,event_at)
WHERE event_type='GOODS_ISSUE';
