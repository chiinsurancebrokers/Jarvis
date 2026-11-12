# Agent guide

Jarvis is a small TypeScript service (Node 22, Hono). Start with `README.md` and `STATUS.md`.

## Rules for changes
- **Read-only.** Do not add any call that mutates Railway, Netlify or GitHub. Write actions need an explicit approval design first (see `STATUS.md`).
- **Both languages.** Every new finding code needs an English and a Greek message in `src/i18n.ts`; `test/i18n.test.ts` fails otherwise.
- **Never print or log secrets.** Tokens come from environment variables only.
- Keep data sources independent: a failing source must become a `source_unavailable` finding, never a crash.
- Run `npm run typecheck && npm test` before committing.

## Layout
- `src/sources/*`: one reader per platform
- `src/findings.ts`: rules that turn a snapshot into findings
- `src/i18n.ts`: Greek/English text and the spoken summary
- `src/server.ts`: HTTP API and voice tools
