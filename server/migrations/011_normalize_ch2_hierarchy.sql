-- Normalize the CH2 WRM hierarchy without discarding spare history.
-- Imported rows used both WRM and CH2_WRM for the same equipment, creating duplicate locations.

DO $$
DECLARE
  duplicate_row RECORD;
  canonical_id BIGINT;
BEGIN
  FOR duplicate_row IN
    SELECT equipment_code, lower(trim(COALESCE(sub_equipment_name,''))) sub_name
    FROM locations
    WHERE active=true
      AND department_code='3102_CH2'
      AND upper(regexp_replace(area_name,'^CH2_','','i'))='WRM'
      AND equipment_code='3102_CH2_WRM'
    GROUP BY equipment_code, lower(trim(COALESCE(sub_equipment_name,'')))
    HAVING COUNT(*)>1
  LOOP
    SELECT id INTO canonical_id
    FROM locations
    WHERE active=true
      AND department_code='3102_CH2'
      AND upper(regexp_replace(area_name,'^CH2_','','i'))='WRM'
      AND equipment_code=duplicate_row.equipment_code
      AND lower(trim(COALESCE(sub_equipment_name,'')))=duplicate_row.sub_name
    ORDER BY CASE WHEN upper(area_name)='WRM' THEN 0 ELSE 1 END,id
    LIMIT 1;

    UPDATE material_usages target
    SET required_qty=COALESCE(target.required_qty,source.required_qty),
        discipline=COALESCE(target.discipline,source.discipline),
        notes=COALESCE(target.notes,source.notes),
        active=(target.active OR source.active),
        updated_at=NOW()
    FROM material_usages source
    JOIN locations source_location ON source_location.id=source.location_id
    WHERE target.location_id=canonical_id
      AND source_location.active=true
      AND source_location.id<>canonical_id
      AND source_location.department_code='3102_CH2'
      AND upper(regexp_replace(source_location.area_name,'^CH2_','','i'))='WRM'
      AND source_location.equipment_code=duplicate_row.equipment_code
      AND lower(trim(COALESCE(source_location.sub_equipment_name,'')))=duplicate_row.sub_name
      AND target.material_id=source.material_id;

    UPDATE material_usages source
    SET active=false,updated_at=NOW()
    FROM locations source_location
    WHERE source.location_id=source_location.id
      AND source_location.active=true
      AND source_location.id<>canonical_id
      AND source_location.department_code='3102_CH2'
      AND upper(regexp_replace(source_location.area_name,'^CH2_','','i'))='WRM'
      AND source_location.equipment_code=duplicate_row.equipment_code
      AND lower(trim(COALESCE(source_location.sub_equipment_name,'')))=duplicate_row.sub_name
      AND EXISTS (
        SELECT 1 FROM material_usages target
        WHERE target.location_id=canonical_id AND target.material_id=source.material_id
      );

    UPDATE material_usages source
    SET location_id=canonical_id,updated_at=NOW()
    FROM locations source_location
    WHERE source.location_id=source_location.id
      AND source_location.active=true
      AND source_location.id<>canonical_id
      AND source_location.department_code='3102_CH2'
      AND upper(regexp_replace(source_location.area_name,'^CH2_','','i'))='WRM'
      AND source_location.equipment_code=duplicate_row.equipment_code
      AND lower(trim(COALESCE(source_location.sub_equipment_name,'')))=duplicate_row.sub_name
      AND NOT EXISTS (
        SELECT 1 FROM material_usages target
        WHERE target.location_id=canonical_id AND target.material_id=source.material_id
      );

    UPDATE locations
    SET active=false,updated_at=NOW()
    WHERE active=true
      AND id<>canonical_id
      AND department_code='3102_CH2'
      AND upper(regexp_replace(area_name,'^CH2_','','i'))='WRM'
      AND equipment_code=duplicate_row.equipment_code
      AND lower(trim(COALESCE(sub_equipment_name,'')))=duplicate_row.sub_name;
  END LOOP;

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
END $$;
