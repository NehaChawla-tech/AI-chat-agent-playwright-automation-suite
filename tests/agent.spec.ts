import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { dismissCookieBanner, waitForAgentResponse, reloadAndWaitForPills, assertSubstantiveOnTopicResponse } from './helpers';

const AGENT_INPUT = 'agent-chat-input';

// Suggested-topic pills have no testid, so we locate them by accessible name (they're real
// <button> elements). The label shown on the pill and the question it actually submits are
// different strings (confirmed via the suggestions API + click testing in recon) -- tests
// that check submitted text use `prompt`, not `label`.
const SUGGESTED_TOPICS = [
  { label: 'What is Permission', prompt: 'What is Permission?' },
  { label: 'Best way to earn ASK', prompt: 'How can i earn ASK?' },
  { label: 'How permission uses my data', prompt: 'How permission uses my data?' },
  { label: 'What is passive earning', prompt: 'What is passive earning?' },
  { label: 'What is data ownership', prompt: 'What is data ownership and why it is important for me?' },
  { label: 'Permission Wallet', prompt: 'What is Permission Wallet?' },
];

// Message bubbles have no testid either (recon confirmed this across the whole chat panel).
// Structurally, each message is `div.space-y-4 > div.flex.justify-end` (user) or
// `div.flex.justify-start` (agent) -- scoping to a direct child of `.space-y-4` keeps this
// from accidentally matching an unrelated `justify-start`/`justify-end` element elsewhere
// on the page.
const agentBubbles = (page: import('@playwright/test').Page) => page.locator('div.space-y-4 > div.flex.justify-start');
const userBubbles = (page: import('@playwright/test').Page) => page.locator('div.space-y-4 > div.flex.justify-end');

test.beforeEach(async ({ page }) => {
  // `domcontentloaded` rather than the default `load`: this page pulls in ~15 third-party
  // trackers (TikTok, Facebook, Reddit, Google Ads, PostHog, OneTrust, ...), and `load`
  // waits for every one of them to finish, which is slow and occasionally times out for
  // reasons that have nothing to do with the app itself. `domcontentloaded` plus the
  // explicit wait for the input below gives us a much more reliable, still-meaningful
  // "the app is ready" signal.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  // The app auto-sends a greeting on every fresh load, which disables the input for the
  // duration of that response (see waitForAgentResponse for why we check `disabled`).
  // Waiting for it to finish here means every test starts from a stable, interactive
  // baseline instead of racing the greeting -- e.g. typing into the input before it's
  // ready would be a no-op since it's disabled during the greeting.
  await expect(page.getByTestId(AGENT_INPUT)).toBeEnabled({ timeout: 20000 });
  // The input re-enabling and the greeting bubble actually landing in the message list
  // aren't perfectly synchronized -- observed as a real race under WebKit during test
  // iteration, where the input reported enabled a beat before the DOM had the bubble.
  // Waiting for the bubble explicitly closes that race so tests can rely on a stable
  // starting message count instead of an occasionally-stale one.
  await expect(agentBubbles(page)).toHaveCount(1, { timeout: 5000 });
});

