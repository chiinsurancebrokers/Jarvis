# Jarvis

A bilingual (Greek / English) operations assistant for Ashlar Assurance. It audits the software estate on **Railway**, **Netlify** and **GitHub**, explains what needs attention, and speaks through an **ElevenLabs** voice agent.

**Read-only by design.** Nothing in this codebase can deploy, restart, delete or change a project. Every outbound call to a platform is a GET (or a read-only GraphQL query).

## What it does today (v0.1)

| Area | Behaviour |
|---|---|
| Railway | Latest deployment status per service and environment. Flags `FAILED` / `CRASHED` as critical, no live deployment as offline. |
| Netlify | Published deploy state, deploys older than `STALE_DAYS`, and sites built from the same repository (likely copies). |
| GitHub | Repos untouched for `DORMANT_DAYS`; flagged louder when the same name is still deployed on Railway or Netlify. |
| Languages | Every finding is a code plus parameters, rendered in English or Greek (`src/i18n.ts`). A test enforces that both languages cover every code. |
| Voice | `POST /tools/audit_summary` and `/tools/refresh_audit` return a short spoken summary for the ElevenLabs agent. |
| Web view | `GET /?lang=el&token=…` renders the latest audit as a page. |

Sources fail independently: if one token is missing or a platform is down, Jarvis says so as a finding rather than hiding it.

## Run locally

```bash
cp .env.example .env      # fill in JARVIS_TOKEN and the read-only API tokens
npm install
npm test
set -a; source .env; set +a; npm run dev
```

## Deploy on Railway

1. Create a Railway service from this repository (`railway.json` is included).
2. Set the variables from `.env.example`. Use **read-only** tokens: Railway token with viewer access, a Netlify personal token, and a GitHub fine-grained token with read-only "Metadata" access on the repositories to audit.
3. Generate a public domain, then check `https://<domain>/health`.
4. Create the ElevenLabs agent following `elevenlabs/agent-prompt.md`.

## Endpoints

All except `/health` need `Authorization: Bearer <JARVIS_TOKEN>` (or `x-api-key`; `?token=` is accepted for browser viewing).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness for Railway. No auth. |
| GET | `/` | HTML report. `?lang=el\|en` |
| GET | `/audit/latest` | Latest report as JSON. |
| POST | `/audit/run` | Run a fresh audit now. |
| POST | `/tools/audit_summary` | Spoken summary. Body `{"language":"el"}` |
| POST | `/tools/refresh_audit` | Fresh audit, then spoken summary. |
| POST | `/tools/daily_report` | Spoken Day-N report of the email agent. |
| GET | `/inbox` | Mobile approval inbox (approve, edit, reject). |
| GET | `/api/cases`, `/api/stats`, `/api/report`, `/api/status` | Cases, learning statistics, report, configuration state. |
| POST | `/api/poll` | Check the mailbox now. |
| POST | `/api/cases/:id/decide` | `{"type":"approve","text":"..."}` or `{"type":"reject"}`. Approve creates a Gmail draft only. |

## Known limits

- The Railway source targets Railway's public GraphQL API and has been written against its documented schema but **not yet run against a live token**. Its first real run may need small query fixes. The Netlify and GitHub sources follow the same pattern.
- Reports live in memory and are rebuilt on boot and every `AUDIT_INTERVAL_HOURS`. History in Postgres is the next step.
- It checks platform state, not whether an app answers correctly: there are no live URL probes yet.
- `?token=` puts the secret in URLs and browser history. Fine for one trusted user; replace with real login before sharing.

See `STATUS.md` for the roadmap.

## Email agent (v0.2)

Jarvis reads new client mail, drafts a reply with the Anthropic API using your rules (`rules/jarvis-rules.md`) and your past approved replies, and waits in `/inbox`. Approving creates a draft in Gmail; you press send. Health emails never reach the model, and anything about money or commitments always needs you. Autonomy is switched off and runs in shadow mode: it only records what it would have handled on its own, so you can judge it before anything changes.
