import type { Store } from "../agent/types.js";

/** Specialist agents the super-agent can run. Each one only PROPOSES; the owner decides. */
export type AgentId = "mail" | "documents" | "daily_ops";

/** What approving a proposal does. `email.send` and `doc.sign` are switched off by default. */
export type ActionKind = "note" | "doc.prepare" | "doc.sign" | "email.send";

export type ProposalStatus = "pending" | "executed" | "rejected" | "failed";

export interface Attachment {
  name: string;
  mime: string;
  base64: string;
}

export interface Proposal {
  id: string;
  agent: AgentId;
  kind: ActionKind;
  title: string;
  summary: string;
  /** Kind-specific data (recipient, text, attachment, signature placement, ...). */
  payload: Record<string, unknown>;
  reasons: string[];
  status: ProposalStatus;
  createdAt: string;
  decidedAt?: string;
  result?: string;
  error?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string; // "agent:<id>" | "owner" | "system"
  event: string;
  proposalId?: string;
  detail?: string;
}

export interface SafetySwitches {
  /** Owner clicked "approve and send": actually send email. Off by default. */
  allowSend: boolean;
  /** Owner clicked "approve and sign": apply the stored signature image. Off by default. */
  allowSign: boolean;
}

export interface Sender {
  send(to: string, subject: string, text: string, attachment?: Attachment, threadId?: string): Promise<void>;
}

export interface SuperDeps {
  store: Store;
  now: () => Date;
  switches: SafetySwitches;
  sender: Sender;
  /** Owner's signature as a PNG, base64. Never leaves the service. */
  signaturePng?: string;
  agents: Agent[];
}

export type NewProposal = Omit<Proposal, "id" | "status" | "createdAt">;

export interface Agent {
  id: AgentId;
  /** Looks at the world and returns what it would like to do. Must not act. */
  run(d: SuperDeps): Promise<NewProposal[]>;
}
