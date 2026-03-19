# Commentor AI 扩展 - 产品/站点管理功能设计文档

> 版本: 1.0  
> 日期: 2025-03-19  
> 状态: 设计阶段

---

## 1. 概述

### 1.1 背景

当前扩展有两套独立的数据管理系统：

| 系统 | 用途 | 数据模型 |
|------|------|----------|
| 站点管理 | 用户创建站点，管理关键词，用于生成评论 | `SiteItem` + `KeywordItem` |
| 网页库管理 | 从 Google Sheets 加载网页列表，跟踪处理状态 | `PageRecord` |

### 1.2 新需求

用户需要**矩阵式状态管理**：多个产品各自独立跟踪同一批网页的提交状态。

**场景示例**：
- 网页库中有 100 个网页
- 有 3 个产品（产品 A/B/C），各自要在这 100 个页面提交评论
- 网页库随时增加新页面，增加后所有产品都要有新页面的待办任务
- 随时可以增加新产品（产品 D），新产品自动获得所有现有网页的待办任务
- 需要跟踪每个产品在每个页面的提交状态和评论内容

### 1.3 核心设计原则

1. **单一数据源**：网页库作为唯一的网页数据来源
2. **矩阵式状态**：产品 x 网页的笛卡尔积构成状态空间
3. **延迟初始化**：新产品或新网页自动创建待办状态，无需手动操作
4. **向后兼容**：逐步迁移现有 `SiteItem` 数据到新产品模型

---

## 2. 数据模型设计

### 2.1 WebPage - 网页库基础数据

网页库中的每一个页面，作为单一数据源。

```typescript
export interface WebPage {
  /** 唯一标识，规范化后的 URL */
  pageKey: string;
  
  /** 网站域名，用于分组 */
  siteKey: string;
  
  /** 原始来源 URL */
  sourceUrl: string;
  
  /** 规范化后的 URL（去除跟踪参数） */
  canonicalUrl: string;
  
  /** 页面标题 */
  title: string;
  
  /** 页面元数据（可选） */
  metadata?: {
    description?: string;
    author?: string;
    publishedAt?: string;
    language?: string;
  };
  
  /** 网页库版本号，用于乐观锁 */
  version: number;
  
  /** 最后更新时间 */
  updatedAt: string;
  
  /** 数据状态 */
  dataState: 'active' | 'archived' | 'invalid';
}

/** 
 * 生成 pageKey 和 siteKey 的工具函数
 * 复用现有的 normalizePageKey 和 normalizeSiteKey
 */
export function generateWebPageKeys(url: string): { pageKey: string; siteKey: string } {
  return {
    pageKey: normalizePageKey(url),
    siteKey: normalizeSiteKey(url),
  };
}
```

### 2.2 Product - 产品/站点

替代现有的 `SiteItem`，表示一个产品（品牌/站点/项目）。

```typescript
export interface Product {
  /** 唯一标识，使用 slug 格式 */
  id: string;
  
  /** 产品名称（显示用） */
  name: string;
  
  /** 产品描述（可选） */
  description?: string;
  
  /** 关联的关键词列表 */
  keywords: ProductKeyword[];
  
  /** 产品配置 */
  config: ProductConfig;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 最后更新时间 */
  updatedAt: string;
  
  /** 排序权重 */
  sortOrder: number;
}

/** 产品关键词（扩展自 KeywordItem） */
export interface ProductKeyword {
  /** 关键词文本 */
  keyword: string;
  
  /** 关键词链接 */
  url: string;
  
  /** 是否启用 */
  enabled: boolean;
  
  /** 关键词类型 */
  type: 'brand' | 'product' | 'feature' | 'custom';
  
  /** 使用次数统计 */
  usageCount?: number;
}

/** 产品配置 */
export interface ProductConfig {
  /** 评论生成配置 */
  commentGeneration?: {
    /** 使用的 LLM 设置 ID（继承或自定义） */
    llmSettingsId?: string;
    
    /** 自定义提示词模板 */
    promptTemplate?: string;
    
    /** 评论风格 */
    tone?: 'professional' | 'casual' | 'friendly' | 'technical';
  };
  
  /** 自动提交配置（未来扩展） */
  autoSubmit?: {
    enabled: boolean;
    /** 提交间隔（秒） */
    interval?: number;
  };
}
```

### 2.3 ProductPageStatus - 核心关联表

产品维度下，每个网页的处理状态。这是新架构的核心数据结构。

```typescript
/** 提交状态 */
export type SubmissionStatus = 
  | 'pending'      // 待处理：尚未开始
  | 'processing'   // 处理中：正在生成评论
  | 'ready'        // 就绪：评论已生成，待提交
  | 'submitted'    // 已提交：评论已发布到页面
  | 'skipped'      // 已跳过：用户主动跳过
  | 'failed'       // 失败：生成或提交失败
  | 'invalid';     // 无效：网页不可评论

/** 同步状态 */
export type SyncState = 
  | 'synced'       // 已同步
  | 'pending'      // 待同步
  | 'syncing'      // 同步中
  | 'retrying'     // 重试中
  | 'error';       // 同步错误

/** 
 * 产品-网页状态关联表
 * 每个产品在每个网页上有一条记录
 */
export interface ProductPageStatus {
  /** 复合主键：productId + pageKey */
  id: string;
  
  /** 产品 ID */
  productId: string;
  
  /** 网页标识 */
  pageKey: string;
  
  /** 网站域名 */
  siteKey: string;
  
  /** 提交状态 */
  status: SubmissionStatus;
  
  /** 
   * 生成的评论内容
   * - 生成后存储，支持手动编辑
   */
  comment?: {
    content: string;
    htmlContent?: string;
    generatedAt: string;
    editedAt?: string;
    /** 使用的关键词列表 */
    usedKeywords?: string[];
  };
  
  /** 提交记录 */
  submission?: {
    submittedAt: string;
    submittedBy?: string;
    /** 提交后的评论链接（如果可获取） */
    commentUrl?: string;
    /** 提交方式 */
    method: 'manual' | 'api';
  };
  
  /** 失败记录 */
  failure?: {
    failedAt: string;
    reason: string;
    retryCount: number;
  };
  
  /** 跳过记录 */
  skip?: {
    skippedAt: string;
    reason?: string;
  };
  
  /** 本地版本号（乐观锁） */
  version: number;
  
  /** 本地最后更新时间 */
  updatedAt: string;
  
  /** Google Sheets 同步状态 */
  syncState: SyncState;
  
  /** 最后同步时间 */
  syncedAt?: string;
  
  /** 同步错误信息 */
  syncError?: string;
}

/** 
 * 生成 ProductPageStatus 的 ID
 * 格式：productId + "::" + pageKey
 */
export function generateProductPageStatusId(
  productId: string, 
  pageKey: string
): string {
  return `${productId}::${pageKey}`;
}

/** 
 * 从 ID 解析 productId 和 pageKey
 */
export function parseProductPageStatusId(
  id: string
): { productId: string; pageKey: string } {
  const parts = id.split('::');
  return {
    productId: parts[0],
    pageKey: parts.slice(1).join('::'),
  };
}
```

