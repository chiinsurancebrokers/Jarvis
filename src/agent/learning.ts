import type { Category, CategoryStats, Decision, Example, Store } from "./types.js";

export async function categoryStats(store: Store): Promise<Partial<Record<Category, CategoryStats>>> {
  const out: Partial<Record<Category, CategoryStats>> = {};
  for (const d of await store.list<Decision>("decisions")) {
    const s = (out[d.category] ??= { decisions: 0, approvedUnchanged: 0, approvedEdited: 0, rejected: 0 });
    s.decisions++;
    if (d.outcome === "rejected") s.rejected++;
    else if (d.edited) s.approvedEdited++;
    else s.approvedUnchanged++;
  }
  return out;
}

/** Newest approved replies of the same category, preferring the same language. */
export async function pickExamples(store: Store, category: Category, language: string, n = 4): Promise<Example[]> {
  const all = (await store.list<Example>("examples"))
    .filter((e) => e.category === category)
    .sort((a, b) => b.at.localeCompare(a.at));
  const same = all.filter((e) => e.language === language);
  return [...same, ...all.filter((e) => e.language !== language)].slice(0, n);
}
