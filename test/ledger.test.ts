import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  active,
  append,
  ledgerPath,
  projectSlug,
  readAll,
  readLedger,
  validate,
} from "../src/ledger.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "carryforward-"));
  path = join(dir, "test.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("append and read", () => {
  it("round-trips an entry and assigns id and timestamp", () => {
    const e = append(path, { kind: "constraint", obtained: "told", text: "never force-push" });
    expect(e.id).toMatch(/^[0-9a-f]{8}$/);
    expect(Date.parse(e.at)).toBeGreaterThan(0);
    expect(readAll(path)).toEqual([e]);
  });

  it("is append-only: a second entry does not disturb the first line", () => {
    const a = append(path, { kind: "constraint", obtained: "told", text: "a" });
    const b = append(path, { kind: "correction", obtained: "told", text: "b" });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(a);
    expect(JSON.parse(lines[1]!)).toEqual(b);
  });

  it("reads an empty list when the file does not exist", () => {
    expect(readAll(join(dir, "missing.jsonl"))).toEqual([]);
  });

  it("drops undefined optionals rather than writing them", () => {
    const e = append(path, { kind: "constraint", obtained: "told", text: "x", ref: "  " });
    expect("ref" in e).toBe(false);
    expect(readFileSync(path, "utf8")).not.toContain("ref");
  });
});

describe("pointer kinds must carry a ref", () => {
  it.each(["decision", "measurement", "thread"] as const)("%s without ref is rejected", (kind) => {
    expect(validate({ kind, obtained: "decided", text: "something" })).toMatch(/must carry a ref/);
    expect(() => append(path, { kind, obtained: "decided", text: "something" })).toThrow(
      /must carry a ref/,
    );
  });

  it.each(["constraint", "correction"] as const)("%s needs no ref", (kind) => {
    expect(validate({ kind, obtained: "told", text: "something" })).toBeNull();
  });

  it("rejects an empty text and an unknown kind", () => {
    expect(validate({ kind: "constraint", obtained: "told", text: "   " })).toMatch(/text is required/);
    expect(validate({ kind: "rule" as never, obtained: "told", text: "x" })).toMatch(/kind must be/);
  });
});

describe("supersession", () => {
  it("hides the superseded entry from active() but keeps it on disk", () => {
    const old = append(path, { kind: "decision", obtained: "decided", text: "use A", ref: "PR #1" });
    const neu = append(path, {
      kind: "decision",
      obtained: "decided",
      text: "use B, A was reversed",
      ref: "PR #2",
      supersedes: old.id,
    });
    const all = readAll(path);
    expect(all).toHaveLength(2);
    expect(active(all)).toEqual([neu]);
  });

  it("refuses to supersede an id that is not in the ledger", () => {
    expect(() =>
      append(path, { kind: "constraint", obtained: "told", text: "x", supersedes: "deadbeef" }),
    ).toThrow(/no such entry/);
  });

  it("refuses to supersede an entry that has already been replaced", () => {
    const a = append(path, { kind: "constraint", obtained: "told", text: "a" });
    append(path, { kind: "constraint", obtained: "told", text: "b", supersedes: a.id });
    expect(() =>
      append(path, { kind: "constraint", obtained: "told", text: "d", supersedes: a.id }),
    ).toThrow(/already been replaced/);
    expect(active(readAll(path))).toHaveLength(1);
  });

  it("treats an empty supersedes as absent", () => {
    const e = append(path, { kind: "constraint", obtained: "told", text: "x", supersedes: "  " });
    expect("supersedes" in e).toBe(false);
  });

  it("follows a chain A <- B <- C and leaves only C active", () => {
    const a = append(path, { kind: "constraint", obtained: "told", text: "a" });
    const b = append(path, { kind: "constraint", obtained: "told", text: "b", supersedes: a.id });
    const c = append(path, { kind: "constraint", obtained: "told", text: "c", supersedes: b.id });
    expect(active(readAll(path))).toEqual([c]);
  });
});

describe("damaged lines", () => {
  it("skips a truncated line, counts it, and keeps reading", () => {
    const good = append(path, { kind: "constraint", obtained: "told", text: "good" });
    appendFileSync(path, '{"id":"aaaa0002","kind":"deci\n', "utf8");
    const after = append(path, { kind: "constraint", obtained: "told", text: "after" });
    const ledger = readLedger(path);
    expect(ledger.unreadable).toBe(1);
    expect(ledger.entries).toEqual([good, after]);
    expect(readFileSync(path, "utf8")).toContain('"kind":"deci');
  });

  it("skips a well-formed JSON line that is not an entry", () => {
    appendFileSync(path, '{"hello":"world"}\n', "utf8");
    expect(readLedger(path)).toEqual({ entries: [], unreadable: 1 });
  });

  it("does not let a damaged line block recording", () => {
    appendFileSync(path, "not json at all\n", "utf8");
    expect(() => append(path, { kind: "constraint", obtained: "told", text: "x" })).not.toThrow();
  });
});

describe("location", () => {
  it("derives a readable, stable slug from the cwd", () => {
    const a = projectSlug("C:\\Users\\x\\Projects\\My App");
    expect(a).toMatch(/^my-app-[0-9a-f]{6}$/);
    expect(projectSlug("C:\\Users\\x\\Projects\\My App")).toBe(a);
    expect(projectSlug("/home/x/Projects/My App")).not.toBe(a);
  });

  it("honours explicit dir and project over the environment", () => {
    expect(ledgerPath({ dir: "/tmp/led", project: "p" })).toBe(join("/tmp/led", "p.jsonl"));
  });
});
