# AI workflow

## Tools

Claude for planning and writing, Claude Code for implementation. I've used both at Foundation Health for Playwright work, so I already knew where they're reliable and where they aren't. I didn't use anything else.

## Generated vs. corrected

The test code, helpers, and Promptfoo config were largely generated. The decisions weren't. I chose which 8 tests to write and rejected one suggestion as a duplicate of an assertion that already existed. I decided to keep cross-browser coverage after WebKit surfaced a real race the other engines hid. I picked reloading the page over intercepting the greeting API to make the suggested topics appear, because reloading is a real user path and easier to justify. I switched from DeepEval to Promptfoo once it became clear DeepEval needed an API key I don't have, and a local embedding model kept the reviewer's setup to `npm install`.

I also stopped it several times when it was overcomplicating something or heading down a path that wasn't going to answer the question.

## What it got wrong

Its first pass concluded the suggested-topic pills didn't exist on the landing page. It had done DOM dumps, a body-text dump, and a 12-second wait, and reported the element simply wasn't there. I'd seen the pills myself in Chrome, so I pushed back instead of accepting it. They do exist; they render only when the conversation is empty, and the agent's auto-greeting hides them on first load. That turned into my top UX finding. An automated "this doesn't exist" needs confirming by eye before you act on it.

## Built by hand

Everything in the UX review came from using the product myself. I verified the pills manually in Chrome and incognito rather than trusting the tooling. And when Firefox failed in the cross-browser run, I had it isolated first to find out whether it was a real browser difference before anything was changed, rather than letting a timeout get bumped until the symptom disappeared.
