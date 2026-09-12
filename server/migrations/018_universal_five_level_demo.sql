-- Universal five-level demonstration hierarchy.
-- Keeps application logic and schema intact while replacing plant-specific data.
DELETE FROM material_usages;
DELETE FROM materials;
DELETE FROM locations;
DELETE FROM areas;
DELETE FROM departments;

WITH department AS (
  INSERT INTO departments(plant_code,department_code,department_name,active)
  VALUES ('A','V','V',true)
  RETURNING id
)
INSERT INTO areas(department_id,area_code,area_name,active)
SELECT id,'V1','V1',true FROM department;

INSERT INTO locations(
  plant_code,department_code,department_name,
  area_code,area_name,equipment_code,equipment_name,
  sub_equipment_code,sub_equipment_name,active
) VALUES ('A','V','V','V1','V1','E','E','e','e',true);

WITH admin_user AS (
  SELECT id FROM users WHERE username='Logan' LIMIT 1
), created AS (
  INSERT INTO materials(material_code,spare_name,created_by,updated_by)
  SELECT NULL,m.spare_name,u.id,u.id
  FROM (VALUES ('Washer'),('Nut'),('Bearing'),('Chain')) AS m(spare_name)
  CROSS JOIN admin_user u
  RETURNING id
), target AS (
  SELECT id FROM locations
  WHERE plant_code='A' AND department_code='V' AND area_code='V1'
    AND equipment_code='E' AND sub_equipment_code='e'
  LIMIT 1
)
INSERT INTO material_usages(material_id,location_id,created_by,updated_by)
SELECT m.id,l.id,u.id,u.id
FROM created m CROSS JOIN target l CROSS JOIN admin_user u;
