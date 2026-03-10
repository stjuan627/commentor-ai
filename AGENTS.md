# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Commentor AI is a Chrome browser extension that extracts webpage content and generates AI-powered comments using LLM APIs. Built with WXT (Web Extension Tools) + React + TypeScript.

## Commands

```bash
pnpm dev          # Start dev server (Chrome)
pnpm dev:firefox  # Start dev server (Firefox)
pnpm build        # Production build (Chrome)
pnpm build:firefox # Production build (Firefox)
pnpm zip          # Package for distribution (Chrome)
pnpm compile      # TypeScript type check (no emit)
```

## Tech Stack

- **Framework**: WXT 0.20 + React 19
- **Styling**: Tailwind CSS v4 + DaisyUI v5, via PostCSS (`@tailwindcss/postcss`)
- **Language**: TypeScript (strict mode, `react-jsx`)
- **Package Manager**: pnpm

## Architecture

### Directory Layout

The project is organized into WXT entrypoints and shared app modules under `src/`:

- **`entrypoints/`** - Extension runtime entrypoints (`background.ts`, `content/`, `sidepanel/`, `options/`).
- **`src/services/llm/`** - LLM abstraction and provider implementations.
- **`src/constants/`** - Shared constants (e.g. default prompt template).
- **`src/types/`** - Shared type definitions (`llm.ts`, `keyword.ts`, `content.ts`) with a barrel export in `index.ts`.
- **`src/hooks/`** - Shared storage/data hooks (`useLLMSettings.ts`, `useKeywords.ts`).
- **`src/components/`** - Reusable UI components shared across entrypoints.

### WXT Entrypoints (`entrypoints/`)

The extension follows WXT's convention-based entrypoint structure:

- **`background.ts`** - Service worker. Routes messages between sidepanel and content scripts, including `getPageContent` and `getPageLanguage`.
- **`content/index.ts`** - Content script (matches `<all_urls>`). Uses `@mozilla/readability` to extract article content from the DOM and detects page language from `<html lang>` / meta tags.
- **`sidepanel/`** - Main UI. Includes site-based keyword management, comment generation, multi-format copy (TXT/HTML/Markdown/BBCode), and sidepanel settings tab.
- **`options/`** - Dedicated settings page for provider setup (OpenAI/Gemini), API key/host/model/temperature/top-p configuration, and prompt template.

### Message Passing Flow

```
Sidepanel → background.ts → content script → (extracts content) → background.ts → Sidepanel
```

### LLM Services (`src/services/llm/`)

- **`index.ts`** - `LLMService` interface, factory function `createLLMService()`, prompt generation (`generatePrompt()`), and system prompt (`getSystemPrompt()`).
- **`openai.ts`** - OpenAI-compatible API client. Supports custom `apiHost`, configurable `temperature`, and `top_p`.
- **`gemini.ts`** - Google Gemini API client via REST. Supports configurable `temperature` and `topP`.

### Shared Types (`src/types/index.ts`)

`LLMSettings`, `KeywordItem`, `ExtractedContent`, `ExtractResponse` - used across entrypoints, hooks, and services.

### Storage

Uses `browser.storage.local` with LLM and site data:
- `llmSettings` - LLM provider config (provider, API keys, models, optional `temperature`/`topP`, and prompt template)
- `sites` - Array of `SiteItem` with per-site keywords
- Legacy `keywords` is auto-migrated into a default site on first load when `sites` is missing

## Key Behaviors

- For non-English pages, generates **two comments** in parallel: one English, one in the detected page language.
- Keywords are paired with URLs; when copying, keywords in the comment text are replaced with links in the chosen format.
- The `OpenAIService` supports custom API hosts, making it compatible with any OpenAI-compatible API.
- Prompt template defaults to empty in settings UI; the app uses `DEFAULT_PROMPT_TEMPLATE` as runtime fallback and as textarea placeholder.
- UI text is in Chinese (简体中文).
