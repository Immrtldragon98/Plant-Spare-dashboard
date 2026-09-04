-- Keep the CH2 equipment catalogue limited to the four approved equipment groups.
-- No material or usage rows are deleted. Import-era area labels and the unused
-- Utility placeholder are retired; WRM sub-equipment locations remain active.

UPDATE areas a
SET active = (a.area_name IN ('FC','PFA','WRM','ICM')),
    updated_at = NOW()
FROM departments d
WHERE a.department_id=d.id
  AND d.department_code='3102_CH2';

UPDATE locations
SET active=false,updated_at=NOW()
WHERE department_code='3102_CH2'
  AND active=true
  AND equipment_code='3102_CH2_UTILITY'
  AND NOT EXISTS (
    SELECT 1 FROM material_usages mu
    WHERE mu.location_id=locations.id AND mu.active=true
  );
