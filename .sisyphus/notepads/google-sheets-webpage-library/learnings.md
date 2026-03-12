# Learnings

## [2026-03-12T03:54:11.241Z] Session Start: ses_31fd1c8c4ffe0Ef3jA2zJGWpcu

### Codebase Patterns Observed

- **Type barrel export**: `src/types/index.ts` re-exports all shared types
- **Storage bootstrap pattern**: `entrypoints/sidepanel/App.tsx:42` shows legacy migration from `keywords` to `sites`
- **Persist helper pattern**: `entrypoints/sidepanel/App.tsx:105` shows optimistic local update + storage.local.set
- **Existing entity shape**: `SiteItem` in `src/types/site.ts:3` contains id, name, keywords array
- **Tab navigation**: `entrypoints/sidepanel/App.tsx:313` uses tabs-boxed with activeTab state
- **Service layer pattern**: LLM services are abstracted in `src/services/llm/`

### Critical Constraints

- Must NOT repurpose `SiteItem` for library pages
- Must NOT persist full article content in library storage
- Must keep library workflow separate from existing comment/sites/settings tabs
- Chrome-first for Google Sheets; Firefox must not regress

## [2026-03-12T03:54:11.241Z] Task 1: Library Domain Model

### Implementation Approach
- Created `src/types/library.ts` with all required types for Google Sheets library feature
- Used `for...of` loop instead of `forEach` to avoid LSP error about callback return values
- Removed all comments to keep code self-documenting per project standards
- Added library types to barrel export in `src/types/index.ts`
- Extended App.tsx bootstrap to load datasourceConfig and librarySnapshot from storage

### Key Design Decisions
- `pageKey`: normalized URL without fragment and tracking params (utm_*, fbclid, gclid, ref, source)
- `siteKey`: lowercase hostname from URL
- PageRecord explicitly excludes full article content (title only, no body/content fields)
- Library state is separate from existing SiteItem/KeywordItem model
- Storage bootstrap is non-destructive: existing sites/keywords logic untouched

### Verification Results
- `pnpm compile` passes with zero TypeScript errors
- LSP diagnostics clean on all modified files
- Existing storage migration logic preserved

## [2026-03-12] Task 2: Datasource Settings and Manifest Permissions

### Implementation Approach
- Updated `wxt.config.ts` to use dynamic manifest function with browser detection
- Chrome builds get `identity` permission and Google API host_permissions
- Firefox builds remain unchanged (no identity permission)
- Extended SettingsPanel with datasource configuration UI
- Added data-testid attributes for QA verification

### Key Design Decisions
- Datasource config stored separately from LLM settings in browser.storage.local
- Validation happens client-side before save (spreadsheetId and sheetName required)
- Error state displayed inline with data-testid="datasource-error"
- Connected status badge shown when datasource.connected is true

### Verification Results
- `pnpm compile` passes
- `pnpm build` succeeds for Chrome with identity permission
- `pnpm build:firefox` succeeds without identity permission
- Both builds produce valid manifests

## [2026-03-12] Task 3: Chrome Google Auth and Token Lifecycle

### Implementation Approach
- Created `src/services/auth.ts` with auth lifecycle functions
- Extended `src/types/global.d.ts` to include chrome.identity API types
- Added auth message handlers in background.ts: authConnect, authDisconnect, authGetState
- Updated SettingsPanel to use auth state and show connection status
- Firefox-safe: isAuthSupported() returns false when chrome.identity unavailable

### Key Design Decisions
- Background owns all token operations; sidepanel never sees raw tokens
- Auth state stored in browser.storage.local for persistence across worker restarts
- Interactive auth flow triggered on "保存并连接" button click
- Disconnect button clears cached tokens and updates datasource.connected flag
- Auth state badges show: connected (green), connecting (yellow), error (red), disconnected

### Verification Results
- `pnpm compile` passes
- Chrome and Firefox builds succeed
- Auth service compiles without LSP errors
- Background message handlers properly async with sendResponse

## [2026-03-12] Task 4: Google Sheets Connector Primitives

### Implementation Approach
- Created `src/services/sheets.ts` with connector functions
- validateSheetSchema() fetches first row and validates required columns
- fetchPageRecords() reads rows 2-1000 and normalizes into PageRecord[]
- batchUpdateStatus() finds records by pageKey and updates status/version/updated_at
- Uses column indices from schema, not hardcoded positions

