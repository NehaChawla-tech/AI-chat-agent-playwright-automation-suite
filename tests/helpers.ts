import { expect, type Page } from '@playwright/test';

/**
 * Dismisses the OneTrust cookie consent banner if it's present.
 *
 * Safe to call unconditionally: if the banner never shows (e.g. consent was already
 * given earlier in this browser context) we just time out on the `waitFor` and move on,
 * rather than throwing and failing the test.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const acceptButton = page.locator('#onetrust-accept-btn-handler');
  try {
    await acceptButton.waitFor({ state: 'visible', timeout: 5000 });
    await acceptButton.click();
  } catch {
    // Banner didn't appear -- nothing to dismiss.
  }
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
 * (15s+) rather than a fixed sleep, so the wait adapts to real conditions instead of
 * hardcoding the ~7.2s figure we happened to observe.
 */
export async function reloadAndWaitForPills(page: Page, timeout = 15000): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Cookie consent is a first-party cookie that should persist across a reload within the
  // same context, so the banner shouldn't reappear -- but we defensively re-check rather
  // than assume, since a flaky/slow consent write is cheap to guard against here.
  await dismissCookieBanner(page);
  await expect(page.getByText('Suggested topics:', { exact: true })).toBeVisible({ timeout });
}
