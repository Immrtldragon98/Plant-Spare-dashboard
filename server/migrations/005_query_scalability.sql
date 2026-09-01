-- Query scalability indexes for material catalogue, filters and current-state reads.
-- Apply through the versioned migration runner after testing on a safe database branch.

CREATE INDEX IF NOT EXISTS idx_material_usages_active_location_material ON material_usages(active,location_id,material_id);
CREATE INDEX IF NOT EXISTS idx_material_usages_active_discipline ON material_usages(active,discipline) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_materials_active_code ON materials(active,material_code);
CREATE INDEX IF NOT EXISTS idx_materials_active_vendor ON materials(active,vendor) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_department_area_equipment ON locations(department_code,area_name,equipment_name,sub_equipment_name) WHERE active=TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_equipment ON locations(equipment_name,sub_equipment_name) WHERE active=TRUE;
