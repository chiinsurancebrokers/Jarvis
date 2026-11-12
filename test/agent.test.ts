import { describe, expect, it } from "vitest";
import { inspectDraft, inspectIncoming, redact } from "../src/agent/guard.js";
import { categoryStats } from "../src/agent/learning.js";
import { decideRoute } from "../src/agent/policy.js";
import { dayReportText, dayStats } from "../src/agent/report.js";
import { MemoryStore } from "../src/agent/store.js";
import { parseTriage } from "../src/agent/triage.js";
import type { AutonomyConfig, Case, Decision, InboxItem, MailProvider, Triage } from "../src/agent/types.js";
import { decide, poll, processItem, type Deps } from "../src/agent/workflow.js";

const none = { money: false, health: false, commitment: false };
const triage = (o: Partial<Triage> = {}): Triage => ({
  category: "client_question", language: "en", summary: "s", confidence: 0.95, needsHuman: false, reasons: [], draft: "Hello", ...o,
});
const cfg: AutonomyConfig = { enabled: true, categories: ["client_question"], minDecisions: 3, minUnchangedRate: 0.8, minConfidence: 0.8 };
const stats = { decisions: 10, approvedUnchanged: 10, approvedEdited: 0, rejected: 0 };

const item = (o: Partial<InboxItem> = {}): InboxItem => ({
  id: "m1", threadId: "t1", messageId: "<a@b>", from: "Maria <m@x.gr>", subject: "Question", body: "Which documents do I need?", receivedAt: "2026-11-12T08:00:00Z", ...o,
});

const reply = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ category: "client_question", language: "en", summary: "docs", confidence: 0.95, needs_human: false, reasons: [], draft: "Please send your ID.", ...o });

function deps(llmText: string, drafts: string[] = []): Deps {
  const mail: MailProvider = { listNewItems: async () => [item()], createDraftReply: async (_i, t) => void drafts.push(t) };
  return { store: new MemoryStore(), llm: async () => llmText, mail, rules: "rules", cfg, now: () => new Date("2026-11-12T09:00:00Z") };
}

describe("guard", () => {
  it("flags Greek health words regardless of accents", () => {
    expect(inspectIncoming("Έχω νοσηλεία στο νοσοκομείο").health).toBe(true);
    expect(inspectIncoming("νοσηλεια").health).toBe(true);
  });
  it("flags money and commitments in drafts", () => {
    expect(inspectDraft("The premium is 300 €").money).toBe(true);
    expect(inspectDraft("This is fully covered").commitment).toBe(true);
    expect(inspectDraft("Please send your ID").commitment).toBe(false);
  });
  it("redacts IBANs and card numbers", () => {
    const out = redact("IBAN GR1601101250000000012300695 card 4111111111111111");
    expect(out).not.toMatch(/GR16|4111/);
  });
});

describe("policy", () => {
  const base = { triage: triage(), inFlags: none, draftFlags: none, stats, cfg };
  it("is eligible only when every condition holds", () => {
    expect(decideRoute(base).route).toBe("auto_eligible");
  });
  it("needs approval while autonomy is off", () => {
    expect(decideRoute({ ...base, cfg: { ...cfg, enabled: false } }).route).toBe("needs_approval");
  });
  it("needs approval with thin history, low confidence or edited history", () => {
    expect(decideRoute({ ...base, stats: { ...stats, decisions: 2 } }).route).toBe("needs_approval");
    expect(decideRoute({ ...base, triage: triage({ confidence: 0.5 }) }).route).toBe("needs_approval");
    expect(decideRoute({ ...base, stats: { decisions: 10, approvedUnchanged: 5, approvedEdited: 5, rejected: 0 } }).route).toBe("needs_approval");
  });
  it("hard flags always win", () => {
    expect(decideRoute({ ...base, inFlags: { ...none, money: true } }).route).toBe("needs_approval");
    expect(decideRoute({ ...base, draftFlags: { ...none, commitment: true } }).route).toBe("needs_approval");
  });
});

describe("parseTriage", () => {
  it("defaults to needing a person unless explicitly false", () => {
    expect(parseTriage('{"category":"other"}').needsHuman).toBe(true);
    expect(parseTriage(reply()).needsHuman).toBe(false);
  });
  it("rejects replies without JSON", () => {
    expect(() => parseTriage("sorry")).toThrow();
  });
});

describe("workflow", () => {
  it("never sends health emails to the LLM", async () => {
    let called = false;
    const d = deps(reply());
    d.llm = async () => { called = true; return reply(); };
    const c = await processItem(d, item({ body: "Έχω νοσηλεία" }));
    expect(called).toBe(false);
    expect(c?.status).toBe("needs_human");
    expect(c?.draft).toBeNull();
  });
  it("creates a pending case and does not duplicate", async () => {
    const d = deps(reply());
    expect((await processItem(d, item()))?.status).toBe("pending");
    expect(await processItem(d, item())).toBeNull();
  });
  it("marks shadowAuto false while history is thin", async () => {
    const c = await processItem(deps(reply()), item());
    expect(c?.shadowAuto).toBe(false);
  });
  it("turns an LLM failure into a needs_human case, not a crash", async () => {
    const d = deps("");
    d.llm = async () => { throw new Error("down"); };
    const c = await processItem(d, item());
    expect(c?.status).toBe("needs_human");
    expect(c?.routeReasons[0]).toMatch(/agent unavailable/);
  });
  it("approve creates only a draft and records learning", async () => {
    const drafts: string[] = [];
    const d = deps(reply(), drafts);
    await poll(d);
    const done = await decide(d, "m1", { type: "approve", text: "Edited reply" });
    expect(drafts).toEqual(["Edited reply"]);
    expect(done.status).toBe("approved");
    expect(done.edited).toBe(true);
    const s = (await categoryStats(d.store)).client_question;
    expect(s?.approvedEdited).toBe(1);
    expect(await d.store.list("examples")).toHaveLength(1);
    await expect(decide(d, "m1", { type: "reject" })).rejects.toThrow(/already decided/);
  });
  it("reject records a decision and creates no draft", async () => {
    const drafts: string[] = [];
    const d = deps(reply(), drafts);
    await poll(d);
    await decide(d, "m1", { type: "reject" });
    expect(drafts).toHaveLength(0);
    expect((await categoryStats(d.store)).client_question?.rejected).toBe(1);
  });
});

describe("report", () => {
  it("renders in both languages with real numbers", () => {
    const c = { id: "1", status: "pending", shadowAuto: true, createdAt: "2026-11-12T07:00:00Z" } as Case;
    const dec = { id: "2", category: "other", outcome: "approved", edited: false, at: "2026-11-12T08:00:00Z" } as Decision;
    const s = dayStats([c], [dec], new Date("2026-11-12T09:00:00Z"));
    expect(s).toMatchObject({ day: 1, received: 1, waiting: 1, approved: 1, wouldAuto: 1 });
    expect(dayReportText(s, "en")).toContain("Day 1 report");
    expect(dayReportText(s, "el")).toContain("Αναφορά ημέρας 1");
  });
});
