# 网页库功能架构文档

> 文档版本: 1.0  
> 最后更新: 2026-03-19  
> 涉及提交: 5c7cc8b 及后续 commits

---

## 1. 功能概述

网页库功能允许用户将 **Google Sheets** 作为中心化数据源，管理一组待处理的网页集合。用户在 sidepanel 中可以：

- 浏览和过滤网页库
- 打开库中的页面
- 标记处理状态（待处理/已完成/无效）
- 保持本地数据与 Google Sheets 的双向同步

### 1.1 用户工作流

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  配置数据源      │ ──▶ │   浏览网页库     │ ──▶ │  打开并处理页面  │
│ (Google Sheets) │     │  (LibraryPanel) │     │ (生成评论/标记)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  状态同步到云端  │
                                                 │ (同步队列+重试) │
                                                 └─────────────────┘
```

---

## 2. 核心概念

### 2.1 数据模型

#### PageRecord（页面记录）

```typescript
interface PageRecord {
  pageKey: string;       // URL 规范化后的唯一键（去 tracking 参数）
  siteKey: string;       // 域名（hostname），用于分组
  sourceUrl: string;     // 原始 URL
  canonicalUrl: string;  // 规范 URL
  title: string;         // 页面标题
  status: PageStatus;    // 'pending' | 'done' | 'invalid'
  version: number;       // 乐观锁版本号
  updatedAt: string;     // 最后更新时间（ISO 8601）
  updatedBy?: string;    // 更新者（预留）
  syncState?: SyncState; // 同步状态
}
```

#### 关键设计：规范化 URL

```typescript
export function normalizePageKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  // 去除常见的 tracking 参数
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'ref', 'source',
  ];
  for (const param of trackingParams) {
    parsed.searchParams.delete(param);
  }
  return parsed.toString();
}
```

**目的**：确保同一页面在不同分享链接下具有相同的唯一标识。

#### LibrarySnapshot（本地快照）

```typescript
interface LibrarySnapshot {
  records: PageRecord[];
  fetchedAt: string;           // 缓存时间戳
  datasourceVersion?: string;  // 数据源版本（预留）
}
```

本地快照允许用户在离线状态下浏览库，并在恢复连接后同步变更。

#### SyncQueueItem（同步队列项）

```typescript
interface SyncQueueItem {
  id: string;
  pageKey: string;
  siteKey: string;
  status: PageStatus;
  version: number;
  enqueuedAt: string;
  retryCount: number;    // 当前重试次数
  lastError?: string;    // 上次错误信息
  syncState: SyncState;  // 'pending' | 'retrying' | 'error'
}
```

### 2.2 状态机

#### 页面状态（PageStatus）

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ pending │───▶│  done   │◀───│ invalid │
└────┬────┘    └─────────┘    └────┬────┘
     │                              │
     └──────────────────────────────┘
              (可相互转换)
```

#### 同步状态（SyncState）

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│  init   │───▶│ pending │───▶│ retrying│
└─────────┘    └────┬────┘    └────┬────┘
                    │              │
                    ▼              ▼
              ┌─────────┐    ┌─────────┐
              │ synced  │    │  error  │
              └─────────┘    └─────────┘
```

---

## 3. 系统架构

### 3.1 模块结构

```
entrypoints/
├── background.ts                    # 后台服务：消息路由 + 同步调度
└── sidepanel/
    └── components/
        ├── LibraryPanel.tsx         # 网页库 UI
        └── SettingsPanel.tsx        # 数据源配置 UI

src/services/
├── auth.ts                          # Google OAuth2 认证
├── sheets.ts                        # Google Sheets API 封装
└── sync.ts                          # 同步队列管理

src/types/
└── library.ts                       # 类型定义 + 工具函数
```

### 3.2 数据流

#### 读取流程

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ LibraryPanel │────▶│ libraryBootstrap│────▶│  browser.storage│
│   (UI加载)    │     │   (background)  │     │   (本地缓存)     │
└──────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  返回缓存数据    │
                       │ (立即渲染)       │
                       └─────────────────┘

┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  点击刷新     │────▶│ libraryRefresh  │────▶│  fetch from     │
│   (用户操作)  │     │   (background)  │     │  Google Sheets  │
└──────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  更新本地缓存    │
                       │  返回最新数据    │
                       └─────────────────┘
```

#### 写入流程（状态更新）

