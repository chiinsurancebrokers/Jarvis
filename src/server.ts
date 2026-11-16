import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { getLatest, runAudit, setLatest } from "./audit.js";
import { buildRuntime } from "./agent/runtime.js";
import { dayReportText, dayStats } from "./agent/report.js";
import { decide, poll, type Action } from "./agent/workflow.js";
import type { Case, Decision } from "./agent/types.js";
import { categoryStats } from "./agent/learning.js";
import { config, switches } from "./config.js";
import { decideProposal, runAgents, type ProposalAction } from "./super/orchestrator.js";
import { prepareDocument, type PrepareRequest } from "./super/agents/documents.js";
import type { AuditEntry, Proposal } from "./super/types.js";
import { renderInbox } from "./inbox.js";
import { spokenSummary } from "./i18n.js";
import { renderHtml } from "./render.js";
import type { Lang } from "./types.js";

if (!config.token) {
  console.error("JARVIS_TOKEN is not set. Refusing to start without authentication.");
  process.exit(1);
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const pickLang = (v: unknown): Lang => (v === "el" || v === "en" ? v : config.defaultLang);

const app = new Hono();
const rt = buildRuntime();

app.get("/health", (c) => c.json({ ok: true }));

// Everything below needs the shared token: Bearer header, x-api-key header, or ?token= (browser view).
app.use("*", async (c, next) => {
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = bearer ?? c.req.header("x-api-key") ?? c.req.query("token") ?? "";
  if (!safeEqual(provided, config.token)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

async function current() {
  const existing = getLatest();
  if (existing) return existing;
  const fresh = await runAudit();
  setLatest(fresh);
  return fresh;
}

app.get("/", async (c) => c.html(renderHtml(await current(), pickLang(c.req.query("lang")))));

app.get("/audit/latest", async (c) => c.json(await current()));

app.post("/audit/run", async (c: Context) => {
  const report = await runAudit();
  setLatest(report);
  return c.json(report);
});

// Voice-agent tools (ElevenLabs "server tools" call these with a JSON body).
app.post("/tools/audit_summary", async (c) => {
  const body = await c.req.json().catch(() => ({}) as { language?: string });
  const lang = pickLang((body as { language?: string }).language);
  return c.json({ summary: spokenSummary(await current(), lang) });
});

app.post("/tools/refresh_audit", async (c) => {
  const body = await c.req.json().catch(() => ({}) as { language?: string });
  const lang = pickLang((body as { language?: string }).language);
  const report = await runAudit();
  setLatest(report);
  return c.json({ summary: spokenSummary(report, lang) });
});

// ---- Agent: approval inbox, polling, learning stats, daily report ----
app.get("/inbox", async (c) => {
  const cases = await rt.deps.store.list<Case>("cases");
  const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.header("x-api-key") ?? c.req.query("token") ?? "";
  const proposals = await rt.sup.store.list<Proposal>("proposals");
  return c.html(renderInbox(cases, pickLang(c.req.query("lang")), token, { proposals, allowSend: switches.allowSend, allowSign: switches.allowSign }));
});

app.get("/api/status", (c) =>
  c.json({ ...rt.ready, autonomy: rt.deps.cfg, shadowOnly: true, allowSend: switches.allowSend, allowSign: switches.allowSign }));

// ---- Super-agent: proposals from the specialist agents, approved one tap at a time ----
app.get("/api/proposals", async (c) => c.json(await rt.sup.store.list<Proposal>("proposals")));
app.get("/api/audit", async (c) => c.json((await rt.sup.store.list<AuditEntry>("audit")).slice(-200)));
app.post("/api/agents/run", async (c) => c.json({ created: (await runAgents(rt.sup)).length }));

app.post("/api/proposals/:id/decide", async (c) => {
  const body = (await c.req.json().catch(() => null)) as ProposalAction | null;
  if (!body || (body.type !== "approve" && body.type !== "reject")) return c.json({ error: "bad request" }, 400);
  try {
    return c.json(await decideProposal(rt.sup, c.req.param("id"), body));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

// Documents agent: fill a PDF form; the owner then reviews, signs and sends step by step.
app.post("/api/docs/prepare", async (c) => {
  const body = (await c.req.json().catch(() => null)) as PrepareRequest | null;
  if (!body?.fields || (!body.template && !body.templateBase64)) return c.json({ error: "template and fields are required" }, 400);
  try {
    const np = await prepareDocument(config.templatesDir, body);
    const id = (await import("node:crypto")).randomUUID().replace(/-/g, "").slice(0, 16);
    const p: Proposal = { ...np, id, status: "pending", createdAt: new Date().toISOString() };
    await rt.sup.store.put("proposals", id, p);
    return c.json({ id, summary: p.summary, reasons: p.reasons });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

app.get("/api/cases", async (c) => c.json(await rt.deps.store.list<Case>("cases")));

app.get("/api/stats", async (c) => c.json(await categoryStats(rt.deps.store)));

app.post("/api/poll", async (c) => {
  try {
    return c.json({ created: await poll(rt.deps) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});

app.post("/api/cases/:id/decide", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Action | null;
  if (!body || (body.type !== "approve" && body.type !== "approve_send" && body.type !== "reject")) return c.json({ error: "bad request" }, 400);
  try {
    return c.json(await decide(rt.deps, c.req.param("id"), body));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});

async function report(lang: Lang) {
  const cases = await rt.deps.store.list<Case>("cases");
  const decisions = await rt.deps.store.list<Decision>("decisions");
  return dayReportText(dayStats(cases, decisions, new Date()), lang);
}

app.get("/api/report", async (c) => c.json({ report: await report(pickLang(c.req.query("lang"))) }));

app.post("/tools/daily_report", async (c) => {
  const body = await c.req.json().catch(() => ({}) as { language?: string });
  return c.json({ summary: await report(pickLang((body as { language?: string }).language)) });
});

serve({ fetch: app.fetch, port: config.port }, (i) =>
  console.log(`Jarvis listening on :${i.port}`),
);

// Background refresh so the first question of the day is answered instantly.
const refresh = () =>
  runAudit()
    .then(setLatest)
    .catch((e) => console.error("audit failed", e));
void refresh();
setInterval(refresh, config.auditIntervalHours * 3_600_000).unref();

// Run the specialist agents (morning brief etc.) every hour. They only propose.
setInterval(() => runAgents(rt.sup).catch((e) => console.error("agents failed", e instanceof Error ? e.message : e)), 3_600_000).unref();
void runAgents(rt.sup).catch(() => undefined);

// Poll the mailbox on a timer. Failures are logged, never fatal.
if (rt.ready.mail && rt.ready.llm) {
  const tick = () => poll(rt.deps).catch((e) => console.error("poll failed", e instanceof Error ? e.message : e));
  void tick();
  setInterval(tick, config.pollMinutes * 60_000).unref();
}
