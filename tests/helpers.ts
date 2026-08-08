import { expect, type Page } from '@playwright/test';

/**
 * Asserts an agent response is a real, on-topic answer -- deliberately without checking
 * exact wording, exact length, tone, or specific facts, any of which would make the suite
 * flaky by design against a live LLM (recon confirmed even the fixed auto-greeting varies
 * in phrasing every single load, e.g. "Hello there! How can I help you today?" vs "Hello!
 * I am your Permission Agent, here to help you understand..." -- same intent, different
 * words, every time).
 *
 * Each check below targets a distinct, real failure mode -- not the same thing checked
 * four ways:
 *   - a stub/placeholder response would pass a naive "non-empty" check but isn't an answer
 *   - a surfaced backend error would also pass "non-empty" -- error text is still text
 *   - a generic non-answer ("I can help with lots of things!") would pass both of the above
 *     without ever addressing what was actually asked
 *   - a broken integration that short-circuits the LLM call and reflects the input back
 *     verbatim would pass all three of the above if the question itself is long enough
 * A response has to clear all four independently to count as "actually answered."
 */
export function assertSubstantiveOnTopicResponse(responseText: string, question: string, topicKeywords: RegExp): void {
  const normalized = responseText.trim();

  // 1. Substantive, not a stub. Word count rather than character count: can't be fooled by
  // one very long token, and is a better proxy for "a real sentence" than raw length.
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  expect(wordCount, 'response should be a substantive answer, not a stub').toBeGreaterThan(8);

  // 2. No error/fallback markers leaking through as if they were a normal reply.
  const errorMarkers = /something went wrong|undefined|null|internal server error|failed to fetch|an error occurred|please try again|no response available|n\/a/i;
  expect(normalized, 'response should not contain an error/fallback marker').not.toMatch(errorMarkers);

  // 3. On-topic: actually references the subject matter, not just any coherent sentence.
  expect(normalized, 'response should reference the actual subject matter').toMatch(topicKeywords);

  // 4. Isn't just the question reflected back.
  expect(normalized.toLowerCase(), 'response should not just repeat the question verbatim').not.toBe(question.trim().toLowerCase());
}

/**
 * Dismisses the OneTrust cookie consent banner. Call this exactly once, right after the
 * very first page load -- it is NOT called again after a reload (see
 * `reloadAndWaitForPills`), because that was the actual source of the report noise this
 * replaced: a defensive "just in case" re-check after reload that recon already proved
 * would deterministically find nothing there, dressed up first as a `waitFor` that timed
 * out every time (shows as a failed step even when caught) and then as a blind
 * `waitForTimeout` retry loop (shows as a "Wait for timeout" step, and is exactly the kind
 * of fixed sleep this suite otherwise avoids). Deleting the redundant call site was the
 * real fix -- not a cleverer way to wait for a condition that was never going to be true.
 *
 * At this one remaining call site the banner reliably IS there (every fresh browser
 * context has shown it, across dozens of recon and test runs), so a real, auto-retrying
 * `expect(...).toBeVisible()` is the right tool here, same as everywhere else in this
 * suite -- it's expected to resolve quickly and successfully, not to usually time out.
 * 20s (up from an initial 10s): hit the same live-service/contention tail latency pattern
 * as waitForAgentResponse and reloadAndWaitForPills -- Firefox timed out at 10s during a
 * full cross-browser parallel run despite the banner reliably rendering well under 1s in
 * isolation. Same trade-off as those: absorb real variance under load, don't mask a
 * genuinely missing banner with a run that's merely fast most of the time.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const acceptButton = page.locator('#onetrust-accept-btn-handler');
  await expect(acceptButton).toBeVisible({ timeout: 20000 });
  await acceptButton.click();
}

/**
 * Waits for the agent to finish responding after an action that triggers a response
 * (clicking a suggested topic, submitting a question, etc).
 *
 * Waiting strategy: the input [data-testid="agent-chat-input"] is disabled the instant a
 * request is sent and re-enabled only once the full response has rendered (confirmed in
 * recon: the app shows a "Permission is typing..." indicator with no testid while
 * disabled, then the complete answer appears all at once -- not token-by-token -- and the
 * input re-enables). We assert on the `disabled` state rather than the typing-indicator
 * text because:
 *   - it's a real DOM/ARIA state Playwright has a built-in auto-retrying matcher for
 *     (`toBeEnabled`/`toBeDisabled`), instead of us polling for a text string ourselves
 *   - the indicator's copy is incidental UI text with no testid and could change/be
 *     localized without the underlying request lifecycle changing
 *
 * We check for the *disabled* state first, before waiting for it to re-enable. This
 * matters because of a race: if we only asserted `toBeEnabled`, and the input happened
 * to still show as enabled in the instant before React re-renders it disabled, the
 * assertion could resolve immediately against the pre-click state -- and the test would
 * wrongly conclude a response arrived when the request hadn't even started yet. Confirming
 * `disabled` first proves the request was actually sent.
 */