```
┌──────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ 标记状态变更  │────▶│   libraryStatusUpdate │────▶│   本地存储更新   │
│ (用户点击)    │     │     (background)     │     │  (snapshot+queue)│
└──────────────┘     └─────────────────────┘     └─────────────────┘
                              │
                              ├────────────────────────────────────┐
                              │                                    │
                              ▼                                    ▼
                    ┌─────────────────┐              ┌─────────────────┐
                    │  立即同步模式    │              │   离线队列模式   │
                    │ (在线且有配置)   │              │ (离线或未配置)   │
                    └────────┬────────┘              └────────┬────────┘
                             │                                 │
                             ▼                                 ▼
                    ┌─────────────────┐              ┌─────────────────┐
                    │ batchUpdate to  │              │  入队待同步     │
                    │  Google Sheets  │              │  syncState=pending│
                    └────────┬────────┘              └─────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌──────────┐      ┌──────────┐
            │  成功     │      │  失败    │
            │ syncState│      │ 入队重试 │
            │ =synced  │      │          │
            └──────────┘      └──────────┘
```

### 3.3 后台同步机制

```typescript
// src/services/sync.ts

const MAX_RETRY_COUNT = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // 指数退避

export async function flushSyncQueue(): Promise<void> {
  // 1. 读取队列和配置
  // 2. 过滤出待同步项 (pending/retrying)
  // 3. 批量更新到 Google Sheets
  // 4. 成功：从队列移除，更新本地记录状态
  // 5. 失败：增加重试计数，更新状态为 retrying/error
  // 6. 安排下次重试（如需要）
}

export async function schedulePeriodicSync(): Promise<void> {
  await flushSyncQueue();
  setTimeout(() => schedulePeriodicSync(), 60000); // 每分钟检查
}
```

#### 重试策略

| 重试次数 | 延迟时间 | 状态 |
|---------|---------|------|
| 0 | 立即 | pending |
| 1 | 1秒 | retrying |
| 2 | 5秒 | retrying |
| 3 | 15秒 | retrying |
| >3 | 停止 | error |

---

## 4. 组件设计

### 4.1 LibraryPanel

```typescript
interface LibraryPanelProps {
  onOpenPage: (record: PageRecord) => void;
  onStatusChange: (record: PageRecord, newStatus: PageStatus) => Promise<{
    syncState: 'synced' | 'pending';
    updatedRecord?: PageRecord | null;
  }>;
}
```

**功能**：
- 加载和展示库数据
- 按站点过滤
- 状态变更（乐观更新）
- 打开页面

**状态管理**：
- `snapshot`: 当前库数据
- `loading`: 加载状态
- `selectedSite`: 当前过滤的站点
- `pendingStatusUpdates`: 正在处理的状态变更（防止重复提交）

### 4.2 SettingsPanel 扩展

新增数据源配置区域：

```typescript
interface SettingsPanelProps {
  // ... 原有 LLM 配置
  datasourceConfig?: DatasourceConfig | null;
  onDatasourceSaved?: (config: DatasourceConfig) => void;
}
```

---

## 5. 认证与安全

### 5.1 OAuth2 流程

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  用户点击连接  │────▶│  authConnect    │────▶│ chrome.identity │
│              │     │  (background)   │     │ .getAuthToken() │
└──────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │ Google OAuth2   │
                                               │   授权弹窗       │
                                               └─────────────────┘
```

### 5.2 权限配置

```javascript
// wxt.config.ts
{
  oauth2: {
    client_id: env.WXT_GOOGLE_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  },
  permissions: [
    'storage',
    'activeTab',
    'scripting',
    'sidePanel',
    'identity',  // Chrome 专属
  ],
  host_permissions: [
    'https://www.googleapis.com/*',
    'https://sheets.googleapis.com/*',
  ],
}
```

---

## 6. Google Sheets 集成

### 6.1 Sheet Schema

| 列名 | 类型 | 说明 |
|------|------|------|
| site_key | string | 站点域名 |
| page_key | string | 规范化后的 URL（唯一键） |
| source_url | string | 原始 URL |
| canonical_url | string | 规范 URL |
| title | string | 页面标题 |
| status | string | 'pending'/'done'/'invalid' |
| version | number | 乐观锁版本 |
| updated_at | ISO8601 | 更新时间 |

### 6.2 API 操作

```typescript
// src/services/sheets.ts

// 1. 验证 Sheet 结构
async function validateSheetSchema(config: DatasourceConfig): Promise<SheetSchema>

// 2. 读取所有记录
async function fetchPageRecords(config: DatasourceConfig): Promise<PageRecord[]>

