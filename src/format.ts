/**
 * Renders a brief as Markdown for injection into a session or an agent prompt.
 * Pinned entries first and in full; then what scored as live; then one line
 * each for what is merely on record; then a count of what was left out.
 */
import type { Brief, Entry, Scored } from "./types.js";

function tag(e: Entry, p?: number): string {
  const parts = [e.kind, e.obtained, e.at.slice(0, 10)];
  if (p !== undefined) parts.push(`p=${p.toFixed(2)}`);
  return `[${parts.join(" · ")}]`;
}

function full(e: Entry, p?: number): string {
  const lines = [`- ${tag(e, p)} ${e.text}`];
  if (e.ref) lines.push(`  ref: ${e.ref}`);
  if (e.refresh) lines.push(`  refresh: ${e.refresh}`);
  return lines.join("\n");
}

function oneLine(s: Scored): string {
  const text = s.entry.text.length > 110 ? `${s.entry.text.slice(0, 107)}...` : s.entry.text;
  const p = s.probability === undefined ? "" : ` (p=${s.probability.toFixed(2)})`;
  return `- ${s.entry.id} · ${s.entry.kind} · ${text}${p}`;
}

export function formatBrief(brief: Brief): string {
  const out: string[] = ["# Carried forward"];
  if (brief.task) out.push(`_task: ${brief.task}_`);
  if (brief.note) out.push(`_${brief.note}_`);

  if (brief.pinned.length > 0) {
    out.push("", "## Always — constraints and corrections");
    for (const e of brief.pinned) out.push(full(e));
  }

  const inject = brief.scored.filter((s) => s.rung === "inject");
  const mention = brief.scored.filter((s) => s.rung === "mention");
  const omitted = brief.scored.filter((s) => s.rung === "omit").length;

  if (inject.length > 0) {
    out.push("", "## Live for this task");
    for (const s of inject) out.push(full(s.entry, s.probability));
  }
  if (mention.length > 0) {
    out.push("", "## Also on record");
    for (const s of mention) out.push(oneLine(s));
  }
  if (omitted > 0) out.push("", `_${omitted} entr${omitted === 1 ? "y" : "ies"} not relevant to this task, omitted._`);
  if (brief.pinned.length + brief.scored.length === 0) out.push("", "_The ledger is empty._");
  return out.join("\n");
}