### 2.4 完整数据关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        数据关系（新架构）                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐         1:N          ┌──────────────────────┐   │
│   │   Product    │──────────────────────│ ProductPageStatus    │   │
│   │  (产品表)     │                      │   (状态关联表)        │   │
│   └──────────────┘                      └──────────────────────┘   │
│          │                                        │                 │
│          │ 1:N                                   N:1               │
│          ▼                                        ▼                 │
│   ┌──────────────┐                      ┌──────────────────────┐   │
│   │ProductKeyword│                      │      WebPage         │   │
│   │  (关键词表)   │                      │    (网页库表)         │   │
│   └──────────────┘                      └──────────────────────┘   │
│                                                                      │
│   关系说明：                                                          │
│   - 每个 Product 可以有多个 ProductPageStatus（一个网页一个状态）        │
│   - 每个 WebPage 可以有多个 ProductPageStatus（一个产品一个状态）        │
│   - Product 和 ProductPageStatus 是 1:N 关系                          │
│   - WebPage 和 ProductPageStatus 是 1:N 关系                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 系统架构图

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Commentor AI 扩展                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         UI 层（Sidepanel）                           │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │ ProductList │  │  WebPage    │  │   Status    │  │  Comment  │  │   │
│  │  │  (产品列表)  │  │   Grid      │  │   Filter    │  │  Editor   │  │   │
│  │  │             │  │ (网页网格)   │  │  (状态筛选)  │  │ (评论编辑) │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      状态管理层（Store）                             │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   │
│  │  │ ProductStore   │  │ WebPageStore   │  │ ProductPageStatusStore │ │   │
│  │  │   (产品状态)    │  │   (网页状态)    │  │    (矩阵状态管理)       │ │   │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     服务层（Services）                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │   │
│  │  │ ProductService│  │WebPageService │  │ProductPageStatusService │ │   │
│  │  └───────────────┘  └───────────────┘  └─────────────────────────┘ │   │
│  │                                                                     │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    GoogleSheetsService                          │ │   │
│  │  │           (Google Sheets API 同步服务)                           │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      存储层（Storage）                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │              browser.storage.local (本地存储)                  │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌────────────────────────┐  │  │   │
│  │  │  │  products   │ │  webPages   │ │ productPageStatuses    │  │  │   │
│  │  │  └─────────────┘ └─────────────┘ └────────────────────────┘  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   外部数据源（Google Sheets）                         │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Spreadsheet: "网页库管理"                                           │   │
│  │  ├── Sheet: "网页列表"     (WebPage 数据)                            │   │
│  │  ├── Sheet: "产品A进度"    (ProductPageStatus for 产品A)             │   │
│  │  ├── Sheet: "产品B进度"    (ProductPageStatus for 产品B)             │   │
│  │  └── Sheet: "产品C进度"    (ProductPageStatus for 产品C)             │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流图

#### 3.2.1 网页库刷新流程

```
用户点击"刷新网页库"
        │
        ▼
┌───────────────┐
│ 检查 Google   │
│ Sheets 连接   │
└───────────────┘
        │
        ▼
┌───────────────┐     读取     ┌─────────────────┐
│ 读取"网页列表" │──────────────▶│  网页数据数组    │
│   Sheet       │              └─────────────────┘
└───────────────┘                      │
        │                              ▼
        │                     ┌─────────────────┐
        │                     │ 数据验证和清洗   │
        │                     └─────────────────┘
        │                              │
        ▼                              ▼
┌───────────────┐              ┌─────────────────┐
│ 更新本地      │              │ 对比现有数据    │
│ webPages      │◀─────────────│ 找出新增/删除   │
│ 存储          │              └─────────────────┘
└───────────────┘                      │
        │                              │
        │                              ▼
        │                     ┌─────────────────┐
        │                     │ 为每个新产品    │
        │                     │ 创建待办状态    │
        │                     │ (延迟初始化)    │
        │                     └─────────────────┘
        │                              │
        ▼                              ▼
┌───────────────┐              ┌─────────────────┐
│ 触发 UI       │              │ 更新           │
│ 刷新事件      │◀─────────────│ productPage-  │
│               │              │ Statuses 存储  │
└───────────────┘              └─────────────────┘
```

#### 3.2.2 新产品创建流程

```
用户创建新产品
        │
        ▼
┌───────────────┐
│ 填写产品信息  │
│ - 名称        │
│ - 关键词      │
│ - 配置        │
└───────────────┘
        │
        ▼
┌───────────────┐
│ 保存到本地    │
│ products 存储 │
└───────────────┘
        │
        ▼
┌───────────────────────────────┐
│ 为新产品创建所有网页的待办状态 │
│ (延迟初始化)                  │
├───────────────────────────────┤
│ 遍历现有所有 WebPage          │
│   创建 ProductPageStatus      │
│   - status: 'pending'         │
│   - version: 1                │
│   - syncState: 'pending'      │
└───────────────────────────────┘
        │
        ▼
┌───────────────┐
│ 同步到 Google │
│ Sheets        │
│ (异步后台)    │
└───────────────┘
        │
        ▼
┌───────────────┐
│ UI 自动显示   │
│ 新产品和任务  │
└───────────────┘
```

