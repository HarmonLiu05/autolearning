# AutoLearning MVP

This is a minimal prototype for:

1. opening a problem page with Playwright
2. extracting the problem statement from the DOM
3. saving the extracted result locally

It does not call any model and does not auto-submit.

## Setup

```bash
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

Set `EDUCODER_USERNAME` and `EDUCODER_PASSWORD` in `.env`.
For easier debugging, keep `KEEP_OPEN=true` so the browser stays open after extraction.

## Run

```bash
npm run dev
```

Artifacts are written to `artifacts/problem.json` and `artifacts/problem-page.png`.

## Record your flow

Start Playwright codegen if you want to re-record the flow:

```bash
npm run codegen
```

Then:

1. log in to the target site
2. navigate to a single problem page
3. stop once the full statement is visible

The current project already includes your recorded Educoder flow in [src/flows/recorded.ts](E:\autolearning\src\flows\recorded.ts).

Keep only the steps needed to reliably land on the problem page. Delete submit-related actions.

## Notes

- `src/extractor.ts` currently uses generic selectors and a fallback to `main` or `body`.
- After you share the target site structure, we can tighten selectors and add sample parsing rules.
- The next step after this MVP is usually an `editor_bridge` or a third-party solver client.
