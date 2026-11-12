# Status

## Done (v0.1)
- Read-only audit of Railway, Netlify and GitHub with rule-based findings
- English and Greek output, enforced by tests
- Authenticated HTTP API, HTML view, and voice-agent tool endpoints
- Railway deployment config and ElevenLabs agent prompt

## Next
1. Run against live tokens on Railway and fix any query issues
2. Create the ElevenLabs agent and connect the two tools
3. Live URL probes (is the app actually answering?)
4. Postgres history and a "what changed since yesterday" briefing
5. Morning briefing: Gmail and calendar, so the voice agent covers business as well as code
6. Optional, with explicit approval flow: redeploy / restart actions

## Deliberately out of scope for now
- Any write action on Railway, Netlify or GitHub
- Client, policy, health or payment data
