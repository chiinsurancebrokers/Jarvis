# Status

## Done (v0.1)
- Read-only audit of Railway, Netlify and GitHub with rule-based findings
- English and Greek output, enforced by tests
- Authenticated HTTP API, HTML view, and voice-agent tool endpoints
- Railway deployment config and ElevenLabs agent prompt

## Done (v0.2, approval-first email agent)
- Gmail intake (unread inbox, no promotions/social/updates) and reply DRAFT creation. Nothing is ever sent.
- LLM triage and drafting (Anthropic API) with the owner's rules in `rules/jarvis-rules.md`
- Hard guards: health emails skip the LLM; money and commitment content always needs a person; IBAN/card redaction
- Learning: approved and edited replies become few-shot examples; per-category approval statistics
- Autonomy policy engine in SHADOW mode only: it records what it would have auto-handled, it does not act
- Mobile approval inbox at `/inbox`, plus `/api/cases`, `/api/stats`, `/api/poll`, `/api/report`
- Bilingual Day-N report and `/tools/daily_report` voice tool
- Postgres store when `DATABASE_URL` is set, in-memory otherwise (in-memory loses history on restart)

## Next
1. Deploy on Railway with Postgres, set the env vars, run against live data
2. Create the ElevenLabs agent and connect the three tools
3. Review a week of shadow results, then decide whether to allow sending for one category
4. Carrier follow-ups and quote-request intake as dedicated flows
5. Live URL probes and "what changed since yesterday"
6. Optional, with explicit approval flow: redeploy / restart actions

## Deliberately out of scope for now
- Sending email without a person pressing send
- Any write action on Railway, Netlify or GitHub
- Storing policy numbers, health data or payment data
