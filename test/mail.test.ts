import { describe, expect, it } from "vitest";
import { buildReplyMime, extractBody } from "../src/mail/gmail.js";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("gmail helpers", () => {
  it("prefers text/plain in nested multipart", () => {
    const body = extractBody({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
        { mimeType: "multipart/related", parts: [{ mimeType: "text/plain", body: { data: b64("plain Καλημέρα") } }] },
      ],
    });
    expect(body).toBe("plain Καλημέρα");
  });
  it("falls back to stripped html", () => {
    expect(extractBody({ mimeType: "text/html", body: { data: b64("<p>Hi <b>there</b></p>") } })).toBe(" Hi there ");
  });
  it("builds a threaded reply MIME with an encoded subject", () => {
    const mime = buildReplyMime({ id: "1", threadId: "t", messageId: "<x@y>", from: "a@b.gr", subject: "Ερώτηση", body: "", receivedAt: "" }, "Γεια");
    expect(mime).toContain("In-Reply-To: <x@y>");
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(mime).not.toMatch(/^(Bcc|Cc):/m);
  });
});
