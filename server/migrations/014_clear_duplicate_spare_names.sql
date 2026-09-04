-- Spare Name and Description are separate fields.
-- When both contain the same text, Description is the only supported source,
-- so keep it and clear the unverified Spare Name.

UPDATE materials
SET spare_name=NULL,updated_at=NOW()
WHERE active=true
  AND COALESCE(trim(spare_name),'')<>''
  AND lower(trim(spare_name))=lower(trim(COALESCE(description,'')));
