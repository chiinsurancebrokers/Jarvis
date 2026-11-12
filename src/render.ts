import { describe, labelsFor } from "./i18n.js";
import type { Lang, Report, Severity } from "./types.js";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderHtml(report: Report, lang: Lang): string {
  const l = labelsFor(lang);
  const groups = (["critical", "warning", "info"] as Severity[])
    .map((sev) => {
      const items = report.findings.filter((f) => f.severity === sev);
      if (items.length === 0) return "";
      return `<h2>${esc(l.severity[sev])} (${items.length})</h2><ul>${items
        .map((f) => `<li><b>${esc(f.platform)}</b> · ${esc(describe(f, lang))}</li>`)
        .join("")}</ul>`;
    })
    .join("");
  const body = report.findings.length === 0 ? `<p>${esc(l.clean)}</p>` : groups;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(l.title)}</title>
<style>body{font-family:-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:32px auto;padding:0 18px;color:#2E2C27}
h1{font-size:24px}h2{font-size:15px;margin-top:28px}li{margin:8px 0;line-height:1.45}p.m{color:#6B6A63;font-size:14px}</style></head>
<body><h1>${esc(l.title)}</h1><p class="m">${esc(report.generatedAt)} · ${esc(l.counts(report))}</p>${body}</body></html>`;
}
