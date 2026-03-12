# Google Sheets Webpage Library and Per-Site Page Status for Commentor AI

## TL;DR
> **Summary**: Add a Chrome-first Google Sheets-backed webpage library to the extension, with a background-owned sync/auth gateway, a local snapshot plus persistent sync queue, and explicit per-site+page status writeback.
> **Deliverables**:
> - Google Sheets datasource setup and Chrome auth flow
> - New library domain model (`PageRecord`, datasource config, sync queue, cache)
> - Sidepanel library UI for browsing pages, opening a page, and marking status
> - Background message gateway for auth, read, open-page workflow, and writeback
> - Regression-safe integration with existing commenting, sites, and settings flows
> **Effort**: Large
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2/3/4 → 5/6/7 → 8/9/10

## Context
### Original Request
Add a datasource feature so the extension can connect to Feishu table or Google Sheets as a webpage library. Users should open pages from the extension, leave comments, and mark a page as done/invalid. Management must be on a site+page dimension, so the same page can be done in site A and not done in site B. Also analyze writeback strategy and whether a local copy is needed.

### Interview Summary
- First release targets **Google Sheets first**; Feishu stays as a future connector behind the same abstraction.
- The MVP is **personal-use first**, not a real-time multi-user collaboration product.
- Primary workflow is **open a page from the library inside the extension**, not current-page auto-match.
- Remote writeback is **explicit only**: only user-triggered status actions write remotely.
- Browser scope is **Chrome-first** for the datasource feature; Firefox must not regress existing comment functionality, but parity for Google auth is out of scope.
- No test framework setup in the first release; verification relies on `pnpm compile`, build commands, and agent-executed QA with evidence.

### Metis Review (gaps addressed)
- Metis consultation was attempted twice but timed out; manual gap review was applied before plan generation.
- Added a Chrome-first guardrail because the repo supports Firefox builds but Google extension auth is materially easier on Chrome.
- Added a privacy guardrail: do **not** sync or persist full extracted article content to the remote sheet.
- Added an integration guardrail: do **not** break existing `sites` / `keywords` / LLM settings flows while introducing the library workflow.
- Added conflict and retry guardrails even for the personal-use MVP, because MV3 worker sleep and weak network are still expected.

## Work Objectives
### Core Objective
Introduce a Google Sheets-backed webpage library for the Chrome extension that lets a user browse queued pages by site, open a selected page, generate comments with the existing flow, and explicitly mark that site+page record as done or invalid, while keeping remote data authoritative and local data fast/resilient.

### Deliverables
- Datasource configuration surface for Google Sheets in the extension settings area
- Background-only Google auth, Sheets I/O, retry, and cache ownership
- New domain types and storage keys for library records, datasource config, sync queue, and active library context
- Sidepanel library tab with page list, site grouping/filtering, sync state, and row actions
- Page-open workflow that uses background tab creation and binds the opened tab to a library record
- Explicit status actions (`pending`, `done`, `invalid`) with remote writeback and local retry
- Regression-safe coexistence with current comment generation, site keyword management, and settings

### Definition of Done (verifiable conditions with commands)
- `pnpm compile` passes with no TypeScript errors.
- `pnpm build` succeeds for the Chrome target.
- `pnpm build:firefox` still succeeds, even if Google Sheets datasource actions are disabled or hidden there.
- A configured Google Sheets datasource can be connected in Chrome, and the library list loads without crashing.
- Selecting a library row opens the page and binds the active library context in the sidepanel.
- Explicit status changes (`done`, `invalid`) update local UI immediately and are eventually reflected in the Google Sheet.
- Network failure during writeback leaves a persisted retryable queue item instead of silently dropping the user action.
- Existing comment generation still works for users with no datasource configured.

