-- Establish the approved CH2 equipment catalog and WRM sub-equipment list.
-- Material rows are preserved. Legacy location usages are moved to canonical locations,
-- and duplicate Coiler/Flap Assembly usage links are safely collapsed.

WITH dept AS (
  SELECT id FROM departments WHERE department_code='3102_CH2'
), wanted(area_name,area_code) AS (
  VALUES
    ('WRM','3102_CH2_WRM'),
    ('ICM','3102_CH2_ICM'),
    ('Utility','3102_CH2_UTILITY'),
    ('FC','3102_CH2_FC'),
    ('PFA','3102_CH2_PFA')
)
INSERT INTO areas(department_id,area_code,area_name,active)
SELECT dept.id,w.area_code,w.area_name,true FROM dept CROSS JOIN wanted w
ON CONFLICT(department_id,area_name) DO UPDATE
SET area_code=EXCLUDED.area_code,active=true,updated_at=NOW();

UPDATE areas a SET active=false,updated_at=NOW()
FROM departments d
WHERE a.department_id=d.id AND d.department_code='3102_CH2'
  AND lower(a.area_name) IN ('furnace','ch2_wrm','ch2_icm','ch2_utility','ch2_fc','ch2_pfa');

UPDATE locations SET
  area_name='FC',area_code='3102_CH2',equipment_name='FC',equipment_code='3102_CH2_FC',
  sub_equipment_name=NULL,sub_equipment_code=NULL,updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true AND equipment_code='3102_CH2_FC';

UPDATE locations SET
  area_name='ICM',area_code='3102_CH2',equipment_name='ICM',equipment_code='3102_CH2_ICM',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true
  AND (equipment_code='3102_CH2_ICM' OR upper(area_name) IN ('ICM','CH2_ICM'));

UPDATE locations SET
  area_name='PFA',area_code='3102_CH2',equipment_name='PFA',equipment_code='3102_CH2_PFA',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true
  AND (equipment_code='3102_CH2_PFA' OR upper(area_name) IN ('PFA','CH2_PFA'));

UPDATE locations SET
  area_name='WRM',area_code='3102_CH2',equipment_name='WRM',equipment_code='3102_CH2_WRM',
  sub_equipment_name='Cropping Shear',sub_equipment_code='3102_CH2_WRM_CROPPING_SHEAR',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true
  AND lower(regexp_replace(COALESCE(sub_equipment_name,equipment_name,''),'[^a-zA-Z0-9]+','','g'))='autoshear';

UPDATE locations SET
  sub_equipment_name='TiBAl Rod',sub_equipment_code='3102_CH2_WRM_TIBAL_ROD',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true AND equipment_code='3102_CH2_WRM'
  AND lower(regexp_replace(COALESCE(sub_equipment_name,''),'[^a-zA-Z0-9]+','','g')) IN ('tibal','tibalrod');

UPDATE locations SET
  sub_equipment_name='Bar Straightener',sub_equipment_code='3102_CH2_WRM_BAR_STRAIGHTENER',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true AND equipment_code='3102_CH2_WRM'
  AND lower(regexp_replace(COALESCE(sub_equipment_name,''),'[^a-zA-Z0-9]+','','g')) IN ('barstraightner','barstraightener');

UPDATE locations SET
  sub_equipment_name='Main Shear',sub_equipment_code='3102_CH2_WRM_MAIN_SHEAR',updated_at=NOW()
WHERE department_code='3102_CH2' AND active=true AND equipment_code='3102_CH2_WRM'
  AND lower(regexp_replace(COALESCE(sub_equipment_name,''),'[^a-zA-Z0-9]+','','g'))='mainshear';

UPDATE material_usages target SET
  required_qty=COALESCE(target.required_qty,source.required_qty),
  discipline=COALESCE(target.discipline,source.discipline),
  notes=COALESCE(target.notes,source.notes),
  active=(target.active OR source.active),updated_at=NOW()
FROM material_usages source
WHERE source.location_id=39 AND target.location_id=2 AND target.material_id=source.material_id;

UPDATE material_usages source SET active=false,updated_at=NOW()
WHERE source.location_id=39 AND EXISTS (
  SELECT 1 FROM material_usages target
  WHERE target.location_id=2 AND target.material_id=source.material_id
);

UPDATE material_usages source SET location_id=2,updated_at=NOW()
WHERE source.location_id=39 AND NOT EXISTS (
  SELECT 1 FROM material_usages target
  WHERE target.location_id=2 AND target.material_id=source.material_id
);

UPDATE locations SET active=false,updated_at=NOW()
WHERE id=39 AND department_code='3102_CH2';

WITH dept AS (
  SELECT plant_code,department_code,department_name FROM departments WHERE department_code='3102_CH2'
), equipment(name,code) AS (
  VALUES
    ('WRM','3102_CH2_WRM'),
    ('ICM','3102_CH2_ICM'),
    ('Utility','3102_CH2_UTILITY'),
    ('FC','3102_CH2_FC'),
    ('PFA','3102_CH2_PFA')
)
INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name)
SELECT d.plant_code,d.department_code,d.department_name,d.department_code,e.name,e.code,e.name
FROM dept d CROSS JOIN equipment e
WHERE NOT EXISTS (
  SELECT 1 FROM locations l
  WHERE l.active=true AND l.department_code=d.department_code AND l.equipment_code=e.code
);