#### 3.2.3 状态更新流程

```
用户在 UI 更新状态
(生成评论/标记提交/跳过)
        │
        ▼
┌───────────────┐
│ 更新本地状态  │
│ - status      │
│ - comment     │
│ - version++   │
│ - updatedAt   │
└───────────────┘
        │
        ▼
┌───────────────┐
│ 加入同步队列  │
│ syncState:    │
│ 'pending'     │
└───────────────┘
        │
        ▼
┌───────────────┐
│ 触发即时 UI   │
│ 反馈          │
└───────────────┘
        │
        ▼
┌───────────────┐      成功      ┌───────────────┐
│ 后台同步到    │───────────────▶│ syncState:    │
│ Google Sheets │                │ 'synced'      │
│               │◀───────────────│ syncedAt: now │
└───────────────┘      失败      └───────────────┘
        │
        ▼
┌───────────────┐
│ 重试机制      │
│ (指数退避)    │
└───────────────┘
```

---

## 4. 核心工作流程

### 4.1 网页库刷新时创建待办

当用户刷新网页库时，系统需要为所有产品创建新增网页的待办状态。

```typescript
/**
 * 刷新网页库后为所有产品创建待办状态
 */
async function refreshWebPagesAndInitializeStatuses(
  newWebPages: WebPage[]
): Promise<void> {
  // 1. 获取所有现有产品和现有网页
  const products = await productStore.getAll();
  const existingPages = await webPageStore.getAll();
  const existingPageKeys = new Set(existingPages.map(p => p.pageKey));
  
  // 2. 找出新增的网页
  const addedPages = newWebPages.filter(
    page => !existingPageKeys.has(page.pageKey)
  );
  
  if (addedPages.length === 0) {
    return; // 没有新网页
  }
  
  // 3. 为每个产品在每个新网页上创建待办状态
  const newStatuses: ProductPageStatus[] = [];
  
  for (const product of products) {
    for (const page of addedPages) {
      const status: ProductPageStatus = {
        id: generateProductPageStatusId(product.id, page.pageKey),
        productId: product.id,
        pageKey: page.pageKey,
        siteKey: page.siteKey,
        status: 'pending',
        version: 1,
        updatedAt: new Date().toISOString(),
        syncState: 'pending', // 需要同步到 Sheets
      };
      newStatuses.push(status);
    }
  }
  
  // 4. 批量保存新状态
  await productPageStatusStore.addMany(newStatuses);
  
  // 5. 更新网页库
  await webPageStore.setMany(newWebPages);
  
  // 6. 触发后台同步（异步）
  syncService.scheduleSync();
}
```

### 4.2 新增产品时初始化所有网页的待办

当用户创建新产品时，系统需要为该产品在所有现有网页上创建待办状态。

```typescript
/**
 * 创建新产品后为该产品初始化所有网页的待办状态
 */
async function createProductAndInitializeStatuses(
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Product> {
  // 1. 创建产品
  const newProduct: Product = {
    ...product,
    id: generateProductId(), // 生成 slug 格式的 ID
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: await productStore.getNextSortOrder(),
  };
  
  await productStore.add(newProduct);
  
  // 2. 获取所有现有网页
  const allPages = await webPageStore.getAll();
  
  // 3. 为该产品在所有网页上创建待办状态
  const newStatuses: ProductPageStatus[] = allPages.map(page => ({
    id: generateProductPageStatusId(newProduct.id, page.pageKey),
    productId: newProduct.id,
    pageKey: page.pageKey,
    siteKey: page.siteKey,
    status: 'pending',
    version: 1,
    updatedAt: new Date().toISOString(),
    syncState: 'pending',
  }));
  
  // 4. 批量保存状态
  if (newStatuses.length > 0) {
    await productPageStatusStore.addMany(newStatuses);
  }
  
  // 5. 触发后台同步（异步）
  syncService.scheduleSync();
  
  return newProduct;
}
```

### 4.3 状态更新和同步流程

```typescript
/**
 * 更新状态并触发同步
 */
async function updateStatus(
  productId: string,
  pageKey: string,
  update: Partial<ProductPageStatus>
): Promise<ProductPageStatus> {
  const id = generateProductPageStatusId(productId, pageKey);
  
  // 1. 读取现有状态
  const existing = await productPageStatusStore.get(id);
  if (!existing) {
    throw new Error(`Status not found: ${id}`);
  }
  
  // 2. 版本检查（乐观锁）
  if (update.version && update.version !== existing.version) {
    throw new Error('Version conflict, please refresh');
  }
  
  // 3. 更新状态
  const updated: ProductPageStatus = {
    ...existing,
    ...update,
    id,
    productId,
    pageKey,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
    syncState: 'pending', // 标记为待同步
  };
  
  // 4. 保存到本地
  await productPageStatusStore.set(updated);
  
  // 5. 触发后台同步
  syncService.scheduleSync();
  
  return updated;
}
```

---

## 5. UI 设计

### 5.1 产品维度视图

当前只实现产品维度视图，后续可扩展网页维度视图。

