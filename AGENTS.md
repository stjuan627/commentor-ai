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

### WXT Entrypoints (`entrypoints/`)

The extension follows WXT's convention-based entrypoint structure:

- **`background.ts`** - Service worker. Routes messages between sidepanel and content scripts. Sets up `sidePanel.setPanelBehavior` for action click. Message actions: `getPageContent`, `getPageLanguage`, `openOptionsPage`.
- **`content/index.ts`** - Content script (matches `<all_urls>`). Uses `@mozilla/readability` to extract article content from the DOM. Also detects page language from `<html lang>` / meta tags.
- **`sidepanel/`** - Main UI. Keyword management (add/edit/delete/toggle), comment generation trigger, copy in multiple formats (TXT/HTML/Markdown/BBCode with keyword links), keyword highlighting in output.
- **`options/`** - Settings page. LLM provider selection (OpenAI/Gemini), API key/host/model configuration, custom prompt template.

### Message Passing Flow

```
Sidepanel → background.ts → content script → (extracts content) → background.ts → Sidepanel
```

### LLM Services (`services/llm/`)

- **`index.ts`** - `LLMService` interface, factory function `createLLMService()`, prompt generation (`generatePrompt()`), system prompt (`getSystemPrompt()`)
- **`openai.ts`** - OpenAI-compatible API client. Supports custom `apiHost` for proxies/alternative endpoints.
- **`gemini.ts`** - Google Gemini API client via REST.

### Shared Types (`types/index.ts`)

`LLMSettings`, `KeywordItem`, `ExtractedContent`, `ExtractResponse` - used across entrypoints and services.

### Storage

Uses `browser.storage.local` with two keys:
- `llmSettings` - LLM provider config (provider, API keys, models, prompt template)
- `keywords` - Array of `KeywordItem` (keyword, url, enabled)

## Key Behaviors

- For non-English pages, generates **two comments** in parallel: one English, one in the detected page language.
- Keywords are paired with URLs; when copying, keywords in the comment text are replaced with links in the chosen format.
- The `OpenAIService` supports custom API hosts, making it compatible with any OpenAI-compatible API.
- UI text is in Chinese (简体中文).