WITH dept AS (
  SELECT plant_code,department_code,department_name FROM departments WHERE department_code='3102_CH2'
), subs(name,code) AS (
  VALUES
    ('TiBAl Rod','3102_CH2_WRM_TIBAL_ROD'),
    ('Casting','3102_CH2_WRM_CASTING'),
    ('Casting Water Circuit','3102_CH2_WRM_CASTING_WATER_CIRCUIT'),
    ('Bar Straightener','3102_CH2_WRM_BAR_STRAIGHTENER'),
    ('Bar Cooler','3102_CH2_WRM_BAR_COOLER'),
    ('Roughing Mill','3102_CH2_WRM_RM'),
    ('Finishing Mill','3102_CH2_WRM_FM'),
    ('RAC','3102_CH2_WRM_RAC'),
    ('DMAT','3102_CH2_WRM_DMAT'),
    ('Main Shear','3102_CH2_WRM_MAIN_SHEAR'),
    ('Cropping Shear','3102_CH2_WRM_CROPPING_SHEAR'),
    ('Coiler','3102_CH2_WRM_COILER'),
    ('Emulsion Circuit','3102_CH2_WRM_EMULSION_CIRCUIT'),
    ('Quenching Circuit','3102_CH2_WRM_QUENCHING_CIRCUIT')
)
INSERT INTO locations(
  plant_code,department_code,department_name,area_code,area_name,
  equipment_code,equipment_name,sub_equipment_code,sub_equipment_name
)
SELECT d.plant_code,d.department_code,d.department_name,d.department_code,
  'WRM','3102_CH2_WRM','WRM',s.code,s.name
FROM dept d CROSS JOIN subs s
WHERE NOT EXISTS (
  SELECT 1 FROM locations l
  WHERE l.active=true AND l.department_code=d.department_code
    AND l.equipment_code='3102_CH2_WRM'
    AND lower(regexp_replace(COALESCE(l.sub_equipment_name,''),'[^a-zA-Z0-9]+','','g'))=
        lower(regexp_replace(s.name,'[^a-zA-Z0-9]+','','g'))
);

WITH d AS (
  SELECT plant_code,department_code,department_name FROM departments WHERE department_code='3102_CH2'
)
INSERT INTO locations(plant_code,department_code,department_name,area_code,area_name,equipment_code,equipment_name)
SELECT d.plant_code,d.department_code,d.department_name,d.department_code,'WRM','3102_CH2_WRM','WRM'
FROM d
WHERE NOT EXISTS (
  SELECT 1 FROM locations
  WHERE active=true AND department_code='3102_CH2'
    AND equipment_code='3102_CH2_WRM' AND COALESCE(trim(sub_equipment_name),'')=''
);

UPDATE material_usages target SET
  required_qty=COALESCE(target.required_qty,source.required_qty),
  discipline=COALESCE(target.discipline,source.discipline),
  notes=COALESCE(target.notes,source.notes),
  active=(target.active OR source.active),updated_at=NOW()
FROM material_usages source
WHERE source.location_id IN (14,36,38)
  AND target.location_id=(
    SELECT id FROM locations
    WHERE active=true AND department_code='3102_CH2'
      AND equipment_code='3102_CH2_WRM' AND COALESCE(trim(sub_equipment_name),'')=''
    ORDER BY id LIMIT 1
  )
  AND target.material_id=source.material_id;

UPDATE material_usages source SET active=false,updated_at=NOW()
WHERE source.location_id IN (14,36,38)
  AND EXISTS (
    SELECT 1 FROM material_usages target
    WHERE target.location_id=(
      SELECT id FROM locations
      WHERE active=true AND department_code='3102_CH2'
        AND equipment_code='3102_CH2_WRM' AND COALESCE(trim(sub_equipment_name),'')=''
      ORDER BY id LIMIT 1
    )
    AND target.material_id=source.material_id
  );

UPDATE material_usages source SET
  location_id=(
    SELECT id FROM locations
    WHERE active=true AND department_code='3102_CH2'
      AND equipment_code='3102_CH2_WRM' AND COALESCE(trim(sub_equipment_name),'')=''
    ORDER BY id LIMIT 1
  ),
  updated_at=NOW()
WHERE source.location_id IN (14,36,38)
  AND NOT EXISTS (
    SELECT 1 FROM material_usages target
    WHERE target.location_id=(
      SELECT id FROM locations
      WHERE active=true AND department_code='3102_CH2'
        AND equipment_code='3102_CH2_WRM' AND COALESCE(trim(sub_equipment_name),'')=''
      ORDER BY id LIMIT 1
    )
    AND target.material_id=source.material_id
  );

UPDATE locations SET active=false,updated_at=NOW()
WHERE id IN (14,36,38) AND department_code='3102_CH2';

UPDATE locations SET
  sub_equipment_code=CASE sub_equipment_name
    WHEN 'Bar Cooler' THEN '3102_CH2_WRM_BAR_COOLER'
    WHEN 'Casting' THEN '3102_CH2_WRM_CASTING'
    WHEN 'Coiler' THEN '3102_CH2_WRM_COILER'
    WHEN 'Roughing Mill' THEN '3102_CH2_WRM_RM'
    WHEN 'Finishing Mill' THEN '3102_CH2_WRM_FM'
    ELSE sub_equipment_code
  END,
  updated_at=NOW()
WHERE active=true AND department_code='3102_CH2' AND equipment_code='3102_CH2_WRM';