#### 5.1.1 主界面布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Commentor AI                                                    [设置] [?]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  产品选择器                    [+ 新建产品]  [刷新网页库]            │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                       │   │
│  │  │产品A   │ │产品B   │ │产品C   │ │+      │                       │   │
│  │  │(98/100)│ │(45/100)│ │(12/100)│ │       │                       │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  当前产品：产品A                                          [编辑产品] │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  筛选： [全部 ▼] [搜索网页...     ]     [待办: 2] [已提交: 98]       │   │
│  │                                                                     │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │  □ 全选  [生成评论] [标记提交] [跳过] [批量操作 ▼]             │ │   │
│  │  ├────────────────────────────────────────────────────────────────┤ │   │
│  │  │ □ │ 网页标题              │ 网站      │ 状态    │ 操作        │ │   │
│  │  ├───┼───────────────────────┼───────────┼─────────┼─────────────┤ │   │
│  │  │ □ │ 如何学习 React        │ github.io │ ✓ 已提交 │ [查看评论]  │ │   │
│  │  │ □ │ TypeScript 最佳实践   │ dev.to    │ ✓ 已提交 │ [查看评论]  │ │   │
│  │  │ □ │ 前端性能优化指南      │ medium    │ ⏳ 就绪  │ [编辑][提交]│ │   │
│  │  │ □ │ JavaScript 异步编程   │ blog.com  │ 🔄 处理中│ [取消]      │ │   │
│  │  │ □ │ CSS Grid 布局详解     │ css-tricks│ ○ 待办   │ [生成评论]  │ │   │
│  │  ├───┴───────────────────────┴───────────┴─────────┴─────────────┤ │   │
│  │  │                    加载更多...                                 │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  状态说明：○ 待办  🔄 处理中  ⏳ 就绪  ✓ 已提交  ⏭ 已跳过  ✕ 失败        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 5.1.2 产品切换器

产品切换器采用标签页形式，显示每个产品的完成进度。

```typescript
interface ProductSelectorProps {
  products: Product[];
  activeProductId: string;
  statusCounts: Record<string, {
    total: number;
    pending: number;
    processing: number;
    ready: number;
    submitted: number;
    skipped: number;
    failed: number;
  }>;
  onSelect: (productId: string) => void;
  onCreate: () => void;
}
```

#### 5.1.3 状态筛选器

```typescript
interface StatusFilterProps {
  selectedStatuses: SubmissionStatus[];
  onChange: (statuses: SubmissionStatus[]) => void;
  counts: Record<SubmissionStatus, number>;
}

// 筛选选项
const filterOptions: { value: SubmissionStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待办' },
  { value: 'processing', label: '处理中' },
  { value: 'ready', label: '就绪' },
  { value: 'submitted', label: '已提交' },
  { value: 'skipped', label: '已跳过' },
  { value: 'failed', label: '失败' },
];
```

#### 5.1.4 评论生成弹窗

```
┌─────────────────────────────────────────────────────────────┐
│  生成评论                                       [×]         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  网页：如何学习 React - 完整指南                            │
│  产品：产品A                                                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 关键词提示：                                          │ │
│  │ • React (https://react.dev)                           │ │
│  │ • 组件库 (https://components.com)                     │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  [自动生成评论]  [复制到剪贴板]  [插入关键词]                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 生成的评论内容：                                      │ │
│  │                                                       │ │
│  │ 这篇文章写得很好！对于学习 React 的新手来说非常有帮助。│ │
│  │ 特别是关于 Hooks 的讲解，让我对 useState 和 useEffect │ │
│  │ 有了更深入的理解。                                    │ │
│  │                                                       │ │
│  │ 如果你正在寻找高质量的 React 组件库，可以看看我们的    │ │
│  │ [组件库](https://components.com)，提供了丰富的预置组件。│ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  [取消]                                    [保存并标记就绪] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Google Sheets Schema

### 6.1 Spreadsheet 结构

```
Spreadsheet: "Commentor_网页库管理"
├── Sheet: "_meta"           (元数据：版本、说明)
├── Sheet: "网页列表"         (WebPage 数据)
├── Sheet: "产品列表"         (Product 元数据)
├── Sheet: "产品A进度"        (ProductPageStatus for 产品A)
├── Sheet: "产品B进度"        (ProductPageStatus for 产品B)
├── Sheet: "产品C进度"        (ProductPageStatus for 产品C)
└── Sheet: "_sync_log"       (同步日志，可选)
```

### 6.2 "网页列表" Sheet

存储网页库的基础数据。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageKey | string | 是 | 唯一标识，规范化后的 URL |
| siteKey | string | 是 | 网站域名 |
| sourceUrl | string | 是 | 原始来源 URL |
| canonicalUrl | string | 是 | 规范化后的 URL |
| title | string | 是 | 页面标题 |
| description | string | 否 | 页面描述 |
| author | string | 否 | 作者 |
| publishedAt | string | 否 | 发布时间 (ISO 8601) |
| language | string | 否 | 页面语言 |
| version | number | 是 | 版本号，用于乐观锁 |
| dataState | string | 是 | active / archived / invalid |
| updatedAt | string | 是 | 最后更新时间 (ISO 8601) |
| updatedBy | string | 否 | 最后更新者 |

**表头示例**：
```
pageKey | siteKey | sourceUrl | canonicalUrl | title | description | author | publishedAt | language | version | dataState | updatedAt | updatedBy
```

### 6.3 "产品列表" Sheet

存储产品的基础元数据（不含关键词配置，关键词配置存储在本地）。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 产品唯一标识（slug 格式） |
| name | string | 是 | 产品名称 |
| description | string | 否 | 产品描述 |
| createdAt | string | 是 | 创建时间 (ISO 8601) |
| updatedAt | string | 是 | 最后更新时间 (ISO 8601) |
| sortOrder | number | 是 | 排序权重 |
| config_json | string | 否 | 产品配置的 JSON 字符串 |

**表头示例**：
```
id | name | description | createdAt | updatedAt | sortOrder | config_json
```

### 6.4 "产品X进度" Sheet（每个产品一个 Sheet）

存储该产品在每个网页上的处理状态。

Sheet 名称格式：`产品{id}进度`，例如 `产品product-a进度`

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 复合标识：productId + "::" + pageKey |
| productId | string | 是 | 产品 ID |
| pageKey | string | 是 | 网页标识 |
| siteKey | string | 是 | 网站域名 |
| status | string | 是 | pending / processing / ready / submitted / skipped / failed / invalid |
| comment_content | string | 否 | 生成的评论内容（纯文本） |
| comment_html | string | 否 | 评论的 HTML 格式 |
| comment_generatedAt | string | 否 | 评论生成时间 |
| comment_editedAt | string | 否 | 评论编辑时间 |
| comment_usedKeywords | string | 否 | 使用的关键词列表（JSON 数组） |
| submission_submittedAt | string | 否 | 提交时间 |
| submission_submittedBy | string | 否 | 提交者 |
| submission_commentUrl | string | 否 | 提交后的评论链接 |
| submission_method | string | 否 | manual / api |
| failure_failedAt | string | 否 | 失败时间 |
| failure_reason | string | 否 | 失败原因 |
| failure_retryCount | number | 否 | 重试次数 |
| skip_skippedAt | string | 否 | 跳过时间 |
| skip_reason | string | 否 | 跳过原因 |
| version | number | 是 | 本地版本号 |
| updatedAt | string | 是 | 本地最后更新时间 |
| syncedAt | string | 否 | 最后同步时间 |

**表头示例**：
```
id | productId | pageKey | siteKey | status | comment_content | comment_html | comment_generatedAt | comment_editedAt | comment_usedKeywords | submission_submittedAt | submission_submittedBy | submission_commentUrl | submission_method | failure_failedAt | failure_reason | failure_retryCount | skip_skippedAt | skip_reason | version | updatedAt | syncedAt
```

### 6.5 "_meta" Sheet（元数据）

存储 Spreadsheet 的元数据。

| key | value | 说明 |
|-----|-------|------|
| version | 1.0 | 数据格式版本 |
| createdAt | 2025-03-19T00:00:00Z | 创建时间 |
| description | Commentor AI 网页库管理 | 说明 |

---

## 7. 存储管理

### 7.1 browser.storage.local Key 设计

```typescript
/**
 * 产品管理相关的 storage keys
 */
