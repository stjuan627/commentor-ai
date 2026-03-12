# Known Issues and Gotchas

## [2026-03-12T03:54:11.241Z] Session Start: ses_31fd1c8c4ffe0Ef3jA2zJGWpcu

### Risks

- MV3 service worker can restart; all state must be in storage, not memory
- Google Sheets API has per-minute quotas; need exponential backoff
- Sheet row numbers are NOT stable IDs; must use content-based keys
- Version conflicts can occur even in personal use (multi-device, manual edits)

### Firefox Compatibility

- Google identity API is Chrome-only
- Firefox build must compile but datasource features can be disabled/hidden
- Existing comment generation must work on Firefox unchanged
