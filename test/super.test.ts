import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/agent/store.js";
import type { Case, InboxItem, MailProvider } from "../src/agent/types.js";
import { decide, type Deps } from "../src/agent/workflow.js";
import { applySignature, fillForm } from "../src/docs/pdf.js";
import { buildMime } from "../src/mail/gmail.js";
import { prepareDocument } from "../src/super/agents/documents.js";
import { decideProposal, runAgents } from "../src/super/orchestrator.js";
import type { Agent, AuditEntry, Proposal, SuperDeps } from "../src/super/types.js";

// 1x1 transparent PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function formPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const f = doc.getForm().createTextField("name");
  f.addToPage(page, { x: 20, y: 200, width: 200, height: 24 });
  return doc.save();
}

function sup(over: Partial<SuperDeps> = {}, sent: string[] = []): SuperDeps {
  return {
    store: new MemoryStore(), now: () => new Date("2026-11-16T09:00:00Z"),
    switches: { allowSend: false, allowSign: false },
    sender: { send: async (to, subject) => void sent.push(`${to}|${subject}`) },
    signaturePng: PNG, agents: [], ...over,
  };
}

describe("orchestrator", () => {
  const agent: Agent = { id: "daily_ops", run: async () => [{ agent: "daily_ops", kind: "note", title: "Brief", summary: "s", payload: {}, reasons: [] }] };

  it("proposes once per day and never executes by itself", async () => {
    const d = sup({ agents: [agent] });
    expect((await runAgents(d)).length).toBe(1);
    expect((await runAgents(d)).length).toBe(0);
    const [p] = await d.store.list<Proposal>("proposals");
    expect(p.status).toBe("pending");
  });

  it("a crashing agent does not stop the others", async () => {
    const bad: Agent = { id: "mail", run: async () => { throw new Error("boom"); } };
    const d = sup({ agents: [bad, agent] });
    expect((await runAgents(d)).length).toBe(1);
    expect((await d.store.list<AuditEntry>("audit")).some((a) => a.event === "agent_error")).toBe(true);
  });

  it("refuses to send or sign while the switches are off, and leaves the proposal pending", async () => {
    const sent: string[] = [];
    const d = sup({}, sent);
    const mk = (kind: Proposal["kind"], id: string) =>
      d.store.put<Proposal>("proposals", id, { id, agent: "documents", kind, title: "t", summary: "s", payload: { to: "a@b.gr", subject: "x", text: "y", attachment: { name: "a.pdf", mime: "application/pdf", base64: "" } }, reasons: [], status: "pending", createdAt: "" });
    await mk("email.send", "s1");
    await mk("doc.sign", "s2");
    await expect(decideProposal(d, "s1", { type: "approve" })).rejects.toThrow(/switched off/);
    await expect(decideProposal(d, "s2", { type: "approve" })).rejects.toThrow(/switched off/);
    expect(sent).toEqual([]);
    expect((await d.store.get<Proposal>("proposals", "s1"))!.status).toBe("pending");
  });

  it("chains review -> sign -> send, one owner approval each, and sends the signed file", async () => {
    const sent: string[] = [];
    const d = sup({ switches: { allowSend: true, allowSign: true } }, sent);
    const np = await prepareDocument("templates", {
      templateBase64: Buffer.from(await formPdf()).toString("base64"),
      fields: { name: "Μαρία Παπαδοπούλου", nope: "x" },
      sign: { page: 0, x: 20, y: 150, width: 80 },
      email: { to: "carrier@example.com", subject: "Application", text: "Please find attached." },
    });
    expect(np.summary).toMatch(/1 not found/);
    await d.store.put<Proposal>("proposals", "p1", { ...np, id: "p1", status: "pending", createdAt: "" });
    await decideProposal(d, "p1", { type: "approve" });
    expect(sent).toEqual([]); // reviewing sends nothing
    const [sign] = (await d.store.list<Proposal>("proposals")).filter((p) => p.kind === "doc.sign");
    await decideProposal(d, sign.id, { type: "approve" });
    expect(sent).toEqual([]); // signing sends nothing
    const [send] = (await d.store.list<Proposal>("proposals")).filter((p) => p.kind === "email.send");
    expect((send.payload.attachment as { name: string }).name).toBe("document-signed.pdf");
    await decideProposal(d, send.id, { type: "approve" });
    expect(sent).toEqual(["carrier@example.com|Application"]);
    const log = (await d.store.list<AuditEntry>("audit")).map((a) => a.event);
    expect(log.filter((e) => e === "approved").length).toBe(3);
  });

  it("a failing sender becomes a failed proposal, not a crash", async () => {
    const d = sup({ switches: { allowSend: true, allowSign: false }, sender: { send: async () => { throw new Error("smtp down"); } } });
    await d.store.put<Proposal>("proposals", "s", { id: "s", agent: "documents", kind: "email.send", title: "t", summary: "s", payload: { to: "a@b.gr", subject: "x", text: "y" }, reasons: [], status: "pending", createdAt: "" });
    expect((await decideProposal(d, "s", { type: "approve" })).status).toBe("failed");
  });
});