export async function waitForAgentResponse(page: Page, timeout = 30000): Promise<void> {
  const input = page.getByTestId('agent-chat-input');
  // Disabling happens near-instantly after the triggering action (recon measured ~260ms),
  // so a short timeout here is enough and still catches slower cases.
  await expect(input).toBeDisabled({ timeout: 5000 });
  // Recon consistently measured ~3-4.5s full responses, but a live LLM backend has real
  // tail latency -- one run during iteration took >20s. 30s (with the global test timeout
  // raised to 45s in playwright.config.ts to give this room) absorbs that variance without
  // masking a genuinely broken/hung response.
  await expect(input).toBeEnabled({ timeout });
}

/**
 * Reloads the page and waits for the "Suggested topics" pills to appear.
 *
 * Why a reload is required at all: recon (.recon-scratch/recon2 through recon4) found the
 * pills are gated by a frontend condition that only opens when the conversation has zero
 * messages. The auto-greeting the app sends on every fresh load immediately adds a message,
 * closing that gate -- so pills are effectively never visible on a first load. A reload
 * clears the conversation client-side *without* re-firing the greeting, landing back in the
 * zero-messages state the gate requires. This was verified reliable in
 * .recon-scratch/recon4-reload-pills.js: 5/5 runs showed pills after reload, 0/5 saw a new
 * greeting, and the pills consistently appeared ~7.1-7.3s after the reload.
 *
 * Waiting strategy: we assert on the heading becoming visible with a generous timeout
 * rather than a fixed sleep, so the wait adapts to real conditions instead of hardcoding
 * the ~7.2s figure we happened to observe. 25s (up from an initial 15s): this depends on
 * a live network round trip same as waitForAgentResponse, and hit the same kind of tail
 * latency during verification -- 2 of 6 full-suite runs timed out at 15s despite recon's
 * tight 7.1-7.3s baseline. Same trade-off as there: absorb real variance rather than mask
 * a genuinely broken case with a run that's merely fast most of the time.
 */
export async function reloadAndWaitForPills(page: Page, timeout = 25000): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  // No dismissCookieBanner() call here, deliberately: the OneTrust consent cookie is a
  // first-party cookie that persists across a reload in the same context -- confirmed by
  // dedicated recon (.recon-scratch/recon4-reload-pills.js, 5/5 runs), not assumed. Calling
  // it here anyway was previously "cheap insurance," but insurance against a condition that
  // never occurs isn't cheap once you have to actually implement the wait -- it was the
  // direct cause of the sleep/failed-step noise fixed above. If a real regression ever made
  // the banner reappear post-reload, it would surface loudly here anyway: the banner
  // intercepts pointer events, so the very next line's `toBeVisible` on the pills heading
  // would fail as the banner blocks the click-through, or a later step interacting with
  // the page would fail with an "intercepts pointer events" error pointing right at it.
  await expect(page.getByText('Suggested topics:', { exact: true })).toBeVisible({ timeout });
}
