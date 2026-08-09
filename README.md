# sqa-homework-neha-chawla

Test suite and review for the pre-login agent at [ask.permission.ai](https://ask.permission.ai).

## Setup

```bash
git clone <repo-url> && cd sqa-homework-neha-chawla
npm install
npx playwright install
```

Run the suite (8 tests across Chromium, Firefox, WebKit):

```bash
npx playwright test
```

Run the semantic check (Playwright test 2, then the Promptfoo eval against its captured response):

```bash
npm run test:semantic
```

First run of `test:semantic` downloads a local embedding model (~90MB, cached afterwards), so expect about a minute. No API key or account needed.

## Test strategy (TL;DR)

Eight tests, all pre-login. The four required behaviours, plus four chosen because each catches something the others don't: the input-disabled concurrency guard, pills disappearing after a click and not returning, auth navigation at mobile width, and the agent's reply landing on the correct side of the conversation.

Skipped deliberately: exact response text. Reconnaissance showed even the fixed auto-greeting is worded differently on every single load, so asserting on wording would be flaky by design. Also skipped: cookie banner behaviour, since OneTrust is third-party; console errors, because the page throws pre-existing CORS and 403 noise unrelated to the app; and empty-input validation, which is real but generic and wouldn't show judgment.

## Key decisions

- **Locators.** `data-testid` where it exists (input, send button, Log in, Sign Up). Everything else, including message bubbles, pills, and the typing indicator, has only Tailwind utility classes, so those use roles and text content. Pills are real `<button>` elements, so `getByRole('button', { name })` works and survives restyling.
- **Waiting.** No fixed sleeps anywhere. `waitForAgentResponse` waits for the input to become disabled, *then* enabled. The disabled check matters: without it, the enabled assertion can pass instantly against the pre-click state, and the test would report a response that never happened.
- **Pills need a reload.** They only render when the conversation is empty, and the auto-greeting on first load hides them. My tooling initially reported these pills didn't exist at all; I checked manually in Chrome, found otherwise, and traced the actual gating condition, which became my top UX finding. Reloading clears the conversation without re-greeting, verified 5/5 before building on it. I chose that over intercepting the greeting API because it's a real user path.
- **Response assertions check properties, not text.** Four independent checks, plus one semantic check. See `artifacts/assertions.md`.
- **Promptfoo over DeepEval.** JavaScript-native, and its `similar` assertion runs a local model, so setup stays at `npm install`.
- **Three browsers, one worker.** WebKit surfaced a real race the others hid, so cross-browser earns its place. Running three engines in parallel on one machine produced contention failures unrelated to the app; each browser passes in isolation. In CI I'd run each as its own job.
- **Timeouts are measured, not guessed.** Every value came from observed timings during reconnaissance.

## AI disclosure

See `artifacts/ai-workflow.md`.

## Next steps

With another day: wire this into GitHub Actions with each browser as a separate job, gating merges on the suite plus the semantic check. Build a small golden set of question/answer pairs rather than one, so response quality is tracked over time instead of spot-checked. Add post-login coverage.

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
