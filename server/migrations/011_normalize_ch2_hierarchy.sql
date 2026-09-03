-- Normalize the CH2 WRM hierarchy without discarding spare history.
-- Production inspection identified two exact duplicate location pairs: Casting 19 -> 7 and Coiler 40 -> 2.

UPDATE material_usages target
SET required_qty=COALESCE(target.required_qty,source.required_qty),
    discipline=COALESCE(target.discipline,source.discipline),
    notes=COALESCE(target.notes,source.notes),
    active=(target.active OR source.active),
    updated_at=NOW()
FROM material_usages source
JOIN (VALUES (19::bigint,7::bigint),(40::bigint,2::bigint)) pair(source_id,target_id)
  ON source.location_id=pair.source_id
WHERE target.location_id=pair.target_id
  AND target.material_id=source.material_id;

UPDATE material_usages source
SET active=false,updated_at=NOW()
FROM (VALUES (19::bigint,7::bigint),(40::bigint,2::bigint)) pair(source_id,target_id)
WHERE source.location_id=pair.source_id
  AND EXISTS (
    SELECT 1 FROM material_usages target
    WHERE target.location_id=pair.target_id
      AND target.material_id=source.material_id
  );

UPDATE material_usages source
SET location_id=pair.target_id,updated_at=NOW()
FROM (VALUES (19::bigint,7::bigint),(40::bigint,2::bigint)) pair(source_id,target_id)
WHERE source.location_id=pair.source_id
  AND NOT EXISTS (
    SELECT 1 FROM material_usages target
    WHERE target.location_id=pair.target_id
      AND target.material_id=source.material_id
  );

UPDATE locations
SET active=false,updated_at=NOW()
WHERE id IN (19,40) AND department_code='3102_CH2';

UPDATE locations
SET area_name='WRM',
    equipment_name=CASE WHEN equipment_code='3102_CH2_WRM' THEN 'WRM' ELSE equipment_name END,
    updated_at=NOW()
WHERE active=true
  AND department_code='3102_CH2'
  AND upper(regexp_replace(area_name,'^CH2_','','i'))='WRM';

UPDATE areas a
SET active=false,updated_at=NOW()
FROM departments d
WHERE a.department_id=d.id
  AND d.department_code='3102_CH2'
  AND upper(a.area_name)='CH2_WRM'
  AND EXISTS (
    SELECT 1 FROM areas canonical
    WHERE canonical.department_id=a.department_id
      AND canonical.active=true
      AND upper(canonical.area_name)='WRM'
  );