describe("pdf", () => {
  it("fills Greek text and reports unknown fields", async () => {
    const r = await fillForm(await formPdf(), { name: "Ελένη Γεωργίου", other: "x" });
    expect(r.filled).toEqual(["name"]);
    expect(r.missing).toEqual(["other"]);
  });
  it("stamps a signature and flattens the form", async () => {
    const filled = await fillForm(await formPdf(), { name: "Test" });
    const signed = await applySignature(filled.bytes, Buffer.from(PNG, "base64"), { page: 0, x: 10, y: 10, width: 50 });
    expect((await PDFDocument.load(signed)).getForm().getFields().length).toBe(0);
  });
});

describe("mime", () => {
  it("rejects header injection and builds an attachment", () => {
    expect(() => buildMime("a@b.gr\r\nBcc: x@y.z", "s", "t")).toThrow();
    expect(buildMime("a@b.gr", "Θέμα", "t", { name: "a.pdf", mime: "application/pdf", base64: "QUJD" })).toMatch(/multipart\/mixed/);
  });
});

describe("approve and send (email)", () => {
  const item: InboxItem = { id: "m", threadId: "t", messageId: "<a>", from: "m@x.gr", subject: "Docs?", body: "Which documents?", receivedAt: "" };
  const mk = (over: Partial<Case> = {}): Case => ({
    id: "m", item, inFlags: { money: false, health: false, commitment: false }, triage: null, draft: "Please send your ID.",
    status: "pending", shadowAuto: false, routeReasons: [], createdAt: "", ...over,
  });
  const deps = async (allowSend: boolean, c: Case, sent: string[]): Promise<Deps> => {
    const store = new MemoryStore();
    await store.put("cases", c.id, c);
    const mail: MailProvider = { listNewItems: async () => [], createDraftReply: async () => undefined, sendReply: async (_i, t) => void sent.push(t) };
    return { store, llm: async () => "", mail, rules: "", cfg: { enabled: false, categories: [], minDecisions: 20, minUnchangedRate: 0.9, minConfidence: 0.8 }, now: () => new Date(), allowSend };
  };

  it("sends only when the switch is on", async () => {
    const sent: string[] = [];
    await expect(decide(await deps(false, mk(), sent), "m", { type: "approve_send" })).rejects.toThrow(/switched off/);
    expect(sent).toEqual([]);
    const c = await decide(await deps(true, mk(), sent), "m", { type: "approve_send" });
    expect(c.sent).toBe(true);
    expect(sent).toEqual(["Please send your ID."]);
  });

  it("never sends health, money or commitments, even with the switch on", async () => {
    const sent: string[] = [];
    await expect(decide(await deps(true, mk({ handler: "asklepios" }), sent), "m", { type: "approve_send" })).rejects.toThrow(/draft/);
    await expect(decide(await deps(true, mk({ draft: "The premium is 300 €" }), sent), "m", { type: "approve_send" })).rejects.toThrow(/draft/);
    await expect(decide(await deps(true, mk({ draft: "This is fully covered" }), sent), "m", { type: "approve_send" })).rejects.toThrow(/draft/);
    expect(sent).toEqual([]);
  });
});