export const ProductStorageKeys = {
  // ===== 核心数据 =====
  
  /** 产品列表 */
  PRODUCTS: 'products',
  
  /** 网页库列表 */
  WEB_PAGES: 'webPages',
  
  /** 产品-网页状态关联表（按产品分片存储） */
  PRODUCT_PAGE_STATUSES: 'productPageStatuses',
  
  // ===== 配置数据 =====
  
  /** 数据源配置 */
  DATASOURCE_CONFIG: 'datasourceConfig',
  
  /** 认证状态 */
  AUTH_STATE: 'authState',
  
  // ===== 同步相关 =====
  
  /** 同步队列 */
  SYNC_QUEUE: 'syncQueue',
  
  /** 最后同步时间 */
  LAST_SYNC_AT: 'lastSyncAt',
  
  /** 同步错误日志 */
  SYNC_ERRORS: 'syncErrors',
  
  // ===== UI 状态 =====
  
  /** 当前选中的产品 ID */
  ACTIVE_PRODUCT_ID: 'activeProductId',
  
  /** 当前筛选条件 */
  ACTIVE_FILTERS: 'activeFilters',
  
  // ===== 迁移相关 =====
  
  /** 数据迁移状态 */
  MIGRATION_STATE: 'migrationState',
  
  /** 旧版站点数据（迁移后保留） */
  LEGACY_SITES: 'legacySites',
} as const;

/**
 * Storage 数据结构定义
 */
export interface ProductManagementStorage {
  // 产品列表
  [ProductStorageKeys.PRODUCTS]: Product[];
  
  // 网页库列表
  [ProductStorageKeys.WEB_PAGES]: WebPage[];
  
  // 产品-网页状态关联表（使用对象格式便于快速查找）
  [ProductStorageKeys.PRODUCT_PAGE_STATUSES]: {
    /** key: status.id, value: ProductPageStatus */
    [id: string]: ProductPageStatus;
  };
  
  // 数据源配置
  [ProductStorageKeys.DATASOURCE_CONFIG]?: DatasourceConfig;
  
  // 认证状态
  [ProductStorageKeys.AUTH_STATE]?: AuthState;
  
  // 同步队列
  [ProductStorageKeys.SYNC_QUEUE]?: SyncQueueItem[];
  
  // 最后同步时间
  [ProductStorageKeys.LAST_SYNC_AT]?: string;
  
  // 同步错误日志
  [ProductStorageKeys.SYNC_ERRORS]?: SyncError[];
  
  // 当前选中的产品 ID
  [ProductStorageKeys.ACTIVE_PRODUCT_ID]?: string;
  
  // 当前筛选条件
  [ProductStorageKeys.ACTIVE_FILTERS]?: {
    statuses?: SubmissionStatus[];
    searchQuery?: string;
    siteKey?: string;
  };
  
  // 数据迁移状态
  [ProductStorageKeys.MIGRATION_STATE]?: {
    fromVersion: number;
    toVersion: number;
    completedAt?: string;
    errors?: string[];
  };
  
  // 旧版站点数据（迁移后保留，用于回滚）
  [ProductStorageKeys.LEGACY_SITES]?: SiteItem[];
}
```

### 7.2 数据分片策略

考虑到 `ProductPageStatus` 的数量可能很大（产品数 x 网页数），需要合理设计存储策略。

```typescript
/**
 * 获取单个状态
 */
async function getStatus(
  productId: string, 
  pageKey: string
): Promise<ProductPageStatus | null> {
  const id = generateProductPageStatusId(productId, pageKey);
  const result = await browser.storage.local.get(ProductStorageKeys.PRODUCT_PAGE_STATUSES);
  const statuses = result[ProductStorageKeys.PRODUCT_PAGE_STATUSES] || {};
  return statuses[id] || null;
}

/**
 * 批量获取产品的所有状态
 */
async function getStatusesByProduct(
  productId: string
): Promise<ProductPageStatus[]> {
  const result = await browser.storage.local.get(ProductStorageKeys.PRODUCT_PAGE_STATUSES);
  const statuses = result[ProductStorageKeys.PRODUCT_PAGE_STATUSES] || {};
  
  return Object.values(statuses).filter(
    (status: ProductPageStatus) => status.productId === productId
  );
}

