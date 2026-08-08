# Semantic response check (Promptfoo)

Validates that the agent's answer to the "What is Permission" suggested topic (test 2 in
`tests/agent.spec.ts`) actually *addresses the question* — not just that it looks like a
real answer structurally (that's what the plain assertions in `helpers.ts`'s
`assertSubstantiveOnTopicResponse` already check: substantive, no error markers, on-topic
keywords, not an echo of the question).

## What this catches that the plain checks can't

The plain on-topic check is a keyword regex (`/permission|data|earn|ask/i`) — it's rigid in
both directions:

- A **broken response that name-drops the right words without actually being coherent** (e.g.
  a regression that returns keyword-stuffed but off-target text) can pass a keyword check it
  shouldn't.
- A **genuinely good, correctly-paraphrased answer that avoids those exact words** (real risk
  with an LLM backend that phrases things differently every run — confirmed in recon) can fail
  a keyword check it shouldn't.

This check instead compares the response's *meaning* to a hand-written reference answer using
embedding cosine similarity (`similar` assertion, computed locally via Transformers.js — no API
key, no external call). It tolerates rewording the plain check can't, and doesn't reward
keyword-stuffing the way a regex could theoretically be gamed by.

Consistent with the rest of this suite: this does **not** assert exact wording, length, tone,
or specific facts — `threshold: 0.5` only requires the response be broadly *about the same
thing* as the reference, not a close paraphrase of it.

## Setup (one-time)

```bash
npm install
```

That's it — `promptfoo` and `@huggingface/transformers` (the local embedding runtime) are
regular devDependencies, installed with everything else. No API key, no account, no external
service. First run downloads the embedding model (~90MB, cached afterward under
`node_modules/@huggingface/transformers/.cache` or your system cache dir depending on
platform) — budget a minute or two for that on first run only.

## Running it

Run test 2 first (it writes the real captured response to
`test-results/semantic-eval/response.txt`), then run the semantic check against that file:

```bash
npm run test:semantic
```

This runs both steps in sequence and fails (non-zero exit) if either the Playwright
assertions or the Promptfoo similarity check fail. See the `test:semantic` script in
`package.json`.

To re-run just the semantic check against the most recently captured response (e.g. while
iterating on the reference answer or threshold), without re-running Playwright:

```bash
npx promptfoo eval -c promptfoo/promptfooconfig.yaml
```

## Why `providers: [echo]`

Promptfoo's normal flow calls an LLM provider to *generate* the output being graded. We
don't want that here — the output already exists, captured live from the real app. The
`echo` provider is promptfoo's documented pattern for this exact situation: it returns the
rendered prompt (our captured response, loaded via `file://`) back out verbatim as the
"output," so promptfoo proceeds straight to grading it instead of generating something new.
https://www.promptfoo.dev/docs/providers/echo/
