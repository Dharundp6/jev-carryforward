/**
 * Read-time selection. The ledger is written dumb and complete; this is the
 * only place a model is consulted, and it is consulted with the task already
 * known — the task is the query.
 *
 * Constraints and corrections are never scored. Everything else gets one
 * yes/no question, and its probability lands it on one of three rungs. A
 * wrong answer here costs nothing permanent: the ledger is intact and the
 * next task re-scores it.
 *
 * Every failure path — no task, no key, scorer error — falls open to
 * injecting everything with a note saying why. Selection is never the reason
 * a session starts with less than it had.
 */
import { PINNED, type Asker, type Brief, type Entry, type Rung, type Scored } from "./types.js";

export const INJECT_AT = 0.6;
export const MENTION_AT = 0.3;
/** Entries per scorer request; keeps state plus questions well under Jev's request limit. */
export const BATCH = 25;

export function rung(probability: number): Rung {
  if (probability >= INJECT_AT) return "inject";
  if (probability >= MENTION_AT) return "mention";
  return "omit";
}

export function question(e: Entry): string {
  return (
    `Entry ${e.id} is still live for the task starting now: ` +
    `not knowing it would cause wrong or repeated work.`
  );
}

export function stateFor(task: string, entries: readonly Entry[]): string {
  const lines = [`TASK STARTING NOW:`, task.trim(), ``, `ENTRIES ON RECORD:`];
  for (const e of entries) {
    lines.push(``, `ENTRY ${e.id} — ${e.kind}, ${e.obtained}, recorded ${e.at.slice(0, 10)}`);
    lines.push(e.text);
    if (e.ref) lines.push(`ref: ${e.ref}`);
    if (e.refresh) lines.push(`refresh: ${e.refresh}`);
  }
  return lines.join("\n");
}

function allAt(entries: readonly Entry[], r: Rung): Scored[] {
  return entries.map((entry) => ({ entry, rung: r }));
}

export async function recall(
  entries: readonly Entry[],
  task: string | undefined,
  asker: Asker | null,
): Promise<Brief> {
  const pinned = entries.filter((e) => PINNED.includes(e.kind));
  const candidates = entries.filter((e) => !PINNED.includes(e.kind));

  if (!task || !task.trim()) {
    return {
      pinned,
      scored: allAt(candidates, "mention"),
      note: "unscored: no task given, so everything is listed one line each — call again with the task to score",
    };
  }
  if (!asker) {
    return {
      task,
      pinned,
      scored: allAt(candidates, "inject"),
      note: "unscored: AI_GATEWAY_API_KEY is not set, so everything is injected",
    };
  }

  const probabilities = new Map<string, number>();
  try {
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const questions = Object.fromEntries(batch.map((e) => [e.id, question(e)]));
      const answers = await asker.ask(stateFor(task, batch), questions);
      for (const [id, p] of Object.entries(answers)) {
        if (typeof p === "number" && Number.isFinite(p)) probabilities.set(id, p);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      task,
      pinned,
      scored: allAt(candidates, "inject"),
      note: `unscored: scorer failed (${message}), so everything is injected`,
    };
  }

  const scored: Scored[] = candidates.map((entry) => {
    const p = probabilities.get(entry.id);
    return p === undefined ? { entry, rung: "inject" } : { entry, rung: rung(p), probability: p };
  });
  return { task, pinned, scored };
}
