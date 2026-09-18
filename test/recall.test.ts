import { describe, expect, it } from "vitest";
import { formatBrief } from "../src/format.js";
import { BATCH, INJECT_AT, MENTION_AT, recall, rung, stateFor } from "../src/recall.js";
import type { Asker, Entry } from "../src/types.js";

const at = "2026-09-18T10:00:00.000Z";
const entry = (id: string, kind: Entry["kind"], text: string, ref?: string): Entry => {
  const e: Entry = { id, kind, obtained: kind === "measurement" ? "measured" : "told", text, at };
  if (ref) e.ref = ref;
  return e;
};

const pinC = entry("c1", "constraint", "never force-push");
const pinK = entry("k1", "correction", "build only the slice");
const dec = entry("d1", "decision", "hook warns, never blocks", "scope-check.mjs");
const meas = entry("m1", "measurement", "14 decisions cost $0.00059", "triage.mjs");
const thr = entry("t1", "thread", "email sign-in branch parked", "branch x");
const all = [pinC, dec, pinK, meas, thr];

/** Answers only the ids it was given a probability for; the rest stay unanswered. */
const fixed =
  (probs: Record<string, number>): Asker => ({
    async ask(_state, questions) {
      return Object.fromEntries(
        Object.keys(questions)
          .filter((id) => id in probs)
          .map((id) => [id, probs[id]!]),
      );
    },
  });

describe("rungs", () => {
  it("maps probability to inject / mention / omit at the published thresholds", () => {
    expect(rung(INJECT_AT)).toBe("inject");
    expect(rung(INJECT_AT - 0.001)).toBe("mention");
    expect(rung(MENTION_AT)).toBe("mention");
    expect(rung(MENTION_AT - 0.001)).toBe("omit");
  });
});

describe("recall with a scorer", () => {
  it("never scores constraints or corrections, and scores everything else", async () => {
    const seen: string[][] = [];
    const asker: Asker = {
      async ask(_s, q) {
        seen.push(Object.keys(q));
        return Object.fromEntries(Object.keys(q).map((id) => [id, 0.9]));
      },
    };
    const brief = await recall(all, "finish the hook", asker);
    expect(brief.pinned).toEqual([pinC, pinK]);
    expect(seen.flat().sort()).toEqual(["d1", "m1", "t1"]);
    expect(brief.note).toBeUndefined();
  });

  it("lands each entry on the rung its probability says", async () => {
    const brief = await recall(all, "finish the hook", fixed({ d1: 0.87, m1: 0.45, t1: 0.05 }));
    const byId = Object.fromEntries(brief.scored.map((s) => [s.entry.id, s]));
    expect(byId.d1).toMatchObject({ rung: "inject", probability: 0.87 });
    expect(byId.m1).toMatchObject({ rung: "mention", probability: 0.45 });
    expect(byId.t1).toMatchObject({ rung: "omit", probability: 0.05 });
  });

  it("injects an entry the scorer did not answer, rather than dropping it", async () => {
    const brief = await recall(all, "task", fixed({ d1: 0.1 }));
    const byId = Object.fromEntries(brief.scored.map((s) => [s.entry.id, s]));
    expect(byId.d1?.rung).toBe("omit");
    expect(byId.m1).toEqual({ entry: meas, rung: "inject" });
    expect(byId.t1).toEqual({ entry: thr, rung: "inject" });
  });

  it("batches so that no request carries more than BATCH questions, and still merges all answers", async () => {
    const many = Array.from({ length: BATCH * 2 + 3 }, (_, i) =>
      entry(`x${i}`, "thread", `thread ${i}`, `ref ${i}`),
    );
    const sizes: number[] = [];
    const asker: Asker = {
      async ask(_s, q) {
        sizes.push(Object.keys(q).length);
        return Object.fromEntries(Object.keys(q).map((id) => [id, 0.99]));
      },
    };
    const brief = await recall(many, "task", asker);
    expect(sizes).toEqual([BATCH, BATCH, 3]);
    expect(brief.scored.every((s) => s.rung === "inject" && s.probability === 0.99)).toBe(true);
  });

  it("puts only the batch's own entries in the state it sends", async () => {
    const states: string[] = [];
    const asker: Asker = {
      async ask(s, q) {
        states.push(s);
        return Object.fromEntries(Object.keys(q).map((id) => [id, 0.5]));
      },
    };
    await recall(all, "finish the hook", asker);
    expect(states).toHaveLength(1);
    expect(states[0]).toContain("TASK STARTING NOW:\nfinish the hook");
    expect(states[0]).toContain("ENTRY d1");
    expect(states[0]).not.toContain("ENTRY c1");
    expect(states[0]).not.toContain("never force-push");
  });
});

describe("recall falls open", () => {
  it("with no task: pins in full, everything else one line, and says why", async () => {
    const brief = await recall(all, undefined, fixed({}));
    expect(brief.pinned).toEqual([pinC, pinK]);
    expect(brief.scored.every((s) => s.rung === "mention" && s.probability === undefined)).toBe(true);
    expect(brief.note).toMatch(/no task/);
  });

  it("with no scorer: injects everything and says why", async () => {
    const brief = await recall(all, "task", null);
    expect(brief.scored.every((s) => s.rung === "inject")).toBe(true);
    expect(brief.note).toMatch(/AI_GATEWAY_API_KEY/);
  });

  it("when the scorer throws: injects everything and carries the error", async () => {
    const asker: Asker = {
      async ask() {
        throw new Error("rate limited");
      },
    };
    const brief = await recall(all, "task", asker);
    expect(brief.scored.every((s) => s.rung === "inject")).toBe(true);
    expect(brief.note).toMatch(/rate limited/);
  });

  it("never returns fewer entries than it was given, on any path", async () => {
    const paths = [
      recall(all, undefined, fixed({})),
      recall(all, "t", null),
      recall(all, "t", { ask: async () => { throw new Error("x"); } }),
      recall(all, "t", fixed({ d1: 0, m1: 0, t1: 0 })),
    ];
    for (const brief of await Promise.all(paths)) {
      expect(brief.pinned.length + brief.scored.length).toBe(all.length);
    }
  });
});

describe("format", () => {
  it("renders pins first, live entries in full, mentions as one line, and counts omissions", async () => {
    const brief = await recall(all, "finish the hook", fixed({ d1: 0.87, m1: 0.45, t1: 0.05 }));
    const md = formatBrief(brief);
    expect(md.indexOf("## Always")).toBeLessThan(md.indexOf("## Live for this task"));
    expect(md.indexOf("## Live for this task")).toBeLessThan(md.indexOf("## Also on record"));
    expect(md).toContain("[constraint · told · 2026-09-18] never force-push");
    expect(md).toContain("[decision · told · 2026-09-18 · p=0.87] hook warns, never blocks");
    expect(md).toContain("  ref: scope-check.mjs");
    expect(md).toContain("- m1 · measurement · 14 decisions cost $0.00059 (p=0.45)");
    expect(md).toContain("_1 entry not relevant to this task, omitted._");
    expect(md).not.toContain("email sign-in");
  });

  it("says so when the ledger is empty", () => {
    expect(formatBrief({ pinned: [], scored: [] })).toContain("_The ledger is empty._");
  });

  it("stateFor carries ref and refresh so the scorer can see what an entry points at", () => {
    const s = stateFor("t", [{ ...meas, refresh: "not reproducible" }]);
    expect(s).toContain("ref: triage.mjs");
    expect(s).toContain("refresh: not reproducible");
  });
});
