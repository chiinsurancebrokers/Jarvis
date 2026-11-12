import type { Case } from "./agent/types.js";
import type { Lang } from "./types.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const t = {
  en: {
    title: "Approval inbox", empty: "Nothing is waiting for you.", approve: "Approve → Gmail draft", reject: "Reject",
    needs: "Needs you", pending: "Draft ready", why: "Why a person must look", from: "From",
    note: "Approving only creates a draft in Gmail. You press send yourself.", reply: "Reply",
  },
  el: {
    title: "Εισερχόμενα προς έγκριση", empty: "Δεν περιμένει τίποτα εσένα.", approve: "Έγκριση → προσχέδιο Gmail", reject: "Απόρριψη",
    needs: "Χρειάζεται εσένα", pending: "Έτοιμο προσχέδιο", why: "Γιατί πρέπει να το δει άνθρωπος", from: "Από",
    note: "Η έγκριση δημιουργεί μόνο προσχέδιο στο Gmail. Το στέλνεις εσύ.", reply: "Απάντηση",
  },
} satisfies Record<Lang, Record<string, string>>;

export function renderInbox(cases: Case[], lang: Lang, token: string): string {
  const l = t[lang];
  const open = cases
    .filter((c) => c.status === "pending" || c.status === "needs_human")
    .sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "needs_human" ? -1 : 1));
  const card = (c: Case) => `
  <article class="card" data-id="${esc(c.id)}">
    <div class="tag ${c.status}">${c.status === "needs_human" ? l.needs : l.pending}</div>
    <h2>${esc(c.item.subject || "(no subject)")}</h2>
    <p class="meta">${l.from}: ${esc(c.item.from)}</p>
    ${c.triage ? `<p>${esc(c.triage.summary)}</p>` : ""}
    <pre class="orig">${esc(c.item.body.slice(0, 1200))}</pre>
    ${c.routeReasons.length ? `<p class="why"><b>${l.why}:</b> ${c.routeReasons.map(esc).join("; ")}</p>` : ""}
    <label>${l.reply}</label>
    <textarea rows="7">${esc(c.draft ?? "")}</textarea>
    <div class="row">
      <button class="ok" data-act="approve">${l.approve}</button>
      <button class="no" data-act="reject">${l.reject}</button>
    </div>
  </article>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${l.title}</title>
<style>
body{margin:0;font:16px/1.45 -apple-system,"Segoe UI",sans-serif;background:#fcfcfb;color:#2e2c27}
main{max-width:720px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:22px;margin:8px 0 4px}.note{color:#6b6a63;font-size:14px;margin:0 0 16px}
.card{border:1px solid #e4e3dc;background:#fff;padding:14px;margin:0 0 16px;border-radius:8px}
.card h2{font-size:17px;margin:6px 0}.meta{color:#6b6a63;font-size:13px;margin:0 0 8px}
.tag{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;background:#eee}
.tag.needs_human{background:#f6e0d8;color:#8a3a1d}
.orig{white-space:pre-wrap;background:#f9f9f7;padding:10px;border-radius:6px;font:13px/1.4 inherit;max-height:180px;overflow:auto}
.why{font-size:13px;color:#8a3a1d}label{display:block;font-size:13px;color:#6b6a63;margin-top:8px}
textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #d9d8d0;border-radius:6px}
.row{display:flex;gap:8px;margin-top:10px}button{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid;cursor:pointer}
.ok{background:#c6613f;border-color:#c6613f;color:#fcfcfb}.no{background:#fff;border-color:#d9d8d0;color:#2e2c27}
button:disabled{opacity:.5}
</style></head><body><main>
<h1>${l.title}</h1><p class="note">${l.note}</p>
${open.length ? open.map(card).join("") : `<p>${l.empty}</p>`}
</main>
<script>
const TOKEN=${JSON.stringify(token)};
document.addEventListener("click",async(e)=>{
  const b=e.target.closest("button[data-act]"); if(!b) return;
  const card=b.closest(".card"); b.disabled=true;
  const act=b.dataset.act, text=card.querySelector("textarea").value;
  const r=await fetch("/api/cases/"+encodeURIComponent(card.dataset.id)+"/decide",{method:"POST",
    headers:{"content-type":"application/json",authorization:"Bearer "+TOKEN},
    body:JSON.stringify(act==="approve"?{type:"approve",text}:{type:"reject"})});
  if(r.ok) card.remove(); else {b.disabled=false; alert((await r.json().catch(()=>({}))).error||"Error");}
});
</script></body></html>`;
}
