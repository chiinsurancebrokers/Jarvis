import type { Flags } from "./types.js";

/** Lowercase and strip Greek/Latin accents so "Νοσηλεία" and "νοσηλεια" match. */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const MONEY = ["€", "eur ", "euro", "ευρω", "iban", "premium", "ασφαλιστρο", "πληρωμη", "payment", "δοση", "instalment", "installment", "invoice", "τιμολογι"];
const HEALTH = [
  "νοσηλει", "νοσοκομ", "χειρουργ", "διαγνωση", "θεραπει", "εξετασει", "ασθεν", "φαρμακ", "ιατρικ", "γιατρ",
  "hospital", "surgery", "diagnos", "treatment", "medical", "medication", "patient", "illness", "disease",
];
const COMMITMENT = [
  "εγγυω", "εγγυαται", "εγγυηση", "υποσχ", "δεσμευ", "καλυπτεται πληρως", "σιγουρα καλυπτεται",
  "guarantee", "promise", "we commit", "fully covered", "definitely covered", "will be covered",
];

const hit = (text: string, words: string[]) => {
  const f = fold(text);
  return words.some((w) => f.includes(w));
};

/** Flags on the INCOMING message. Health content never reaches the LLM. */
export const inspectIncoming = (text: string): Flags => ({
  money: hit(text, MONEY),
  health: hit(text, HEALTH),
  commitment: false,
});

/** Flags on a DRAFTED reply. Any flag means a person must review. */
export const inspectDraft = (text: string): Flags => ({
  money: hit(text, MONEY),
  health: hit(text, HEALTH),
  commitment: hit(text, COMMITMENT),
});

export const anyFlag = (...f: Flags[]) => f.some((x) => x.money || x.health || x.commitment);

/** Mask bank and card numbers before any text leaves for the LLM. */
export const redact = (text: string): string =>
  text
    .replace(/\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}\b/g, "[IBAN]")
    .replace(/\b\d{13,19}\b/g, "[NUMBER]");
