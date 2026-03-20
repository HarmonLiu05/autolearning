# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoLearning (学习助手) is a Chrome Manifest V3 browser extension that assists with exam/problem pages. It supports two prompt modes:

- **Choice mode** (选择题): For multiple choice, true/false, fill-in-the-blank questions. Extracts question text, calls AI for the answer, and auto-selects single-choice answers.
- **Code mode** (代码题): For programming/fill-in-the-blank code problems. Extracts problem statement + existing editor code, generates a solution, and fills it back.

The extension primarily targets Educoder and similar "left problem + right editor" sites but also works on generic pages. It supports Monaco, CodeMirror 5, Ace, and plain textarea editors.

Additional capabilities: OCR via image model, screenshot capture (fixed region or selector), local question bank with import/export, search history, two fully-auto modes (screenshot-based and extraction-based).

## Development Commands

```bash
# Run the Playwright prototype (requires .env with EDUCODER_USERNAME/PASSWORD)
npm run dev

# Build TypeScript source to dist/
npm run build

# Run the built JavaScript
npm run start

# Launch Playwright's code generator for recording flows
npm run codegen

# Check extension JavaScript files for syntax errors
npm run check:extension

# Run browser automation smoke test (starts mock server, loads extension)
npm run test:extension
```

### Environment Variables

Create a `.env` file from `.env.example`:
- `EDUCODER_USERNAME`, `EDUCODER_PASSWORD`: Credentials for the Educoder platform (used by the Playwright prototype)
- `HEADLESS`: Set to `true` to run Playwright in headless mode
- `KEEP_OPEN`: Set to `true` to keep the browser open after prototype execution

## Architecture

### Browser Extension (`extension/`)

**Manifest V3** (`manifest.json`):
- Content script (`content.js`) injected on all pages
- Background service worker (`background.js`)
- Options page (`options.html`, `options.js`)
- Page bridge script (`page-bridge.js`) injected via `web_accessible_resources`
- Permissions: `storage`, `clipboardRead`, `clipboardWrite`, `activeTab`, `tabs`
- Host permissions: `<all_urls>`

**Key Components**:

1. **Content Script** (`content.js`):
   - Largest file (~195KB), injects floating "AL" launcher + expandable panel
   - Panel buttons: 提取题面, 生成答案, 编辑题库, 框选截图, 设定区域, 开启全自动, 读取剪贴板代码, 设置
   - Mode toggles: 答题模式 (选择题/代码题), 全自动模式 (截图全自动/提取题面全自动)
   - Manages state: problem data, solve results, history, question bank, drag positioning
   - Extracts problem text from DOM, reads editor code via page bridge, sends to background for solving
   - Handles auto-selection of single-choice answers via `selectChoiceOptions` bridge call

2. **Background Service Worker** (`background.js`):
   - Settings storage with defaults (separate text/image API configs, OCR config, shortcut bindings)
   - Makes API calls to OpenAI-compatible endpoints (text model for solving, image model for OCR)
   - Supports streaming responses with abort via `AbortController` (stored in `ACTIVE_SOLVE_CONTROLLERS` map)
   - Manages search history (`autolearningSolveHistory` in `chrome.storage.local`)
   - `DEFAULT_SETTINGS` in background.js contains placeholder API keys — these are overwritten by user settings on install

3. **Page Bridge** (`page-bridge.js`):
   - Injected into page context (not content script context) to access editor APIs directly
   - Supports Monaco, CodeMirror 5, Ace, and plain textarea — detects editor type automatically
   - Also handles choice option auto-selection (`selectChoiceOptions`) and submit button clicking

4. **Options Page** (`options.html`, `options.js`, `options.css`):
   - Configures text API, image API, OCR API endpoints separately
   - Configures choice/code prompt templates, shortcuts, screenshot behavior, auto-mode delay, history limit
   - All settings stored in `chrome.storage.local`

**Communication Patterns**:
- Content script ↔ Background: `chrome.runtime.sendMessage` with typed messages (`autolearning:solve-problem`, `autolearning:get-settings`, `autolearning:run-ocr`, `autolearning:capture-visible-tab`, `autolearning:cancel-solve`, `autolearning:save-history`, `autolearning:get-history`, etc.)
- Content script ↔ Page bridge: Custom DOM events (`autolearning:bridge-request` / `autolearning:bridge-response`) with request IDs for multiplexing. Bridge handles: `getEditorValue`, `setEditorValue`, `isEditorCopyContext`, `selectChoiceOptions`, `submitSolution`, `get-editor-debug`

### Playwright Prototype (`src/`)

Originally used for extracting problem data from Educoder, now kept as reference for debugging site structures.

**Key Files**:
- `main.ts`: Entry point launching browser and extracting problem data
- `extractor.ts`: DOM selectors and extraction logic for problem statements
- `config.ts`: Environment configuration
- `types.ts`: TypeScript interfaces (`ProblemData`, `SolveResult`)
- `prompt.ts`: Builds AI prompts from extracted problem data
- `flows/recorded.ts`: Navigation flow for Educoder

**Data Structures**:

```typescript
interface ProblemData {
  url: string;
  title: string;
  statementText: string;
  statementHtml: string;
  currentCode: string;
  currentCodeLineCount: number;
  samples: Array<{ input: string; output: string }>;
  limits: { time?: string; memory?: string; language?: string };
}

interface SolveResult {
  model: string;
  promptPreview: string;
  code: string;
}
```

### Testing

**Smoke Test** (`scripts/extension-smoke.mjs`):
- Starts a mock HTTP server with a test problem page and mock AI endpoint
- Loads the extension into a persistent browser context
- Exercises the full workflow: UI injection, problem extraction, AI call, code fill-back
- Validates each step and saves screenshots on failure

**Real Educoder Check** (`scripts/real-educoder-check.mjs`):
- Tests the extension on a real Educoder problem page (requires macOS Chrome profile)
- Copies Chrome user data to avoid login prompts
- Generates a report with UI visibility and extraction results
- Useful for validating selector updates against the live site

## Important Notes

- The extension is unpacked; load via Chrome's "Load unpacked" extension developer mode
- The extension is a learning aid — it does not automatically submit answers (unless auto-submit is explicitly enabled)
- Generated artifacts (screenshots, extracted data) are saved to the `artifacts/` directory
- Page structure changes may require selector updates in `content.js` and `page-bridge.js`
- The Playwright prototype requires valid Educoder credentials to run
- AI settings are configurable via the extension options page
- The project uses TypeScript for the prototype but plain JavaScript for the extension
- `content.js` is the largest file — most feature work happens here
- The extension injects `page-bridge.js` into the page's main frame; content script guards against double-injection via `window.__AUTOLEARNING_CONTENT__`
- Page bridge guards against double-injection via `window.__AUTOLEARNING_PAGE_BRIDGE__`
- Multi-select questions are NOT auto-selected; the user must manually select them (use the question bank to store correct answers for later reference)