### Must Have
- Background owns all datasource auth, remote fetch/write, and sync queue logic.
- Remote sheet is the source of truth; local state is a read-through cache plus persistent pending-write queue.
- Page identity is represented by a stable `pageKey`; site identity is represented by `siteKey`.
- Library workflow is added as a new sidepanel path, not as a replacement for the existing comment tab.
- Status writes are explicit user actions only.
- Full article text is kept out of remote sheet writes and long-lived local cache.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT implement Feishu in this plan’s execution scope.
- Must NOT store Google client secrets, app secrets, or other server-grade credentials inside the extension.
- Must NOT use sheet row numbers as durable IDs.
- Must NOT silently overwrite remote state after a version mismatch.
- Must NOT mark a row “opened” or “done” merely because a user clicked it in the list.
- Must NOT refactor unrelated LLM provider logic or redesign the whole sidepanel.
- Must NOT add a test framework in this release.
- Must NOT promise Firefox Google Sheets parity in the MVP.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **none** for framework setup in this release; use `pnpm compile`, `pnpm build`, `pnpm build:firefox`, plus agent-driven browser QA.
- QA policy: Every task includes agent-executed happy-path and failure-path scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`
- Regression policy: Existing comment generation and site/keyword management must be rechecked in the final wave.

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared contracts are extracted into Wave 1 to unlock Wave 2.

Wave 1: schema and platform foundation
- T1. Library domain model and storage contract
- T2. Datasource settings surface and manifest permissions
- T3. Google auth/token lifecycle for Chrome
- T4. Google Sheets connector primitives
- T5. Background datasource gateway contract

Wave 2: sync, UI, and workflow integration
- T6. Local cache, retry queue, and versioned patch sync
- T7. Library tab and page-list UI
- T8. Open-page workflow and active-record binding
- T9. Explicit status actions and remote writeback UX
- T10. Existing-comment-flow integration and regression hardening

### Dependency Matrix (full, all tasks)
| Task | Depends On | Enables |
| --- | --- | --- |
| T1 | — | T4, T5, T6, T7, T8, T9, T10 |
| T2 | — | T3, T4, T5 |
| T3 | T2 | T4, T5, T6 |
| T4 | T1, T2, T3 | T5, T6, T7, T8, T9 |
| T5 | T1, T2, T3, T4 | T6, T7, T8, T9, T10 |
| T6 | T1, T3, T4, T5 | T9, T10 |
| T7 | T1, T4, T5 | T8, T9, T10 |
| T8 | T5, T7 | T9, T10 |
| T9 | T5, T6, T7, T8 | T10 |
| T10 | T5, T6, T7, T8, T9 | Final verification |

### Agent Dispatch Summary
| Wave | Task Count | Suggested Categories |
| --- | --- | --- |
| Wave 1 | 5 | unspecified-high, deep |
| Wave 2 | 5 | unspecified-high, quick |
| Final Verification | 4 | oracle, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Define the library domain model and storage contract

  **What to do**: Add new shared types for datasource config, Google auth/session metadata, `PageRecord`, `LibrarySnapshot`, `SyncQueueItem`, and active library context. Define the stable storage keys in `browser.storage.local`, plus a bootstrap/migration path from the current “no library state” so existing installs keep working. Specify `siteKey` as normalized host/origin and `pageKey` as normalized canonical URL without fragment and without common tracking params.
  **Must NOT do**: Must NOT repurpose `SiteItem` to store page rows. Must NOT persist full extracted article content in the library snapshot or sync queue. Must NOT use sheet row index as an identifier.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-file contract design with migration risk.
  - Skills: `[]` — No extra skill needed; repo-native patterns are enough.
  - Omitted: `["frontend-design"]` — Not a UI-design task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 4, 5, 6, 7, 8, 9, 10] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/types/site.ts:3` — Current shared entity shape; keep library entities separate from site keyword entities.
  - Pattern: `src/types/content.ts:1` — Existing content payload includes full text; use this as a reminder to keep full content out of remote/library persistence.
  - Pattern: `src/types/index.ts:1` — Barrel export location that must continue exposing shared types.
  - Pattern: `entrypoints/sidepanel/App.tsx:42` — Existing storage bootstrap/migration logic for `sites` and legacy `keywords`.
  - Pattern: `entrypoints/sidepanel/App.tsx:105` — Existing persist helper pattern for local state → `browser.storage.local`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] New shared types compile and are exported through the existing barrel with `pnpm compile`.
  - [ ] Existing `sites` loading behavior still works for users with no library data present.
  - [ ] Library state bootstrap creates no runtime errors when `browser.storage.local` has none of the new keys.
  - [ ] No type or storage contract includes full article body text as a persisted library field.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: clean profile bootstrap
    Tool: Bash
    Steps: run `pnpm compile`; start dev build; load the extension in Chrome with empty storage; open the sidepanel and confirm the app renders without library-state exceptions.
    Expected: compile succeeds; sidepanel renders; console shows no errors about missing library keys.
    Evidence: .sisyphus/evidence/task-1-library-model.txt

  Scenario: legacy storage compatibility
    Tool: interactive_bash
    Steps: launch the app with storage containing only existing `sites` data; open the sidepanel and navigate between current tabs.
    Expected: existing site/keyword UI still renders and no migration code deletes or corrupts `sites`.
    Evidence: .sisyphus/evidence/task-1-library-model-legacy.txt
  ```

  **Commit**: YES | Message: `feat(types): add library record and sync state contracts` | Files: [`src/types/*`, `entrypoints/sidepanel/App.tsx`]

- [x] 2. Add datasource settings fields and Chrome-only manifest permissions

  **What to do**: Extend settings so the user can configure Google Sheets connection details needed for the MVP (spreadsheet ID, sheet/tab name or range contract, connect/disconnect state, and validation feedback). Update manifest/config so Chrome builds have the permissions required for Google auth and Sheets requests, while Firefox builds remain compileable and non-regressive even if datasource actions are unavailable there.
  **Must NOT do**: Must NOT add server-side secrets. Must NOT remove existing OpenAI/Gemini settings. Must NOT promise Firefox parity for Google auth.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: settings + manifest changes affect runtime permissions and multi-browser behavior.
  - Skills: `[]` — No extra skill required.
  - Omitted: `["frontend-design"]` — Functional settings work matters more than visual redesign.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3, 4, 5] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `wxt.config.ts:6` — Current manifest permissions live here; extend instead of inventing another config path.
  - Pattern: `entrypoints/sidepanel/components/SettingsPanel.tsx:15` — Existing settings-panel structure and local status-message pattern.
  - Pattern: `entrypoints/sidepanel/App.tsx:400` — Current settings tab hosts `SettingsPanel`; keep the same integration point.
  - Pattern: `package.json:7` — Chrome and Firefox build scripts already exist; permission changes must not break either build.
  - External: `https://developer.chrome.com/docs/extensions/reference/api/identity` — Official Chrome identity API reference for required permission and token flow boundaries.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Chrome manifest includes the minimum permissions/host access required for Google auth + Sheets API requests.
  - [ ] Firefox build still completes even if Google auth controls are hidden or disabled there.
  - [ ] Settings UI preserves all existing LLM controls and adds datasource configuration without overlap or loss.
  - [ ] Invalid or incomplete datasource input shows a deterministic error state instead of silently saving unusable config.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: settings render with new datasource fields
    Tool: Playwright
    Steps: open sidepanel; click the `设置` tab; verify existing LLM fields still exist; verify new controls with selectors `[data-testid="datasource-provider-google"]`, `[data-testid="datasource-spreadsheet-id"]`, and `[data-testid="datasource-connect"]` are present.
    Expected: both legacy settings and new datasource controls are visible and interactable.
    Evidence: .sisyphus/evidence/task-2-settings-ui.png

  Scenario: invalid datasource input is rejected
    Tool: Playwright
    Steps: open settings; enter `bad-id` into `[data-testid="datasource-spreadsheet-id"]`; click `[data-testid="datasource-connect"]`.
    Expected: a visible error state appears in `[data-testid="datasource-error"]`; config is not treated as connected.
    Evidence: .sisyphus/evidence/task-2-settings-ui-error.png
  ```

  **Commit**: YES | Message: `feat(settings): add Google Sheets datasource configuration` | Files: [`wxt.config.ts`, `entrypoints/sidepanel/components/SettingsPanel.tsx`, `entrypoints/sidepanel/App.tsx`]

- [x] 3. Implement Chrome Google auth and token lifecycle management

  **What to do**: Implement a Chrome-first auth flow in background using the extension identity API. Acquire, cache, invalidate, and refresh access tokens as needed for Sheets API requests; expose background message actions so the UI can request connect/disconnect/validate status without handling tokens directly. Define a Firefox-safe fallback state so Firefox builds do not crash.
  **Must NOT do**: Must NOT place client secrets or refresh secrets in the extension. Must NOT expose raw access tokens to React component state. Must NOT block the whole extension if auth fails.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: auth lifecycle, browser capability boundaries, and secure ownership model.
  - Skills: `[]` — Official docs and repo patterns are sufficient.
  - Omitted: `["frontend-design"]` — Pure behavior/infrastructure task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4, 5, 6] | Blocked By: [2]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/background.ts:25` — Existing message-router pattern; auth actions must be added here or extracted under this entrypoint.
  - Pattern: `entrypoints/background.ts:135` — Background already contains browser-specific behavior gating; reuse this style for Chrome-first auth capability checks.
  - External: `https://developer.chrome.com/docs/extensions/reference/api/identity` — Official token acquisition reference.
  - External: `https://developer.chrome.com/docs/extensions/how-to/integrate/oauth` — Official Chrome extensions OAuth guidance.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Sidepanel never directly stores or manipulates Google access tokens.
  - [ ] Background can report `disconnected`, `connecting`, `connected`, and `error` auth states through message actions.
  - [ ] Invalid/expired token paths trigger a controlled reconnect or error state instead of infinite retry.
  - [ ] Firefox build path returns a stable “unsupported for datasource auth” result instead of throwing.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: successful Chrome auth handshake
    Tool: Playwright
    Steps: in Chrome, open settings; click `[data-testid="datasource-connect"]`; complete the Google auth flow; reopen the sidepanel.
    Expected: `[data-testid="datasource-status"]` shows `connected`; the token is not rendered anywhere in the UI.
    Evidence: .sisyphus/evidence/task-3-google-auth.png

  Scenario: revoked or invalid token recovery
    Tool: Playwright
    Steps: connect successfully; invalidate the token using the browser auth tooling or cached-token removal path; trigger a library refresh.
    Expected: UI transitions to a recoverable error state in `[data-testid="datasource-error"]` or requests reconnect; no uncaught exception occurs.
    Evidence: .sisyphus/evidence/task-3-google-auth-error.png
  ```

  **Commit**: YES | Message: `feat(auth): add Chrome Google Sheets authorization flow` | Files: [`entrypoints/background.ts`, related auth helpers, settings integration files]

- [x] 4. Implement Google Sheets connector read/write primitives

  **What to do**: Add a dedicated Google Sheets service layer that can validate the configured spreadsheet, fetch page rows into the normalized `PageRecord` shape, and submit batch status updates. Define a strict sheet schema contract for the MVP, including required columns such as `site_key`, `page_key`, `source_url`, `canonical_url`, `title`, `status`, `version`, and `updated_at`.
  **Must NOT do**: Must NOT depend on row order. Must NOT read or write through ad-hoc cell coordinates scattered through the UI. Must NOT mix connector code into React components.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: service-layer logic with external API mapping and schema validation.
  - Skills: `[]` — No extra skill required.
  - Omitted: `["frontend-design"]` — No UI-design need.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5, 6, 7, 8, 9] | Blocked By: [1, 2, 3]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/services/llm/index.ts:6` — Existing service-layer interface pattern; mirror this separation for datasource logic.
  - Pattern: `entrypoints/sidepanel/App.tsx:163` — Service usage is currently centralized before UI updates; keep connector usage behind a service boundary.
  - External: `https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate` — Official batch value update API.
  - External: `https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate` — Official structural/batched update API.
  - External: `https://developers.google.com/workspace/sheets/api/limits` — Official quota guidance (per-minute quotas and backoff expectations).

  **Acceptance Criteria** (agent-executable only):
  - [ ] Connector can normalize a sheet row into `PageRecord` without relying on row index as identity.
  - [ ] Connector rejects sheets missing required columns with a clear validation error.
  - [ ] Connector can perform batched status writes for one or more queued patches.
  - [ ] All connector calls route through a single service layer, not duplicated in UI components.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: valid sheet loads normalized records
    Tool: Bash
    Steps: run the extension against a test spreadsheet with required columns and at least 3 rows across 2 `site_key` values; trigger the connector load action.
    Expected: normalized records are returned with stable `siteKey` and `pageKey`; no row-order assumptions appear in logs.
    Evidence: .sisyphus/evidence/task-4-sheets-connector.txt

  Scenario: invalid sheet schema fails safely
    Tool: Bash
    Steps: point the datasource at a sheet missing `page_key` or `status`; trigger validation.
    Expected: connector returns a deterministic schema-validation error; UI can surface it without crashing.
    Evidence: .sisyphus/evidence/task-4-sheets-connector-error.txt
  ```

  **Commit**: YES | Message: `feat(datasource): add Google Sheets connector primitives` | Files: [`src/services/**`, `entrypoints/background.ts`, shared type files]

- [x] 5. Build the background datasource gateway and message protocol

  **What to do**: Extend the background entrypoint into the single gateway for library bootstrap, sheet refresh, open-page action, active-record resolution, and explicit status writeback. Define message shapes and return payloads so the sidepanel can request library operations without knowing auth/token details or connector internals.
  **Must NOT do**: Must NOT let sidepanel components call Google APIs directly. Must NOT leave sync queue state in memory only. Must NOT overload the existing content-extraction messages with unrelated payload shapes.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: central runtime boundary and cross-context message contract.
  - Skills: `[]` — Native repo patterns are enough.
  - Omitted: `["frontend-design"]` — Infrastructure-only task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [6, 7, 8, 9, 10] | Blocked By: [1, 2, 3, 4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/background.ts:25` — Existing `browser.runtime.onMessage` handling pattern.
  - Pattern: `entrypoints/background.ts:84` — Existing async background → tab communication pattern.
  - Pattern: `entrypoints/sidepanel/App.tsx:125` — Sidepanel currently sends runtime messages for page-content extraction; follow the same direction of flow while expanding message types.
  - Pattern: `entrypoints/content/index.ts:84` — Content script already listens for discrete `action` names; keep action naming consistent.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Sidepanel can request library bootstrap, refresh, open-page, and status update through background-only message actions.
  - [ ] Background responses are typed, deterministic, and distinguish success, retryable failure, and fatal failure.
  - [ ] Existing `getPageContent` and `getPageLanguage` message flows still work unchanged.
  - [ ] Gateway survives service-worker restart because required state lives in storage, not only memory.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: sidepanel bootstraps library through background only
    Tool: Playwright
    Steps: open the sidepanel on a configured Chrome profile; navigate to `[data-testid="tab-library"]`; trigger `[data-testid="library-refresh"]`.
    Expected: library data loads via background; no direct Google API error leaks to the page context; existing comment tab still works.
    Evidence: .sisyphus/evidence/task-5-gateway.png

  Scenario: service-worker restart preserves library state
    Tool: Playwright
    Steps: load the library; force or wait for background worker restart; reopen the sidepanel and trigger another library action.
    Expected: gateway rehydrates from storage and continues without losing pending sync metadata.
    Evidence: .sisyphus/evidence/task-5-gateway-restart.png
  ```

  **Commit**: YES | Message: `feat(background): add datasource gateway message protocol` | Files: [`entrypoints/background.ts`, related shared message/type files]

- [x] 6. Implement local snapshot caching, persistent sync queue, and versioned patch sync

  **What to do**: Add a local snapshot store for normalized library rows plus a persistent queue for pending status patches. Reads should return cached rows immediately and then reconcile against the sheet. Writes should update local state optimistically, enqueue a patch, and flush via background with exponential backoff, `version` checks, and deterministic retry/error metadata.
  **Must NOT do**: Must NOT drop failed writes silently. Must NOT keep pending patches only in memory. Must NOT overwrite remote rows blindly after version mismatch.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: sync semantics, durability, and error handling.
  - Skills: `[]` — No extra skill required.
  - Omitted: `["frontend-design"]` — Pure sync/state logic.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [9, 10] | Blocked By: [1, 3, 4, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/sidepanel/App.tsx:105` — Existing optimistic local update pattern before persisting.
  - Pattern: `entrypoints/sidepanel/App.tsx:66` — Existing visibility/focus refresh pattern can inform cache refresh triggers.
  - External: `https://developers.google.com/workspace/sheets/api/limits` — Quota/backoff guidance.
  - External: `https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate` — Batch status write target.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Library list can render from local snapshot before remote refresh completes.
  - [ ] Explicit status updates create durable queue items when remote flush fails.
  - [ ] Queue flushing marks success, retryable error, and terminal error states explicitly.
  - [ ] Version mismatch never silently overwrites remote data; the row is surfaced as conflicted or blocked for retry.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: offline write is queued and later flushed
    Tool: Playwright
    Steps: load library data; disconnect network; click `[data-testid="status-done"]` on one row; confirm a queued state; reconnect network; trigger `[data-testid="library-refresh"]` or auto-flush.
    Expected: UI shows pending-sync then synced; the queue item persists across a sidepanel close/reopen.
    Evidence: .sisyphus/evidence/task-6-sync-queue.png

  Scenario: version mismatch is not overwritten
    Tool: Bash
    Steps: create a row version conflict by modifying the same record remotely before flush; run the status-update path.
    Expected: sync result reports a conflict/error state instead of silently applying the stale local patch.
    Evidence: .sisyphus/evidence/task-6-sync-queue-conflict.txt
  ```

  **Commit**: YES | Message: `feat(sync): add local snapshot and persistent status queue` | Files: [`entrypoints/background.ts`, local storage helpers, shared sync types]

- [x] 7. Add the sidepanel library tab and page-list UI

  **What to do**: Add a new library-focused tab to the sidepanel with page rows loaded from the local snapshot/gateway. Include site grouping or filter, status badge, sync-state indicator, refresh action, empty state, loading state, unconfigured state, and per-row open/status action affordances.
  **Must NOT do**: Must NOT remove or redesign the existing comment/sites/settings tabs. Must NOT hide datasource errors. Must NOT make the library tab depend on current-page extraction to render.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: net-new sidepanel UI built on existing patterns.
  - Skills: `["frontend-design"]` — Useful for a polished but restrained library panel.
  - Omitted: `[]` — No omission needed.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8, 9, 10] | Blocked By: [1, 4, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/sidepanel/App.tsx:313` — Existing tab-strip and panel rendering pattern.
  - Pattern: `entrypoints/sidepanel/components/SiteManager.tsx:113` — Existing card/list/detail layout pattern suitable for a compact data-management UI.
  - Pattern: `entrypoints/sidepanel/components/SiteKeywordSelector.tsx:8` — Existing badge/filter-style chip interaction pattern.
  - Pattern: `entrypoints/sidepanel/components/CommentOutput.tsx:60` — Existing card-based result blocks and button grouping style.

  **Acceptance Criteria** (agent-executable only):
  - [ ] A new library tab is present and does not break the existing tab navigation.
  - [ ] Library UI can show loading, empty, misconfigured, synced, and sync-error states explicitly.
  - [ ] The user can filter or scope rows by `siteKey` without changing the underlying comment keyword model.
  - [ ] Row actions expose open and status controls with stable `data-testid` selectors for QA.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: library list renders and filters by site
    Tool: Playwright
    Steps: open `[data-testid="tab-library"]`; wait for `[data-testid="library-list"]`; choose `[data-testid="site-filter-site-a"]`.
    Expected: only rows with `site_a` remain visible; badges and sync indicators remain rendered.
    Evidence: .sisyphus/evidence/task-7-library-ui.png

  Scenario: unconfigured datasource shows explicit empty state
    Tool: Playwright
    Steps: clear datasource config; open `[data-testid="tab-library"]`.
    Expected: `[data-testid="library-unconfigured"]` appears with no crash and existing tabs remain usable.
    Evidence: .sisyphus/evidence/task-7-library-ui-error.png
  ```

  **Commit**: YES | Message: `feat(sidepanel): add webpage library tab and list UI` | Files: [`entrypoints/sidepanel/App.tsx`, new/updated sidepanel components]

- [x] 8. Implement open-page workflow and active library-record binding

  **What to do**: From the library tab, open a selected row in a browser tab through background, then bind the actual opened page back to the matching `PageRecord` in the sidepanel. Confirm the actual URL after load before treating the row as active, and surface mismatch/dead-link errors cleanly.
  **Must NOT do**: Must NOT mark the page remotely as done or opened at click time. Must NOT assume the originally requested URL equals the final resolved URL. Must NOT couple this workflow to comment generation success.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-context workflow with tab state and library state.
  - Skills: `[]` — Repo-native browser APIs are sufficient.
  - Omitted: `["frontend-design"]` — Behavior-first task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9, 10] | Blocked By: [5, 7]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/background.ts:41` — Existing active-tab lookup pattern.
  - Pattern: `entrypoints/content/index.ts:10` — Existing page extraction path can help resolve title/URL/canonical context after load.
  - Pattern: `entrypoints/content/index.ts:45` — Existing page-language retrieval shows how to ask the content script for page-derived metadata.
  - Pattern: `entrypoints/sidepanel/App.tsx:110` — Existing comment-generation action starts from the active page context.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Clicking a library row open action creates or focuses a browser tab via background logic.
  - [ ] After the page loads, sidepanel can identify the active `PageRecord` and show bound metadata.
  - [ ] URL mismatch or dead-link outcomes produce an explicit error or unbound state instead of an incorrect status update.
  - [ ] Existing current-page comment generation still functions when no active library row is bound.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: open library page and bind active record
    Tool: Playwright
    Steps: in `[data-testid="tab-library"]`, click `[data-testid="library-open-row-page-a-site-a"]`; wait for the target tab to load; return to the sidepanel.
    Expected: `[data-testid="active-library-record"]` shows the matching title/site and the comment tab can operate on that page.
    Evidence: .sisyphus/evidence/task-8-open-flow.png

  Scenario: dead or mismatched URL is handled safely
    Tool: Playwright
    Steps: click an intentionally invalid row such as `[data-testid="library-open-row-bad-link"]`.
    Expected: `[data-testid="library-open-error"]` appears; no status is auto-written; the sidepanel remains responsive.
    Evidence: .sisyphus/evidence/task-8-open-flow-error.png
  ```

  **Commit**: YES | Message: `feat(workflow): open library pages and bind active records` | Files: [`entrypoints/background.ts`, `entrypoints/content/index.ts`, sidepanel integration files]

- [ ] 9. Add explicit status actions and remote writeback UX

  **What to do**: Add explicit per-row and active-record actions for `done` and `invalid`, with immediate local UI updates and background queue flush to Google Sheets. Surface sync state (`synced`, `pending`, `retrying`, `error`) in the library UI and active context. Persist metadata like `updatedAt`, `updatedBy` (if available), and `version`, but do not write comment text.
  **Must NOT do**: Must NOT auto-mark rows after opening the page. Must NOT auto-mark rows after generating a comment. Must NOT sync comment bodies or extracted article content.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: state transition logic plus user-visible reliability UX.
  - Skills: `[]` — No extra skill required.
  - Omitted: `["frontend-design"]` — Functional clarity matters more than bespoke design.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [10] | Blocked By: [5, 6, 7, 8]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/sidepanel/App.tsx:121` — Existing load/error state handling around async actions.
  - Pattern: `entrypoints/sidepanel/components/CommentOutput.tsx:56` — Existing action-button grouping pattern for compact controls.
  - External: `https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate` — Remote status write target.
  - External: `https://developers.google.com/workspace/sheets/api/limits` — Quota/backoff expectations for retry UX.

  **Acceptance Criteria** (agent-executable only):
  - [ ] User can mark a row or active record as `done` or `invalid` from the sidepanel.
  - [ ] Status changes update local UI immediately and then reconcile with remote sync outcome.
  - [ ] Failure states remain visible until resolved; they are not auto-cleared without a successful retry.
  - [ ] No remote write includes the generated comment body.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: explicit status update succeeds
    Tool: Playwright
    Steps: open a valid row; click `[data-testid="status-done"]`; trigger or await queue flush.
    Expected: the row badge changes to `done`; `[data-testid="sync-state"]` transitions from `pending` to `synced`; the Google Sheet row reflects the new status.
    Evidence: .sisyphus/evidence/task-9-status-writeback.png

  Scenario: explicit status update fails and remains actionable
    Tool: Playwright
    Steps: disable network or revoke auth; click `[data-testid="status-invalid"]`.
    Expected: the row enters a visible error or retrying state in `[data-testid="sync-state"]`; the action is not silently lost.
    Evidence: .sisyphus/evidence/task-9-status-writeback-error.png
  ```

  **Commit**: YES | Message: `feat(status): add explicit library status writeback` | Files: [`entrypoints/sidepanel/**`, `entrypoints/background.ts`, connector/sync helpers]

- [ ] 10. Integrate the library context with existing comment flow and harden regressions

  **What to do**: Make the comment workflow aware of the active library record without changing its core LLM/content-extraction behavior. Show the bound library context in the comment view, preserve the existing keyword/site management experience, and ensure that users without datasource config can still use the extension exactly as before. Complete compile/build regression checks and capture final evidence for legacy and new flows.
  **Must NOT do**: Must NOT auto-mark status after comment generation. Must NOT require datasource setup for the legacy comment flow. Must NOT change prompt-generation behavior except where active library context is displayed.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: final integration across existing runtime paths.
  - Skills: `[]` — No extra skill needed.
  - Omitted: `["frontend-design"]` — Regression-safe behavior matters most.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [Final verification] | Blocked By: [5, 6, 7, 8, 9]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `entrypoints/sidepanel/App.tsx:110` — Existing comment-generation entry point.
  - Pattern: `entrypoints/sidepanel/App.tsx:347` — Existing comment-tab rendering block.
  - Pattern: `entrypoints/sidepanel/components/CommentOutput.tsx:56` — Existing output rendering and copy actions must remain intact.
  - Pattern: `entrypoints/sidepanel/components/SiteManager.tsx:116` — Existing site manager must remain usable and visually stable.
  - Pattern: `package.json:7` — Final regression verification commands live here.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Existing comment generation still works with no datasource configured.
  - [ ] When a library row is active, the comment tab displays enough context for the user to know which library record they are working on.
  - [ ] Marking status remains an explicit user action before or after comment generation; generate-comment success does not change status automatically.
  - [ ] `pnpm compile`, `pnpm build`, and `pnpm build:firefox` all pass at the end of the task.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: legacy comment flow still works without datasource
    Tool: Playwright
    Steps: clear datasource config; open the comment tab; trigger existing comment generation on a normal page.
    Expected: comments generate successfully; no library requirement blocks the action.
    Evidence: .sisyphus/evidence/task-10-regression-legacy.png

  Scenario: bound library context does not auto-change status
    Tool: Playwright
    Steps: open a library row; switch to the comment tab; generate a comment; inspect the active record status afterward.
    Expected: `[data-testid="active-library-record"]` remains visible, but status stays unchanged until the user clicks a status action.
    Evidence: .sisyphus/evidence/task-10-regression-library.png
  ```

  **Commit**: YES | Message: `chore(integration): wire library context without regressing comment flow` | Files: [`entrypoints/sidepanel/**`, `entrypoints/background.ts`, any related shared helpers]

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Prefer **atomic commits per task** when a task leaves the repository in a coherent, compileable state.
- If two tightly-coupled tasks cannot be landed independently without breaking compile/build, merge them into a single commit at execution time, but preserve the task boundaries in evidence.
- Commit sequence should follow the critical path:
  1. types/storage contract
  2. settings + permissions + auth
  3. Sheets connector + background gateway
  4. cache/sync queue
  5. library UI
  6. page open flow
  7. status writeback
  8. comment-flow integration and regression hardening
- Every commit message must explain intent, not just files changed.

## Success Criteria
- The extension can connect to a user-provided Google Sheets library in Chrome without leaking secrets.
- The user can browse pages by site, open one, and complete the comment workflow without losing the existing experience.
- Site+page status is represented explicitly and correctly, so the same page can differ across sites.
- Local cache improves responsiveness and preserves pending writes across worker restarts and transient failures.
- Remote writeback is deliberate, resilient, and observable; failures are surfaced, not hidden.
- Existing non-datasource users can keep using the extension unchanged.
