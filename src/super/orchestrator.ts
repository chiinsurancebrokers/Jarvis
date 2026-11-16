import { createHash } from "node:crypto";
import { audit } from "./audit.js";
import { applySignature } from "../docs/pdf.js";
import type { Attachment, NewProposal, Proposal, SuperDeps } from "./types.js";

const idFor = (p: NewProposal, day: string) =>
  createHash("sha256").update(`${p.agent}|${p.kind}|${p.title}|${day}`).digest("hex").slice(0, 16);

/** Runs every agent. Proposals are de-duplicated per day; a failing agent never stops the others. */
export async function runAgents(d: SuperDeps): Promise<Proposal[]> {
  const created: Proposal[] = [];
  const day = d.now().toISOString().slice(0, 10);
  for (const agent of d.agents) {
    try {
      for (const np of await agent.run(d)) {
        const id = idFor(np, day);
        if (await d.store.get("proposals", id)) continue;
        const p: Proposal = { ...np, id, status: "pending", createdAt: d.now().toISOString() };
        await d.store.put("proposals", id, p);
        await audit(d, `agent:${agent.id}`, "proposed", id, p.kind);
        created.push(p);
      }
    } catch (e) {
      await audit(d, `agent:${agent.id}`, "agent_error", undefined, e instanceof Error ? e.message : String(e));
    }
  }
  return created;
}

export type ProposalAction = { type: "approve" } | { type: "reject" };

/** Only entry point that turns a proposal into an effect. Switches are checked HERE, not in the agents. */
export async function decideProposal(d: SuperDeps, id: string, action: ProposalAction): Promise<Proposal> {
  const p = await d.store.get<Proposal>("proposals", id);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "pending") throw new Error("proposal already decided");
  p.decidedAt = d.now().toISOString();

  if (action.type === "reject") {
    p.status = "rejected";
    await d.store.put("proposals", id, p);
    await audit(d, "owner", "rejected", id);
    return p;
  }

  // Refuse BEFORE doing anything, and leave the proposal pending so the owner can flip the switch.
  if (p.kind === "email.send" && !d.switches.allowSend) throw new Error("sending is switched off (ALLOW_SEND)");
  if (p.kind === "doc.sign" && !d.switches.allowSign) throw new Error("signing is switched off (ALLOW_SIGN)");
  if (p.kind === "doc.sign" && !d.signaturePng) throw new Error("no signature image is configured (SIGNATURE_PNG_B64)");

  await audit(d, "owner", "approved", id, p.kind);
  try {
    p.result = await execute(d, p);
    p.status = "executed";
    await audit(d, "system", "executed", id, p.kind);
    await enqueueFollowUp(d, p);
  } catch (e) {
    p.status = "failed";
    p.error = e instanceof Error ? e.message : String(e);
    await audit(d, "system", "failed", id, p.error);
  }
  await d.store.put("proposals", id, p);
  return p;
}

async function execute(d: SuperDeps, p: Proposal): Promise<string> {
  switch (p.kind) {
    case "note":
      return "acknowledged";
    case "doc.prepare":
      // Approving a prepared document accepts the content; nothing leaves the service.
      return "document accepted";
    case "doc.sign": {
      const att = p.payload.attachment as Attachment;
      const placement = p.payload.placement as { page: number; x: number; y: number; width: number };
      const signed = await applySignature(Buffer.from(att.base64, "base64"), Buffer.from(d.signaturePng!, "base64"), placement);
      p.payload = { ...p.payload, attachment: { ...att, name: att.name.replace(/\.pdf$/i, "") + "-signed.pdf", base64: Buffer.from(signed).toString("base64") } };
      return "signed";
    }
    case "email.send": {
      const { to, subject, text, attachment, threadId } = p.payload as {
        to: string; subject: string; text: string; attachment?: Attachment; threadId?: string;
      };
      if (!to || !subject || !text) throw new Error("recipient, subject and text are required");
      await d.sender.send(to, subject, text, attachment, threadId);
      return "sent";
    }
  }
}

/** The next step of a chain exists only after the owner approved the one before it. */
async function enqueueFollowUp(d: SuperDeps, p: Proposal) {
  const f = p.payload.followUp as { kind: Proposal["kind"]; title: string; summary: string; payload: Record<string, unknown> } | undefined;
  if (!f) return;
  const np: NewProposal = {
    agent: p.agent, kind: f.kind, title: f.title, summary: f.summary, reasons: [],
    payload: { ...f.payload, attachment: p.payload.attachment },
  };
  const id = createHash("sha256").update(`${p.id}|${f.kind}`).digest("hex").slice(0, 16);
  await d.store.put<Proposal>("proposals", id, { ...np, id, status: "pending", createdAt: d.now().toISOString() });
  await audit(d, `agent:${p.agent}`, "proposed", id, f.kind);
}
