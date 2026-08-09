# Assertions: validating a non-deterministic response

Topic under test: **"What is Permission"** (test 2 in `tests/agent.spec.ts`).

## What I assert

Four independent checks in `assertSubstantiveOnTopicResponse` (`tests/helpers.ts`), each targeting a different failure mode rather than the same one four ways:

1. **Substantive.** More than 8 words. Word count rather than character count, so a single long token can't pass it.
2. **No error markers.** Regex against strings like "something went wrong", "undefined", "internal server error", "please try again". Error text is still text, so a non-empty check alone would let a surfaced backend error through.
3. **On-topic.** Matches subject-matter keywords. Catches a coherent but generic non-answer, the "I can help with lots of things!" case.
4. **Not an echo.** The response isn't the question reflected back verbatim, which is what a broken integration short-circuiting the model call would produce.

A response has to clear all four to count as answered.

## What I deliberately don't assert

Exact wording, exact length, tone, or specific facts. Recon confirmed even the fixed auto-greeting is phrased differently on every single load, so asserting any of those would make the suite flaky by design.

## Framework

**Promptfoo**, chosen over DeepEval because it's JavaScript-native (no cross-language bridge into a TypeScript suite) and because its `similar` assertion runs a local embedding model, `Xenova/all-MiniLM-L6-v2` via Transformers.js. No API key, so a reviewer can run it with `npm install` alone.

Config: `promptfoo/promptfooconfig.yaml`. `providers: [echo]` grades the real captured response from `test-results/semantic-eval/` rather than generating a new one. Threshold 0.5, deliberately loose: it only needs to confirm the answer is about the same thing.

## What it catches that the regex can't

Paraphrase, in both directions. A correct answer that avoids my keywords would fail check 3 but pass the semantic check. A broken answer stuffed with keywords would pass check 3 but fail the semantic one. I verified the failure path: substituting an off-topic response returns exit code 100.
