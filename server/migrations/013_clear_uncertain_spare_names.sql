-- Clear values that are not trustworthy spare names.
-- Preserve material codes, descriptions, quantities, procurement data and hierarchy links.
-- The user preference is to keep uncertain names blank rather than infer a replacement.

UPDATE materials
SET spare_name=NULL,updated_at=NOW()
WHERE active=true
  AND COALESCE(trim(spare_name),'')<>''
  AND (
    lower(trim(spare_name)) IN (
      'material code','new code','na','n/a','not made','not available',
      'to be created','tbc','make code','make code for order','make code and order'
    )
    OR trim(spare_name) ~* '^[A-Z]{3}[0-9]{12}([[:space:]-]|$)'
    OR trim(spare_name) ~* '^P[0-9]+_CH_[A-Z0-9_]+$'
    OR trim(spare_name) ~* '^[A-Z][A-Z0-9 -]*/?[A-Z0-9 -]*,?[[:space:]]*key number'
  );
