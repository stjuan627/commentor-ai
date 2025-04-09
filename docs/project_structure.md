# Commentor.ai 项目结构文档

## 项目概述

Commentor.ai 是一个浏览器扩展，用于读取网页内容，发送给大模型（LLM），并获取评论。该项目基于 WXT（Web Extension Tools）构建，使用 React 作为 UI 框架。

## 技术栈

- **框架**: WXT (Web Extension Tools)
- **UI 库**: React
- **样式**: CSS (包括原生样式和部分 Tailwind CSS)
- **语言**: TypeScript
- **构建工具**: Vite (通过 WXT)
- **存储**: Browser Storage API

## 项目结构

```
commentor.ai/
├── docs/                         # 文档目录
│   ├── frd/                      # 功能需求文档
│   │   └── feature_llm_settings.md  # LLM 设置功能需求
│   └── project_structure.md      # 项目结构文档（本文档）
│
├── entrypoints/                  # 扩展入口点
│   ├── background.ts             # 后台脚本
│   ├── content/                  # 内容脚本
│   │   └── index.ts              # 内容提取器
│   ├── options/                  # 选项页面
│   │   ├── index.html            # 选项页 HTML
│   │   ├── main.tsx              # 选项页入口
│   │   ├── App.tsx               # 选项页主组件
│   │   └── style.css             # 选项页样式
│   └── sidepanel/                # 侧边栏（计划中）
│       ├── index.html            # 侧边栏 HTML
│       ├── main.tsx              # 侧边栏入口
│       ├── App.tsx               # 侧边栏主组件
│       └── style.css             # 侧边栏样式
│
├── src/                          # 源代码
│   ├── components/               # 共享组件
│   ├── services/                 # 服务层
│   │   └── llm/                  # LLM 服务
│   │       ├── index.ts          # LLM 服务入口
│   │       ├── openai.ts         # OpenAI 服务
│   │       └── gemini.ts         # Gemini 服务
│   ├── types/                    # 类型定义
│   │   └── global.d.ts           # 全局类型声明
│   └── utils/                    # 工具函数
│
├── public/                       # 静态资源
│   └── icon/                     # 图标资源
│
├── .output/                      # 构建输出目录
│   └── chrome-mv3-dev/           # Chrome MV3 开发版
│
├── wxt.config.ts                 # WXT 配置文件
├── tsconfig.json                 # TypeScript 配置
├── package.json                  # 项目依赖
├── postcss.config.cjs            # PostCSS 配置
└── tailwind.config.js            # Tailwind 配置
```

## 主要组件和功能

### 1. 后台脚本 (background.ts)

负责处理扩展的核心逻辑，包括：
- 处理来自内容脚本和 UI 的消息
- 管理扩展的生命周期
- 配置侧边栏行为

```typescript
// 示例代码片段
export default defineBackground(() => {
  console.log('Commentor.ai background service started', { id: browser.runtime.id });
  
  // 处理消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理各种消息...
    return true; // 保持消息通道开放
  });

  // 设置侧边栏行为
  browser.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(error => {
    console.error('Error setting side panel behavior:', error);
  });
});
```

### 2. 内容脚本 (content/index.ts)

负责从网页中提取内容，并发送给后台脚本：
- 使用 Readability.js 提取文章内容
- 处理 DOM 操作
- 与后台脚本通信

### 3. 选项页面 (options/)

提供用户配置界面，特别是 LLM 设置：
- 选择 LLM 提供商 (OpenAI 或 Gemini)
- 配置 API Key、模型名称等参数
- 保存设置到 `browser.storage.local`

### 4. 侧边栏 (sidepanel/)

计划中的主要用户界面，将用于：
- 显示提取的内容
- 生成和显示评论
- 提供用户交互功能

## 数据结构

### LLM 设置

```typescript
interface LLMSettings {
  provider: 'openai' | 'gemini' | null;
  openai?: {
    apiKey?: string;
    apiHost?: string;
    model?: string;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
  };
}
```

## 权限

在 `wxt.config.ts` 中配置的权限：
- `storage`: 用于保存设置
- `activeTab`: 用于内容脚本通信
- `scripting`: 用于脚本注入
- `sidePanel`: 用于侧边栏功能

## 构建和开发

### 开发模式

```bash
pnpm dev
```

开发服务器将启动，并在 `.output/chrome-mv3-dev` 目录中生成开发版扩展。

### 构建生产版本

```bash
pnpm build
```

生产版本将在 `.output/chrome-mv3-prod` 目录中生成。

## 注意事项

1. API Key 和其他敏感信息存储在 `browser.storage.local` 中，确保安全处理。
2. 扩展使用 Manifest V3，遵循最新的浏览器扩展标准。
3. 侧边栏功能需要 Chrome 114+ 版本支持。

## 未来计划

1. 实现侧边栏 UI 和功能
2. 增强内容提取能力
3. 添加更多 LLM 提供商支持
4. 实现评论历史和管理功能
