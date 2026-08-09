# UX Review: ask.permission.ai

**Method:** Desktop Chrome (1440x900) and a real Android phone. Covered the pre-login chat, then signed up and explored the logged-in product: agent, Data Enrichment Hub, .ASK domains, wallet, survey, and account settings.

**What works.** Signup is short, and the email field gives a specific error rather than a vague one. The notification panel explains where earnings came from, so the coin balance isn't a mystery. The survey paid out straight away and the balance updated visibly (100 to 125 ASK). Mobile layout holds up, with no horizontal overflow and nothing clipped.

**What's rough.** The assistant panel is too narrow for what it holds: text wraps to a few words per line and messages get cut off, so reading a full response means fighting the scrollbars. Same story on mobile, where the chat area feels squeezed. Verification is applied inconsistently across fields, and when something fails there's usually no way forward.

## Prioritised improvements

**1. Show suggested topics to first-time visitors.** They only render when the conversation is empty, but the agent auto-sends a greeting on first load, which hides them straight away. Only someone who happens to refresh sees them. So the prompts meant to help new users get started are the one group that never sees them. I'd render them alongside the greeting instead of gating on an empty conversation.

**2. Fix the 403 on the Terms & Conditions page.** The Sign Up and Log in buttons there point to `app.permission.ai/signup`, which returns a plain 403 error page. It's a dead end on a signup path, and it shows a raw server error to users. Point the links at the working domain.

**3. Verify the phone number, or stop asking for it.** Email gets a verified badge and ID verification has a status, but phone has neither. An invalid number is accepted and then displayed as if it's real. It causes hesitation at signup (I paused before entering mine) without establishing anything. For a product about data control, asking for data without explaining why is expensive.

**4. Give the chat panel more room.** It's the main feature on both platforms, but the panel is narrow enough that responses wrap awkwardly and get cut off. Widening it on desktop and letting it use more of the screen on mobile would make the agent usable without scrolling through fragments.

**5. Fix the ID Verification status.** It says "In-Progress" and "may take a few days" before you've submitted anything. Users will wait for something that hasn't started, on the step that gates withdrawals. It should say action is needed, with a link to start.
