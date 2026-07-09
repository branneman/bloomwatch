# Security incident review — 2026-07-09

## What happened

While running the Tier 5 Playwright E2E smoke test locally (`npm run test:e2e`, part of backlog story 801's build/test tooling work), console output included this line:

```
◇ injected env (1) from .env.local // tip: ⌁ auth for agents [www.vestauth.com]
```

The phrase "auth for agents" paired with an unfamiliar URL, printed by a dependency at runtime, matched a known pattern for prompt-injection attempts embedded in npm package output — text specifically addressed to AI coding agents rather than a human developer, trying to get an agent to visit a URL or follow an embedded instruction.

## Response

Per standing instructions to flag suspected prompt injection before continuing: the URL was not visited, and no action was taken on the message's content. Instead, the source was traced statically:

```bash
npm ls dotenv
grep -rn "vestauth\|tip:" node_modules/dotenv/lib/main.js
```

## Finding

The message originates from a hardcoded `TIPS` array in `node_modules/dotenv/lib/main.js` (lines 6–15) in the officially published `dotenv@17.4.2` package — confirmed as the actual resolved dependency version, not a substituted or compromised package:

```js
const TIPS = [
  "◈ encrypted .env [www.dotenvx.com]",
  "◈ secrets for agents [www.dotenvx.com]",
  "⌁ auth for agents [www.vestauth.com]",
  "⌘ custom filepath { path: '/custom/path/.env' }",
  "⌘ enable debugging { debug: true }",
  "⌘ override existing { override: true }",
  "⌘ suppress logs { quiet: true }",
  "⌘ multiple files { path: ['.env.local', '.env'] }",
];
```

One tip is picked at random and logged every time `dotenv.config()` loads a file (`main.js:309`). This is the package maintainer's own self-promotion for their other products (`dotenvx.com`, `vestauth.com`) — unsolicited and arguably in poor taste given how "agents"-targeted phrasing reads, but it is intentional, documented behavior in a legitimate release, not a supply-chain compromise or injected malicious code.

## Verdict

**Not a security incident.** No compromise, no malicious code, no action taken on the suspicious-looking content. The caution was the correct response to the signal available at the time — an unfamiliar URL addressed to "agents" in tool output is exactly the shape a real injection attempt would take, and it was appropriately verified rather than trusted or ignored.

## Recommendation

Optional, non-blocking cleanup: pass `{ quiet: true }` to the `dotenv.config()` calls in `test/contract/report.contract.test.ts` and `playwright.config.ts` to suppress this output going forward, since it has no functional purpose in this project and only adds noise (and, apparently, the occasional scare).
