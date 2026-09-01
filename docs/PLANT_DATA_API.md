# Plant Data API v1

Stable machine-to-machine and dashboard integration contract for Plant Spare Dashboard.

Base path: `/api/v1/plant`

## Authentication

Use either:

- Dashboard JWT: `Authorization: Bearer <token>`
- Service credential: `X-Plant-API-Key: <secret>` when `PLANT_API_KEY` is configured on the server.

Never commit the real service key to GitHub.

## Design rules

- Material Code is authoritative and must be exactly 3 uppercase letters + 12 digits.
- API snapshot writes update existing materials only. They do not create Material Master records.
- LLM/AI is not involved in API truth writes.
- Quantities are validated deterministically.
- Snapshot writes are recorded in `import_history` and automatically feed Material/Procurement event stores when those migrations are enabled.
- Maximum snapshot batch size is 1,000 rows/request.

## Endpoints

### GET `/status`

Returns API version, capabilities and current entity counts.

### GET `/materials`

Paginated material usages. Supports existing catalogue filters such as:

`department_code`, `area`, `equipment`, `sub_equipment`, `discipline`, `vendor`, `search`, `page`, `page_size`.

### GET `/equipment`

Returns aggregated equipment/sub-equipment usage counts and disciplines.

### GET `/hierarchy`

Returns canonical location/hierarchy rows. Optional filters:

`department_code`, `area`, `equipment`, `sub_equipment`.

### GET `/procurement`

Paginated procurement/current coverage view. Supports:

`department_code`, `area`, `type`, `search`, `page`, `page_size`.

`type` may be `pr`, `po`, `critical`, or `eligible`.

### POST `/snapshots`

Push a canonical plant snapshot from SAP export automation, another plant system, ETL script, or integration service.

Supported types:

- `stock`
- `open_pr`
- `open_po`

Example stock payload:

```json
{
  "type": "stock",
  "source": "sap-stock-export-2026-09-01",
  "rows": [
    {"material_code": "MMT311715050461", "store_qty": 4}
  ]
}
```

Example Open PR payload:

```json
{
  "type": "open_pr",
  "source": "sap-open-pr",
  "rows": [
    {
      "material_code": "MMT311715050461",
      "pr_qty": 6,
      "document_number": "PR12345",
      "document_item": "10",
      "event_date": "2026-09-01"
    }
  ]
}
```

Example Open PO payload:

```json
{
  "type": "open_po",
  "source": "sap-open-po",
  "rows": [
    {
      "material_code": "MMT311715050461",
      "po_qty": 3,
      "vendor": "Example Supplier",
      "document_number": "4500012345",
      "document_item": "10",
      "expected_date": "2026-09-30"
    }
  ]
}
```

Rows with missing/invalid Material Codes or invalid quantities are rejected as issues. Valid rows can still proceed. Existing Material Codes that are not found are returned in `missing_material_codes` and are not created automatically.

## Future adapters

The same API contract can sit behind:

- scheduled SAP Excel-to-JSON scripts
- SAP Integration Suite / MCP
- Power Automate
- Python/Node ETL jobs
- another maintenance dashboard
- mobile applications
- plant-wide data gateway

External connectors should integrate with this API instead of writing directly to Neon.
