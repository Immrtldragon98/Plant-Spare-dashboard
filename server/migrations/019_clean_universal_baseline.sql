-- Final clean production baseline.
-- Removes all tenant/plant operational data while preserving users and application logic.
TRUNCATE TABLE
  component_knowledge_links,
  component_material_links,
  equipment_components,
  knowledge_fact_proposals,
  knowledge_chunks,
  knowledge_documents,
  ingestion_human_reviews,
  ingestion_reviews,
  ingestion_canonical_rows,
  ingestion_jobs,
  raw_upload_rows,
  raw_upload_batches,
  import_mapping_memory,
  import_history,
  procurement_events,
  material_events,
  audit_log,
  material_usages,
  materials,
  locations,
  areas,
  departments
RESTART IDENTITY CASCADE;