/**
 * 批量保存状态
 * 注意：browser.storage.local 有 8KB per item 的限制
 * 如果单个产品状态过多，需要考虑分片存储
 */
async function saveStatuses(
  statuses: ProductPageStatus[]
): Promise<void> {
  const result = await browser.storage.local.get(ProductStorageKeys.PRODUCT_PAGE_STATUSES);
  const existing = result[ProductStorageKeys.PRODUCT_PAGE_STATUSES] || {};
  
  const updated = {
    ...existing,
    ...Object.fromEntries(statuses.map(s => [s.id, s])),
  };
  
  await browser.storage.local.set({
    [ProductStorageKeys.PRODUCT_PAGE_STATUSES]: updated,
  });
}
```

### 7.3 分片存储（大规模数据）

如果单个产品的状态数量超过存储限制（约 1000 条以上），需要分片存储。

```typescript
/**
 * 分片存储的 keys
 */
export const ShardedStorageKeys = {
  /** 获取产品状态分片的 key */
  productStatusesShard: (productId: string, shardIndex: number) => 
    `product:${productId}:statuses:${shardIndex}`,
  
  /** 获取产品状态分片元数据的 key */
  productStatusesMeta: (productId: string) => 
    `product:${productId}:statuses:meta`,
};

interface StatusShardMeta {
  productId: string;
  totalCount: number;
  shardCount: number;
  shards: Array<{
    index: number;
    key: string;
    count: number;
    updatedAt: string;
  }>;
}
```

---

## 8. 消息协议（Background Script）

### 8.1 新增消息 Action 列表

```typescript
/**
 * 产品管理相关的消息类型
 */
export type ProductManagementMessage =
  // ===== 产品管理 =====
  | { action: 'getProducts' }
  | { action: 'getProduct'; productId: string }
  | { action: 'createProduct'; product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> }
  | { action: 'updateProduct'; productId: string; updates: Partial<Product> }
  | { action: 'deleteProduct'; productId: string }
  | { action: 'reorderProducts'; productIds: string[] }
  
  // ===== 网页库管理 =====
  | { action: 'getWebPages'; filters?: WebPageFilters }
  | { action: 'refreshWebPages' }
  | { action: 'archiveWebPage'; pageKey: string }
  | { action: 'unarchiveWebPage'; pageKey: string }
  
  // ===== 状态管理 =====
  | { action: 'getProductPageStatuses'; productId: string; filters?: StatusFilters }
  | { action: 'getProductPageStatus'; productId: string; pageKey: string }
  | { action: 'updateProductPageStatus'; 
      productId: string; 
      pageKey: string; 
      updates: Partial<ProductPageStatus> }
  | { action: 'batchUpdateProductPageStatuses'; 
      items: Array<{ productId: string; pageKey: string; updates: Partial<ProductPageStatus> }> }
  | { action: 'generateComment'; 
      productId: string; 
      pageKey: string; 
      options?: CommentGenerationOptions }
  | { action: 'submitComment'; 
      productId: string; 
      pageKey: string; 
      comment: string }
  
  // ===== 同步管理 =====
  | { action: 'syncWithSheets'; options?: SyncOptions }
  | { action: 'getSyncStatus' }
  | { action: 'forceSync'; productId?: string }
  
  // ===== 数据迁移 =====
  | { action: 'migrateFromLegacySites' }
  | { action: 'getMigrationStatus' };

/**
 * 消息响应类型
 */
export type ProductManagementResponse =
  | { success: true; data: unknown }
  | { success: false; error: string; code?: string };

/**
 * 筛选条件类型
 */
interface WebPageFilters {
  siteKey?: string;
  dataState?: WebPage['dataState'];
  searchQuery?: string;
}

interface StatusFilters {
  statuses?: SubmissionStatus[];
  siteKey?: string;
  searchQuery?: string;
}

interface CommentGenerationOptions {
  useCustomPrompt?: boolean;
  customPrompt?: string;
  temperature?: number;
}

interface SyncOptions {
  direction?: 'push' | 'pull' | 'bidirectional';
  productId?: string;
  force?: boolean;
}
```

### 8.2 消息处理实现示例

```typescript
// entrypoints/background.ts

import { ProductStorageKeys } from '@/types/product-management';