// 3. 批量更新状态（乐观锁检查）
async function batchUpdateStatus(
  config: DatasourceConfig, 
  updates: StatusUpdate[]
): Promise<void>
```

### 6.3 乐观锁实现

```typescript
// 更新前检查版本
if (currentRecord.version >= update.version) {
  conflicts.push(update.pageKey);
  continue; // 跳过冲突项
}

// 无冲突才执行更新
const nextVersion = update.version + 1;
// 更新 status, version, updated_at
```

---

## 7. 存储管理

### 7.1 Storage Keys

```typescript
export const LibraryStorageKeys = {
  DATASOURCE_CONFIG: 'datasourceConfig',
  AUTH_STATE: 'authState',
  LIBRARY_SNAPSHOT: 'librarySnapshot',
  SYNC_QUEUE: 'syncQueue',
  ACTIVE_LIBRARY_CONTEXT: 'activeLibraryContext',
} as const;
```

### 7.2 数据持久化策略

| 数据 | 存储位置 | 持久化时机 |
|------|---------|-----------|
| 数据源配置 | `browser.storage.local` | 用户保存时 |
| 认证状态 | `browser.storage.local` | 授权/撤销时 |
| 库快照 | `browser.storage.local` | 刷新/同步后 |
| 同步队列 | `browser.storage.local` | 每次状态变更 |
| 活跃上下文 | `browser.storage.local` | 打开页面时 |

---

## 8. 扩展性设计

### 8.1 数据源抽象

```typescript
// 当前仅支持 Google Sheets，但设计可扩展
interface DatasourceConfig {
  provider: 'google-sheets';  // 未来可添加 'airtable' | 'notion' 等
  spreadsheetId: string;
  sheetName: string;
  connected: boolean;
  connectedAt?: string;
}
```

### 8.2 认证抽象

```typescript
// src/services/auth.ts
export async function isAuthSupported(): Promise<boolean>
export async function getAccessToken(): Promise<string | null>
export async function acquireToken(interactive?: boolean): Promise<string>
export async function revokeToken(): Promise<void>
```

通过 `isAuthSupported()` 检查浏览器支持情况，便于移植到其他 Chromium 浏览器。

---

## 9. 错误处理

### 9.1 错误类型

| 场景 | 处理方式 |
|------|---------|
| 认证失败 | 显示错误状态，允许重新连接 |
| Sheet 不存在 | 提示检查 Spreadsheet ID |
| 列缺失 | 提示检查 Sheet 结构 |
| 网络中断 | 入队，自动重试 |
| 版本冲突 | 跳过该项，记录日志 |
| 权限不足 | 提示重新授权 |

### 9.2 用户反馈

- **Toast 提示**：保存成功/失败
- **Badge 状态**：连接状态指示
- **同步状态标签**：每个记录显示 syncState
- **重试动画**：同步中显示 loading spinner

---

## 10. 开发指南

### 10.1 添加新的数据源类型

1. 扩展 `DatasourceConfig.provider` 类型
2. 实现对应服务模块（如 `src/services/airtable.ts`）
3. 在 `SettingsPanel` 添加配置 UI
4. 在 `background.ts` 消息处理器中分发到对应服务

### 10.2 调试技巧

```javascript
// 查看存储数据
chrome.storage.local.get(null, console.log);

// 查看同步队列
chrome.storage.local.get('syncQueue', ({syncQueue}) => {
  console.table(syncQueue);
});

// 手动触发同步
chrome.runtime.sendMessage({action: 'libraryRefresh'});
```

---

## 附录 A：消息协议完整列表

| Action | 请求参数 | 响应 | 说明 |
|--------|---------|------|------|
| `authConnect` | - | `{success, state, error?}` | 启动 OAuth 授权 |
| `authDisconnect` | - | `{success, state}` | 撤销授权 |
| `authGetState` | - | `{success, state}` | 获取认证状态 |
| `libraryBootstrap` | - | `{success, snapshot, status}` | 初始化库 |
| `libraryRefresh` | - | `{success, snapshot, error?}` | 刷新数据 |
| `libraryOpenPage` | `{url, pageKey, siteKey}` | `{success, tabId, error?}` | 打开页面 |
| `libraryStatusUpdate` | `{pageKey, siteKey, status, version}` | `{success, syncState, updatedRecord, error?}` | 更新状态 |
| `libraryGetActiveContext` | - | `{success, activeContext}` | 获取活跃上下文 |

---

## 附录 B：类型定义速查

见 `src/types/library.ts` 完整定义。