test.describe('Permission Agent - pre-login chat', () => {
  test('1. suggested-topic pills are visible on load', async ({ page }) => {
    // A literal first load never reliably shows pills -- the auto-greeting closes the
    // gate that controls them almost every time (see helpers.ts for the full mechanism).
    // Reload is the verified, repeatable way to reach the pills-visible state (5/5 in
    // recon), so it's the right way to test that this state is reachable and correct,
    // not a workaround we're hiding.
    await reloadAndWaitForPills(page);

    await expect(page.getByText('Suggested topics:', { exact: true })).toBeVisible();
    for (const { label } of SUGGESTED_TOPICS) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('2. clicking a suggested topic produces an agent response', async ({ page }) => {
    await reloadAndWaitForPills(page);
    const bubbleCountBefore = await agentBubbles(page).count(); // 0 -- reload just cleared the conversation

    const topic = SUGGESTED_TOPICS[0];
    await page.getByRole('button', { name: topic.label, exact: true }).click();

    // Confirms the click actually submitted the pill's underlying prompt (not its label).
    await expect(userBubbles(page).last()).toContainText(topic.prompt);

    await waitForAgentResponse(page);

    await expect(agentBubbles(page)).toHaveCount(bubbleCountBefore + 1);
    const rawResponseText = await agentBubbles(page).last().innerText();
    // The bubble's innerText includes its trailing timestamp (e.g. "...\n12:36 AM") since
    // that's a sibling within the same wrapper div we scope to -- there's no separate
    // testid to target just the message text. Stripped here so the checks below (and the
    // DeepEval bridge) look at just the actual answer, not incidental UI chrome.
    const responseText = rawResponseText.replace(/\n?\d{1,2}:\d{2}\s?(AM|PM)\s*$/i, '').trim();
    // Responses are LLM-generated and differ on every run (confirmed in recon) -- these
    // check properties a real answer must have, never exact wording/length/tone/facts,
    // any of which would make this suite flaky by design. See assertSubstantiveOnTopicResponse
    // in helpers.ts for why each check exists and what specific breakage it catches.
    assertSubstantiveOnTopicResponse(responseText, topic.prompt, /permission|data|earn|ask/i);

    // Bridges this one response out to the Promptfoo semantic check (see
    // promptfoo/README.md). Written here, not asserted on: the plain checks above are the
    // pass/fail gate for this test itself; this just hands the same real, already-validated
    // example to a separate embedding-similarity check that catches something regex/keyword
    // matching structurally can't -- see promptfoo/promptfooconfig.yaml for why.
    // Two plain-text files, not JSON: promptfoo's `file://` var-loading reads raw file
    // contents directly into a single var, which is simpler and less error-prone here than
    // getting a multi-field JSON-to-vars mapping right in YAML for one value we need.
    const bridgeDir = path.join('test-results', 'semantic-eval');
    fs.mkdirSync(bridgeDir, { recursive: true });
    fs.writeFileSync(path.join(bridgeDir, 'question.txt'), topic.prompt);
    fs.writeFileSync(path.join(bridgeDir, 'response.txt'), responseText);
  });

  test('3. submitting a free-text question produces an agent response', async ({ page }) => {
    const input = page.getByTestId(AGENT_INPUT);
    const bubbleCountBefore = await agentBubbles(page).count(); // 1 -- the auto-greeting from beforeEach

    const question = 'What is Permission.ai?';
    await input.fill(question);
    await input.press('Enter');

    // Enter submits immediately: the input clears and the question appears as a user bubble.
    await expect(input).toHaveValue('');
    await expect(userBubbles(page).last()).toContainText(question);

    await waitForAgentResponse(page);

    await expect(agentBubbles(page)).toHaveCount(bubbleCountBefore + 1);
    const responseText = await agentBubbles(page).last().innerText();
    expect(responseText.trim().length).toBeGreaterThan(15);
  });

  test('4. Shift+Enter inserts a newline instead of submitting', async ({ page }) => {
    const input = page.getByTestId(AGENT_INPUT);
    const bubbleCountBefore = await userBubbles(page).count(); // 0 -- nothing sent yet

    await input.fill('Line one');
    // The behaviour under test is this key combo specifically, so it's a real `.press()`,
    // not `.fill()` -- a single atomic key event, not prone to the drop risk below.
    await input.press('Shift+Enter');
    // `keyboard.insertText` rather than typing "Line two" via per-character key events:
    // during iteration, rapid synthetic keystrokes were observed getting silently dropped
    // under heavy parallel cross-browser load (even with a per-key delay) because the
    // browser process was CPU-starved and missed some events entirely -- not a timing
    // issue `expect` retries can fix, since the keys were never dispatched. insertText sets
    // the filler text in one atomic operation, sidestepping that without weakening what
    // we're actually asserting (the newline came from a real Shift+Enter keypress above).
    await page.keyboard.insertText('Line two');

    await expect(input).toHaveValue('Line one\nLine two');
    // Nothing should have been submitted: no new user bubble appeared, and the input still
    // holds both lines.
    await expect(userBubbles(page)).toHaveCount(bubbleCountBefore);
  });

  test('5. input is disabled while responding and re-enabled afterwards', async ({ page }) => {
    const input = page.getByTestId(AGENT_INPUT);
    await expect(input).toBeEnabled(); // baseline: beforeEach already waited out the greeting

    await input.fill('What is Permission.ai?');
    await input.press('Enter');

    // Deliberately asserting directly here instead of calling waitForAgentResponse: this
    // test's entire purpose is to pin down that exact contract (disabled -> enabled) as its
    // own named requirement, not just as plumbing for a content check. Tests 2/3 exercise
    // this indirectly via the helper, but a break here would surface there as a vague
    // "response never arrived" failure -- this test names the actual mechanism, which is
    // the app's own concurrency guard against firing a second question at a
    // non-deterministic backend before the first has resolved.
    await expect(input).toBeDisabled({ timeout: 5000 });
    await expect(input).toBeEnabled({ timeout: 30000 });
  });

  test('6. suggested-topic pills disappear after clicking one and do not return', async ({ page }) => {
    // Ties directly to the render-gate bug documented in NOTES.md: the pills are gated on
    // the conversation having zero messages, so adding a user message should close that
    // gate immediately. This is the "disappear correctly" counterpart to test 1 ("appear
    // correctly") -- not covered by tests 1/2, which only assert pills showing up.
    await reloadAndWaitForPills(page);

    const topic = SUGGESTED_TOPICS[0];
    await page.getByRole('button', { name: topic.label, exact: true }).click();

    await expect(page.getByText('Suggested topics:', { exact: true })).not.toBeVisible();

    await waitForAgentResponse(page);
    // Confirms they don't quietly reappear once the response finishes rendering either.
    await expect(page.getByText('Suggested topics:', { exact: true })).not.toBeVisible();
  });

  test('7. Log in and Sign Up are present and navigate correctly at mobile width', async ({ page }) => {
    // A single page.goto() at project-default (desktop) viewport already ran in
    // beforeEach; resizing here just re-triggers the responsive layout without a fresh
    // navigation, since it's a CSS reflow, not a state change the app needs to reload for.
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(page.getByTestId('log-in-button')).toBeVisible();
    await expect(page.getByTestId('sign-up-button')).toBeVisible();

    await page.getByTestId('log-in-button').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-title-heading')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('sign-up-button')).toBeVisible();
    await page.getByTestId('sign-up-button').click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByTestId('register-title-heading')).toBeVisible();
  });

  test('8. agent reply renders as a distinct agent-side bubble, not a user-side one', async ({ page }) => {
    const input = page.getByTestId(AGENT_INPUT);
    await input.fill('What is Permission.ai?');
    await input.press('Enter');
    await waitForAgentResponse(page);

    // Beyond what tests 2/3 already check (a bubble matching the agent selector exists with
    // real content), this confirms the two bubbles are genuinely rendered on opposite
    // sides -- agent left-aligned (`justify-start`), user right-aligned (`justify-end`) --
    // rather than just trusting that two differently-named locators each found something.
    // A layout regression that kept both messages under the same alignment class would slip
    // past a pure count-based check but not this one.
    //
    // Important: we measure the *inner* bubble (the direct child), not the outer
    // `justify-start`/`justify-end` wrapper itself. The wrapper is a full-width flex row --
    // `justify-content` only positions its child within it, so both wrappers' own bounding
    // boxes start at the same left edge regardless of alignment (confirmed by hand: this
    // was the first version of this assertion, and it failed by comparing two identical x
    // values). The inner child is what actually moves left/right.
    const agentBox = await agentBubbles(page).last().locator('> div').first().boundingBox();
    const userBox = await userBubbles(page).last().locator('> div').first().boundingBox();
    expect(agentBox).not.toBeNull();
    expect(userBox).not.toBeNull();
    expect(agentBox!.x).toBeLessThan(userBox!.x);
  });
});
