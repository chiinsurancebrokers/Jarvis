import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fillForm, pageCount, type Placement } from "../../docs/pdf.js";
import type { Agent, NewProposal } from "../types.js";

export interface PrepareRequest {
  /** A file name inside TEMPLATES_DIR (no paths), or raw PDF bytes as base64. */
  template?: string;
  templateBase64?: string;
  fields: Record<string, string>;
  /** Ask for a signing step after review. */
  sign?: Placement;
  /** Ask for a send step after signing. */
  email?: { to: string; subject: string; text: string; threadId?: string };
}

const safeName = (n: string) => {
  const b = basename(n);
  if (b !== n || !/^[\w.\- ]+\.pdf$/i.test(b)) throw new Error("template must be a plain .pdf file name");
  return b;
};

/**
 * Documents agent. A request becomes a CHAIN of proposals the owner approves one tap at a time:
 * review the filled form, then sign it, then send it. Each later step is created only after the one before.
 */
export async function prepareDocument(templatesDir: string, req: PrepareRequest): Promise<NewProposal> {
  const template = req.templateBase64
    ? Buffer.from(req.templateBase64, "base64")
    : await readFile(join(templatesDir, safeName(req.template ?? "")));
  const { bytes, filled, missing } = await fillForm(template, req.fields);
  const name = req.template ? safeName(req.template) : "document.pdf";
  const attachment = { name, mime: "application/pdf", base64: Buffer.from(bytes).toString("base64") };

  if (req.sign && req.sign.page >= (await pageCount(bytes))) throw new Error("signature page does not exist");

  const send = req.email
    ? { kind: "email.send" as const, title: `Send ${name}`, summary: `To ${req.email.to}: ${req.email.subject}`, payload: { ...req.email } }
    : undefined;
  const sign = req.sign
    ? { kind: "doc.sign" as const, title: `Sign ${name}`, summary: "Apply your signature and flatten the form.", payload: { placement: req.sign, ...(send ? { followUp: send } : {}) } }
    : undefined;
  const next = sign ?? send;

  return {
    agent: "documents", kind: "doc.prepare", title: `Review ${name}`,
    summary: `Filled ${filled.length} field(s)${missing.length ? `, ${missing.length} not found in the form: ${missing.join(", ")}` : ""}.`,
    payload: { attachment, filled, missing, ...(next ? { followUp: next } : {}) },
    reasons: missing.length ? ["some fields were not found: check the form"] : [],
  };
}

/** No autonomous trigger yet: documents are prepared on request (POST /api/docs/prepare). */
export const documents: Agent = { id: "documents", run: async () => [] };
