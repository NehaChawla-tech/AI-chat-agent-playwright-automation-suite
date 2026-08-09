# sqa-homework-neha-chawla

Test suite and review for the pre-login agent at [ask.permission.ai](https://ask.permission.ai).

## Setup

```bash
git clone <repo-url> && cd sqa-homework-neha-chawla
npm install
npx playwright install
```

`npx playwright install` downloads browser binaries (~1.2GB on a first run, cached afterwards).

Run the suite:

```bash
npx playwright test --project=chromium
```

Run the semantic check (Playwright test 2, then the Promptfoo eval against its captured response):

```bash
npm run test:semantic
```

First run downloads a local embedding model (~90MB, cached afterwards), so expect about a minute. No API key or account needed.

**Windows note:** clone to a short path such as `C:\dev\`. The embedding model's cache path is long enough that a deeply nested clone can exceed Windows' 260-character limit and fail with a misleading "file doesn't exist" error.

The suite also runs on Firefox and WebKit. All three take about five minutes, so Chromium is the default:

```bash
npx playwright test
```

## Test strategy (TL;DR)

Eight tests, all pre-login: the four required behaviours, plus four chosen because each catches something the others don't — the input-disabled concurrency guard, pills disappearing after a click, auth navigation at mobile width, and the reply landing on the correct side of the conversation.

Skipped deliberately: exact response text, since even the fixed greeting is worded differently on every load. Also cookie banner behaviour (third-party), console errors (pre-existing noise), and empty-input validation (generic).

## Key decisions

- **Locators.** `data-testid` where it exists. Message bubbles, pills, and the typing indicator have only Tailwind classes, so those use roles and text content. Pills are real `<button>` elements, so `getByRole` survives restyling.
- **Waiting.** No fixed sleeps. `waitForAgentResponse` waits for the input to become disabled, *then* enabled. Without the disabled check, the enabled assertion can pass instantly against the pre-click state, reporting a response that never happened.
- **Pills need a reload.** They only render when the conversation is empty, and the auto-greeting hides them on first load. My tooling reported these pills didn't exist at all; I checked manually in Chrome, found otherwise, and traced the gating condition, which became my top UX finding. Reloading clears the conversation without re-greeting, verified 5/5. I chose that over intercepting the greeting API because it's a real user path.
- **Response assertions check properties, not text.** Four independent checks, plus one semantic check. See `artifacts/assertions.md`.
- **Promptfoo over DeepEval.** JavaScript-native, and its `similar` assertion runs a local model, so setup stays at `npm install`.
- **Three browsers, one worker.** WebKit surfaced a real race the others hid, so all three are configured. Chromium is the default because the full matrix takes about five minutes against a live backend. Three engines in parallel on one machine caused contention failures unrelated to the app; each passes in isolation. In CI, each browser as its own job.
- **Timeouts are measured, not guessed.** Every value came from observed timings during reconnaissance.

## AI disclosure

See `artifacts/ai-workflow.md`.

## Next steps

With another day: GitHub Actions with each browser as its own job, gating merges on the suite and the semantic check. A golden set of question/answer pairs so response quality is tracked over time. Post-login coverage.

## Submission checklist

- [ ] Repo named `sqa-homework-neha-chawla`, default branch `main`
- [ ] README includes exact setup and run commands, verified from a clean clone
- [ ] README ≤500 words
- [ ] Max 8 tests, all 4 required behaviours covered
- [ ] `artifacts/assertions.md`
- [ ] Assertion wired into an evaluation framework and running
- [ ] `artifacts/ux-review.md`
- [ ] `artifacts/data-checks.md`
- [ ] `artifacts/ai-workflow.md`
- [ ] `artifacts/report/`
- [ ] `artifacts/demo.mp4`
- [ ] Commit history shows how the work evolved