type Message = { action: string } & Record<string, unknown>;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: Message) => {
    const { action, ...params } = message;
    
    try {
      switch (action) {
        // ===== 产品管理 =====
        case 'getProducts': {
          const products = await getProducts();
          return { success: true, data: products };
        }
        
        case 'getProduct': {
          const { productId } = params as { productId: string };
          const product = await getProduct(productId);
          return { success: true, data: product };
        }
        
        case 'createProduct': {
          const { product } = params as { product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> };
          const newProduct = await createProductAndInitializeStatuses(product);
          return { success: true, data: newProduct };
        }
        
        case 'updateProduct': {
          const { productId, updates } = params as { productId: string; updates: Partial<Product> };
          const updated = await updateProduct(productId, updates);
          return { success: true, data: updated };
        }
        
        case 'deleteProduct': {
          const { productId } = params as { productId: string };
          await deleteProduct(productId);
          return { success: true, data: null };
        }
        
        // ===== 网页库管理 =====
        case 'getWebPages': {
          const { filters } = params as { filters?: WebPageFilters };
          const pages = await getWebPages(filters);
          return { success: true, data: pages };
        }
        
        case 'refreshWebPages': {
          const result = await refreshWebPagesFromSheets();
          return { success: true, data: result };
        }
        
        // ===== 状态管理 =====
        case 'getProductPageStatuses': {
          const { productId, filters } = params as { productId: string; filters?: StatusFilters };
          const statuses = await getProductPageStatuses(productId, filters);
          return { success: true, data: statuses };
        }
        
        case 'getProductPageStatus': {
          const { productId, pageKey } = params as { productId: string; pageKey: string };
          const status = await getProductPageStatus(productId, pageKey);
          return { success: true, data: status };
        }
        
        case 'updateProductPageStatus': {
          const { productId, pageKey, updates } = params as { 
            productId: string; 
            pageKey: string; 
            updates: Partial<ProductPageStatus> 
          };
          const updated = await updateStatus(productId, pageKey, updates);
          return { success: true, data: updated };
        }
        
        case 'batchUpdateProductPageStatuses': {
          const { items } = params as { 
            items: Array<{ productId: string; pageKey: string; updates: Partial<ProductPageStatus> }> 
          };
          const results = await Promise.all(
            items.map(item => updateStatus(item.productId, item.pageKey, item.updates))
          );
          return { success: true, data: results };
        }
        
        case 'generateComment': {
          const { productId, pageKey, options } = params as { 
            productId: string; 
            pageKey: string; 
            options?: CommentGenerationOptions 
          };
          const result = await generateComment(productId, pageKey, options);
          return { success: true, data: result };
        }
        
        // ===== 同步管理 =====
        case 'syncWithSheets': {
          const { options } = params as { options?: SyncOptions };
          const result = await syncService.sync(options);
          return { success: true, data: result };
        }
        
        case 'getSyncStatus': {
          const status = syncService.getStatus();
          return { success: true, data: status };
        }
        
        case 'forceSync': {
          const { productId } = params as { productId?: string };
          const result = await syncService.forceSync(productId);
          return { success: true, data: result };
        }
        
        // ===== 数据迁移 =====
        case 'migrateFromLegacySites': {
          const result = await migrateFromLegacySites();
          return { success: true, data: result };
        }
        
        case 'getMigrationStatus': {
          const status = await getMigrationStatus();
          return { success: true, data: status };
        }
        
        default:
          return { success: false, error: `Unknown action: ${action}`, code: 'UNKNOWN_ACTION' };
      }
    } catch (error) {
      console.error(`Error handling action ${action}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        code: 'INTERNAL_ERROR'
      };
    }
  });
});
```

---

## 9. 数据迁移策略

### 9.1 从 SiteItem 迁移到 Product

现有的 `SiteItem` 数据需要迁移到新的 `Product` 模型。

```typescript
/**
 * 迁移策略
 */
interface MigrationStrategy {
  /**
   * 迁移步骤：
   * 1. 读取现有的 sites 数据
   * 2. 将每个 SiteItem 转换为 Product
   * 3. 保留原始数据到 LEGACY_SITES（用于回滚）
   * 4. 保存新产品数据
   * 5. 标记迁移完成
   */
}

/**
 * 执行迁移
 */
async function migrateFromLegacySites(): Promise<MigrationResult> {
  // 1. 检查是否已迁移
  const migrationState = await getMigrationState();
  if (migrationState?.completedAt) {
    return { success: true, skipped: true, message: 'Already migrated' };
  }
  
  // 2. 读取现有的 sites 数据
  const result = await browser.storage.local.get('sites');
  const legacySites: SiteItem[] = result['sites'] || [];
  
  if (legacySites.length === 0) {
    return { success: true, skipped: true, message: 'No legacy sites to migrate' };
  }
  
  // 3. 转换为新产品
  const products: Product[] = legacySites.map((site, index) => ({
    id: generateProductIdFromSite(site),
    name: site.name,
    description: `从站点 "${site.name}" 迁移`,
    keywords: site.keywords.map(k => ({
      ...k,
      type: 'custom',
    })),
    config: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: index,
  }));
  
  // 4. 保存数据
  await browser.storage.local.set({
    [ProductStorageKeys.PRODUCTS]: products,
    [ProductStorageKeys.LEGACY_SITES]: legacySites,
    [ProductStorageKeys.MIGRATION_STATE]: {
      fromVersion: 1,
      toVersion: 2,
      completedAt: new Date().toISOString(),
    },
  });
  
  // 5. 删除旧数据（可选，保留一段时间以确保安全）
  // await browser.storage.local.remove('sites');
  
  return {
    success: true,
    migratedCount: products.length,
    products: products.map(p => ({ id: p.id, name: p.name })),
  };
}

function generateProductIdFromSite(site: SiteItem): string {
  // 使用站点名称生成 slug
  const baseSlug = site.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  // 添加部分 ID 以确保唯一性
  return `${baseSlug}-${site.id.slice(0, 8)}`;
}
```

---

## 10. 开发计划

### Phase 1: 基础架构（Week 1）

- [ ] 定义新的类型系统（Product, WebPage, ProductPageStatus）
- [ ] 实现存储层（ProductStorageKeys, storage utilities）
- [ ] 实现数据迁移脚本
- [ ] 单元测试覆盖

### Phase 2: 核心服务（Week 2）

- [ ] 实现 ProductService
- [ ] 实现 WebPageService（含 Google Sheets 集成）
- [ ] 实现 ProductPageStatusService
- [ ] 实现 SyncService
- [ ] Background script 消息处理

### Phase 3: UI 实现（Week 3）

- [ ] 产品选择器组件
- [ ] 网页网格列表组件
- [ ] 状态筛选和操作组件
- [ ] 评论生成弹窗
- [ ] 产品编辑界面

### Phase 4: 集成测试（Week 4）

- [ ] 端到端测试
- [ ] 性能优化
- [ ] Bug 修复
- [ ] 文档完善

---

## 11. 附录

### 11.1 类型定义完整文件

```typescript
// src/types/product-management.ts

import type { KeywordItem } from './keyword';
import type { DatasourceConfig, AuthState } from './library';

// ===== 核心数据模型 =====

export interface Product {
  id: string;
  name: string;
  description?: string;
  keywords: ProductKeyword[];
  config: ProductConfig;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
}

export interface ProductKeyword {
  keyword: string;
  url: string;
  enabled: boolean;
  type: 'brand' | 'product' | 'feature' | 'custom';
  usageCount?: number;
}

export interface ProductConfig {
  commentGeneration?: {
    llmSettingsId?: string;
    promptTemplate?: string;
    tone?: 'professional' | 'casual' | 'friendly' | 'technical';
  };
  autoSubmit?: {
    enabled: boolean;
    interval?: number;
  };
}

export interface WebPage {
  pageKey: string;
  siteKey: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  metadata?: {
    description?: string;
    author?: string;
    publishedAt?: string;
    language?: string;
  };
  version: number;
  updatedAt: string;
  dataState: 'active' | 'archived' | 'invalid';
}

export type SubmissionStatus = 
  | 'pending'
  | 'processing'
  | 'ready'
  | 'submitted'
  | 'skipped'
  | 'failed'
  | 'invalid';

export type SyncState = 
  | 'synced'
  | 'pending'
  | 'syncing'
  | 'retrying'
  | 'error';

export interface ProductPageStatus {
  id: string;
  productId: string;
  pageKey: string;
  siteKey: string;
  status: SubmissionStatus;
  comment?: {
    content: string;
    htmlContent?: string;
    generatedAt: string;
    editedAt?: string;
    usedKeywords?: string[];
  };
  submission?: {
    submittedAt: string;
    submittedBy?: string;
    commentUrl?: string;
    method: 'manual' | 'api';
  };
  failure?: {
    failedAt: string;
    reason: string;
    retryCount: number;
  };
  skip?: {
    skippedAt: string;
    reason?: string;
  };
  version: number;
  updatedAt: string;
  syncState: SyncState;
  syncedAt?: string;
  syncError?: string;
}

// ===== 工具函数 =====

export function generateProductPageStatusId(
  productId: string, 
  pageKey: string
): string {
  return `${productId}::${pageKey}`;
}

export function parseProductPageStatusId(
  id: string
): { productId: string; pageKey: string } {
  const parts = id.split('::');
  return {
    productId: parts[0],
    pageKey: parts.slice(1).join('::'),
  };
}

export function generateProductId(): string {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ===== 存储 Keys =====

export const ProductStorageKeys = {
  PRODUCTS: 'products',
  WEB_PAGES: 'webPages',
  PRODUCT_PAGE_STATUSES: 'productPageStatuses',
  DATASOURCE_CONFIG: 'datasourceConfig',
  AUTH_STATE: 'authState',
  SYNC_QUEUE: 'syncQueue',
  LAST_SYNC_AT: 'lastSyncAt',
  SYNC_ERRORS: 'syncErrors',
  ACTIVE_PRODUCT_ID: 'activeProductId',
  ACTIVE_FILTERS: 'activeFilters',
  MIGRATION_STATE: 'migrationState',
  LEGACY_SITES: 'legacySites',
} as const;

// ===== 消息类型 =====

export interface WebPageFilters {
  siteKey?: string;
  dataState?: WebPage['dataState'];
  searchQuery?: string;
}

export interface StatusFilters {
  statuses?: SubmissionStatus[];
  siteKey?: string;
  searchQuery?: string;
}

export interface CommentGenerationOptions {
  useCustomPrompt?: boolean;
  customPrompt?: string;
  temperature?: number;
}

export interface SyncOptions {
  direction?: 'push' | 'pull' | 'bidirectional';
  productId?: string;
  force?: boolean;
}

export interface SyncQueueItem {
  id: string;
  productId: string;
  pageKey: string;
  operation: 'create' | 'update' | 'delete';
  data: Partial<ProductPageStatus>;
  enqueuedAt: string;
  retryCount: number;
  lastError?: string;
}

export interface SyncError {
  timestamp: string;
  productId?: string;
  pageKey?: string;
  operation: string;
  error: string;
}

export interface MigrationResult {
  success: boolean;
  skipped?: boolean;
  message?: string;
  migratedCount?: number;
  products?: Array<{ id: string; name: string }>;
}
```

### 11.2 命名规范

| 概念 | 命名规范 | 示例 |
|------|----------|------|
| Product ID | 小写 slug + 随机后缀 | `product-a-x7k9m2p` |
| Page Key | 规范化 URL | `https://example.com/article/slug` |
| Sheet 名称 | `产品{id}进度` | `产品product-a进度` |
| Storage Key | 大写下划线 | `PRODUCT_PAGE_STATUSES` |
| 状态 ID | productId + "::" + pageKey | `product-a::https://example.com` |

### 11.3 错误码定义

| 错误码 | 说明 |
|--------|------|
| UNKNOWN_ACTION | 未知的消息 action |
| INTERNAL_ERROR | 内部错误 |
| PRODUCT_NOT_FOUND | 产品不存在 |
| PAGE_NOT_FOUND | 网页不存在 |
| STATUS_NOT_FOUND | 状态记录不存在 |
| VERSION_CONFLICT | 版本冲突（乐观锁失败） |
| SYNC_ERROR | 同步错误 |
| AUTH_ERROR | 认证错误 |
| NETWORK_ERROR | 网络错误 |
| VALIDATION_ERROR | 数据验证错误 |

---

## 12. 总结

本文档描述了 Commentor AI 扩展的新"产品/站点管理"功能架构，主要解决以下问题：

1. **矩阵式状态管理**：支持多个产品独立跟踪同一批网页的提交状态
2. **延迟初始化**：新产品或新网页自动创建待办状态，无需手动操作
3. **Google Sheets 同步**：与现有数据源无缝集成，支持双向同步
4. **向后兼容**：逐步迁移现有 SiteItem 数据，不影响现有用户

核心创新点：

- `ProductPageStatus` 关联表：产品 x 网页的笛卡尔积状态管理
- 分片存储策略：支持大规模数据存储
- 增量同步机制：高效的 Google Sheets 同步
- 乐观锁版本控制：避免并发冲突

下一步工作：

1. 实现 Phase 1 的基础架构
2. 编写单元测试
3. 逐步迭代 UI 功能
4. 进行端到端测试
