import type { Lang } from "../types.js";

export type Category = "client_question" | "carrier_followup" | "quote_request" | "other";
export const CATEGORIES: Category[] = ["client_question", "carrier_followup", "quote_request", "other"];

export interface InboxItem {
  /** Provider message id; used for de-duplication. */
  id: string;
  threadId: string;
  /** RFC 5322 Message-ID header, for threading the reply. */
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export interface Flags {
  money: boolean;
  health: boolean;
  commitment: boolean;
}

export interface Triage {
  category: Category;
  language: Lang | "other";
  summary: string;
  confidence: number;
  needsHuman: boolean;
  reasons: string[];
  draft: string | null;
}

export type CaseStatus = "pending" | "needs_human" | "approved" | "rejected";

export interface Case {
  id: string;
  item: InboxItem;
  inFlags: Flags;
  triage: Triage | null;
  draft: string | null;
  status: CaseStatus;
  /** True when autonomy rules WOULD have allowed sending without approval (shadow mode). */
  shadowAuto: boolean;
  /** Why the case needs a person: guard flags, low confidence, thin history, etc. */
  routeReasons: string[];
  createdAt: string;
  decidedAt?: string;
  finalText?: string;
  edited?: boolean;
}

export interface Decision {
  id: string;
  category: Category;
  outcome: "approved" | "rejected";
  edited: boolean;
  at: string;
}

export interface Example {
  id: string;
  category: Category;
  language: string;
  incoming: string;
  reply: string;
  at: string;
}

export interface CategoryStats {
  decisions: number;
  approvedUnchanged: number;
  approvedEdited: number;
  rejected: number;
}

export interface AutonomyConfig {
  /** Master switch. Off by default: every case needs approval. */
  enabled: boolean;
  /** Categories that may ever become eligible. */
  categories: Category[];
  minDecisions: number;
  /** Share of decisions that were approved with no edit. */
  minUnchangedRate: number;
  minConfidence: number;
}

export type Llm = (system: string, user: string) => Promise<string>;

export interface Store {
  put<T>(coll: string, id: string, value: T): Promise<void>;
  get<T>(coll: string, id: string): Promise<T | null>;
  list<T>(coll: string): Promise<T[]>;
}

export interface MailProvider {
  listNewItems(): Promise<InboxItem[]>;
  /** Creates a reply DRAFT in the mailbox. It never sends. */
  createDraftReply(item: InboxItem, text: string): Promise<void>;
}
