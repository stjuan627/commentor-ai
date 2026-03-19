# Architectural Decisions

## [2026-03-12T03:54:11.241Z] Session Start: ses_31fd1c8c4ffe0Ef3jA2zJGWpcu

### Domain Model

- `siteKey`: normalized host/origin
- `pageKey`: normalized canonical URL without fragment and tracking params
- Remote sheet is source of truth; local is read-through cache + write queue
- Status values: `pending`, `done`, `invalid`

### Ownership Boundaries

- Background owns: auth, tokens, remote I/O, sync queue flush
- Sidepanel owns: UI state, local snapshot reads, user actions
- Content script: unchanged, continues to extract page content on demand

### Integration Strategy

- Add library as a NEW tab, not a replacement
- Existing comment flow remains unchanged for users without datasource
- Active library context is displayed but does NOT auto-change status
