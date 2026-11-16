import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Bundled Unicode font: the default PDF fonts cannot draw Greek.
const fontBytes = () => readFileSync(new URL("../../assets/fonts/DejaVuSans.ttf", import.meta.url));

export interface FillResult {
  bytes: Uint8Array;
  filled: string[];
  /** Requested fields the form does not have. A person should look at these. */
  missing: string[];
}

/** Fills the text fields of an AcroForm PDF. Fields are not flattened, so the owner can still edit. */
export async function fillForm(template: Uint8Array, fields: Record<string, string>): Promise<FillResult> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes(), { subset: true });
  const form = doc.getForm();
  const filled: string[] = [];
  const missing: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    try {
      form.getTextField(name).setText(value);
      filled.push(name);
    } catch {
      missing.push(name);
    }
  }
  form.updateFieldAppearances(font);
  return { bytes: await doc.save(), filled, missing };
}

export interface Placement {
  page: number; // 0-based
  x: number;
  y: number;
  width: number;
}

/** Stamps the owner's signature image and flattens the form so the signed content cannot change. */
export async function applySignature(pdf: Uint8Array, png: Uint8Array, at: Placement): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes(), { subset: true });
  const form = doc.getForm();
  form.updateFieldAppearances(font);
  form.flatten();
  const page = doc.getPage(at.page);
  const img = await doc.embedPng(png);
  const height = (img.height / img.width) * at.width;
  page.drawImage(img, { x: at.x, y: at.y, width: at.width, height });
  return doc.save();
}

export async function pageCount(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}