### Key Design Decisions
- Required columns: site_key, page_key, source_url, canonical_url, title, status, version, updated_at
- Schema validation happens on every operation to catch column changes
- pageKey and siteKey normalized using library utility functions
- Batch updates use Google Sheets batchUpdate API with multiple ranges
- Column letters calculated from schema indices (A=65 + index)
- Fetches up to 1000 rows (rows 2-1000) to avoid quota issues

### Verification Results
- `pnpm compile` passes
- No LSP errors in sheets.ts
- Service layer properly separated from UI

## [2026-03-12] Task 5: Background Datasource Gateway and Message Protocol

### Implementation Approach
- Extended background.ts with library message handlers
- libraryBootstrap: returns cached snapshot or unconfigured status
- libraryRefresh: fetches from Sheets and updates local snapshot
- libraryOpenPage: creates new tab and stores active context
- libraryStatusUpdate: optimistic local update + queue + immediate sync attempt
- libraryGetActiveContext: retrieves current active library record

### Key Design Decisions
- All library operations go through background message protocol
- Sidepanel never calls Google APIs directly
- Sync queue persisted in browser.storage.local for durability
- Optimistic updates: local state changes immediately, sync happens async
- Failed syncs remain in queue with retry metadata
- Active context tracks which library page is currently open

### Verification Results
- `pnpm compile` passes
- Chrome and Firefox builds succeed
- Extended global.d.ts with browser.tabs.create type
- Message handlers follow existing async pattern with sendResponse

## [2026-03-12] Task 6: Local Snapshot Caching and Persistent Sync Queue

### Implementation Approach
- Created `src/services/sync.ts` with queue flushing logic
- schedulePeriodicSync() runs every 60 seconds to flush pending items
- Exponential backoff: 1s, 5s, 15s for retries
- Max 3 retry attempts before marking as error
- Version conflict detection in batchUpdateStatus()
- Conflicts throw error instead of silently overwriting

### Key Design Decisions
- Sync queue stored in browser.storage.local for persistence
- Queue items have states: pending, retrying, synced, error
- Optimistic updates: local state changes immediately in libraryStatusUpdate
- Background periodic sync flushes queue automatically
- Version check: current >= update = conflict
- Failed items remain in queue with retry count and last error

### Verification Results
- `pnpm compile` passes
- Chrome and Firefox builds succeed
- Periodic sync scheduled on background startup
- Version conflicts detected and reported

## [2026-03-12] Task 7: Sidepanel Library Tab and Page-List UI

### Implementation Approach
- Created LibraryPanel component with full library UI
- Added library tab to App.tsx tab navigation
- Bootstrap loads cached snapshot on mount
- Refresh button triggers libraryRefresh message
- Site filter badges for grouping by siteKey
- Status badges: done (green), invalid (red), pending (yellow)
- Sync state badges: synced, pending, retrying, error
- Per-row actions: open, mark done, mark invalid

### Key Design Decisions
- Unconfigured state shows info alert directing to settings
- Loading state shows spinner
- Empty state shows info message
- Site filter shows count per site
- All row actions have data-testid for QA
- onOpenPage and onStatusChange callbacks passed from App.tsx
- Library tab positioned between comment and sites tabs

### Verification Results
- `pnpm compile` passes
- Chrome build succeeds
- LibraryPanel exported from components index
- Tab navigation includes library tab with data-testid="tab-library"

## [2026-03-12] Task 8: Open-Page Workflow and Active Library-Record Binding

### Implementation Approach
- Added active library record display in comment tab
- Shows title, siteKey, and close button
- onOpenPage callback switches to comment tab after opening
- libraryOpenPage message creates tab and stores active context
- Error handling with dedicated libraryError state
- Error alert shown in library tab with data-testid="library-open-error"

### Key Design Decisions
- Active record displayed as card above keyword selector
- Opening page automatically switches to comment tab
- Active record can be dismissed with close button
- Errors shown in library tab, not global error state
- Tab creation handled by background via browser.tabs.create
- Active context stored in browser.storage.local for persistence

### Verification Results
- `pnpm compile` passes
- Chrome build succeeds
- Active record card has data-testid="active-library-record"
- Error alert has data-testid="library-open-error"
