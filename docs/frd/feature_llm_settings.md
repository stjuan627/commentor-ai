# Feature: LLM Configuration Options

## 1. 功能描述

为 Commentor.ai 扩展添加一个选项页面，允许用户配置用于生成评论的大语言模型 (LLM) 服务。用户可以选择不同的 LLM 提供商（目前支持 OpenAI 和 Google Gemini），并为 OpenAI 配置自定义参数。

## 2. 技术方案

-   **UI 框架**: 使用 React 和 DaisyUI 构建选项页面的用户界面。
-   **入口点**: 利用 `wxt` 的 `options` 入口点创建标准的扩展选项页面。
-   **状态管理**: 使用 React 的 `useState` 来管理选项页面的表单状态。
-   **数据存储**: 使用 `browser.storage.local` API 来持久化存储用户的配置选项。存储的数据结构应包含所选的 LLM 提供商以及 OpenAI 的特定配置（API Host, Model）。
-   **组件**:
    -   `OptionsPage.tsx`: 选项页面的主 React 组件。
    -   `LLMProviderSelector.tsx`: 用于选择 LLM 提供商（OpenAI/Gemini）的组件。
    -   `OpenAIConfigForm.tsx`: 当选择 OpenAI 时，显示用于输入 API Host 和 Model 的表单。
-   **配置加载与保存**:
    -   选项页面加载时，从 `browser.storage.local` 读取现有配置并填充表单。
    -   用户修改配置并保存时，将新配置写入 `browser.storage.local`。

## 3. TODO List

-   [ ] **创建选项页入口点**: 在 `wxt.config.ts` 中定义 `options` 入口点，并创建对应的 HTML 和 TypeScript/TSX 文件 (`entrypoints/options/index.html`, `entrypoints/options/main.tsx`)。
-   [ ] **设计数据结构**: 定义存储在 `browser.storage.local` 中的配置对象结构。例如：
    ```typescript
    interface LLMSettings {
      provider: 'openai' | 'gemini' | null; // 当前选择的提供商
      openai?: {
        apiKey?: string; // API Key 仍然在 Popup 中输入和管理
        apiHost?: string; // 自定义 API Host
        model?: string; // 自定义模型名称
      };
      // gemini 配置 (如果需要)
    }
    ```
-   [x] **开发 UI 组件**:
    -   [x] 实现 `OptionsPage.tsx` 组件，包含整体布局和保存逻辑。
    -   [x] 实现 `LLMProviderSelector.tsx` 组件（例如使用 Radio buttons 或 Select dropdown）。
    -   [x] 实现 `OpenAIConfigForm.tsx` 组件，包含 API Host 和 Model 的输入字段。
-   [x] **实现配置加载逻辑**: 在 `OptionsPage.tsx` 加载时，异步读取 `browser.storage.local` 中的设置并更新组件状态。
-   [x] **实现配置保存逻辑**: 在用户点击“保存”按钮时，将当前表单状态保存到 `browser.storage.local`。
-   [x] **集成样式**: 使用 Tailwind CSS 和 DaisyUI 美化选项页面。
-   [ ] **测试**: 测试选项页面的功能，确保配置能正确加载和保存。
