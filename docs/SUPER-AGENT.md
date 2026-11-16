# Super-agent architecture

Goal: automate Ashlar's daily work with the owner as the approver. Agents do the work up to the last step; the owner taps approve.

```
 triggers (mail poll, schedule, API, voice)
            │
      SUPER-AGENT  (src/super/orchestrator.ts)
      runs agents → proposals → approval queue → executor → audit log
            │
 ┌──────────┼───────────┬────────────┬───────────┬──────────┐
 Mail       Documents   Daily Ops    Quotes      Renewals   Carriers   (later: Claims, Compliance)
 (live)     (live)      (live)       (next)      (next)     (next)
```

## Rules that never change
1. Agents propose; only the owner's tap executes (`decide`, `decideProposal`).
2. Health content never reaches a model. Money and commitments are drafted, never sent from here.
3. Send and sign are separate switches (`ALLOW_SEND`, `ALLOW_SIGN`), off by default.
4. Autonomy is earned per category from approval history, starts in shadow mode, and needs a reviewed change to enable.
5. Every step is in the audit log. Failures become `failed` proposals, never crashes.

## Autonomy ladder (per action kind)
- L0 propose only (all kinds today)
- L1 execute on one tap (`ALLOW_SEND`, `ALLOW_SIGN`)
- L2 auto-execute for a category after N approvals with ≥90% unchanged (shadow mode records it today)

## Agents
| Agent | Does | Status |
|---|---|---|
| Mail | Reads inbox, classifies, drafts replies in Chris's voice, learns from edits | live (drafts, approve-and-send) |
| Documents | Fills PDF forms, review → sign → send chain | live (on request via API) |
| Daily Ops | Morning brief: waiting cases, platform findings | live |
| Quotes | Takes a request, calls Proposal Studio / Adviser OS, proposes the quote email | next |
| Renewals | Finds policies renewing in 60/30/15 days, proposes outreach | next |
| Carriers | Chases insurers with open requests, tracks replies | next |
| Intake | Turns email attachments into document requests automatically | next |

## Next slices
1. Intake: mail with a form attachment → `prepareDocument` proposal, filled from client data.
2. Quotes agent through the Adviser OS API (the existing "super agent" in Ashlar-aggregator).
3. Renewals and carrier follow-ups on a schedule.
4. Per-category autonomy switch after a week of shadow results.
