/**
 * The ledger: one JSON object per line, append-only, one file per project.
 *
 * Nothing is ever rewritten or deleted here. An entry is retired by appending
 * a new one that names it in `supersedes`; the old line stays on disk so a
 * reversed decision remains visible as reversed.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { KINDS, OBTAINED, POINTER, type Entry, type NewEntry } from "./types.js";

/** A readable, collision-resistant name for a project's ledger file. */
export function projectSlug(cwd: string): string {
  // Split on both separators so a Windows path slugs the same on any platform.
  const last = cwd.split(/[\\/]+/).filter(Boolean).pop() ?? "";
  const base =
    last
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  // Windows paths are case-insensitive; `C:\x` and `c:\x` are the same project.
  const key = process.platform === "win32" ? cwd.toLowerCase() : cwd;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 6);
  return `${base}-${hash}`;
}

export interface LedgerLocation {
  dir?: string;
  project?: string;
  cwd?: string;
}

export function ledgerPath(loc: LedgerLocation = {}): string {
  const dir = loc.dir ?? process.env.CARRYFORWARD_DIR ?? join(homedir(), ".carryforward");
  const project =
    loc.project ?? process.env.CARRYFORWARD_PROJECT ?? projectSlug(loc.cwd ?? process.cwd());
  return join(dir, `${project}.jsonl`);
}

/** Entries that have not been superseded by a later one. */
export function active(entries: readonly Entry[]): Entry[] {
  const retired = new Set(entries.map((e) => e.supersedes).filter((id): id is string => !!id));
  return entries.filter((e) => !retired.has(e.id));
}

/** Returns a reason the entry is invalid, or null when it is fine. */
export function validate(e: NewEntry, existing: readonly Entry[] = []): string | null {
  if (!KINDS.includes(e.kind)) return `kind must be one of: ${KINDS.join(", ")}`;
  if (!OBTAINED.includes(e.obtained)) return `obtained must be one of: ${OBTAINED.join(", ")}`;
  if (!e.text || !e.text.trim()) return "text is required";
  if (POINTER.includes(e.kind) && !(e.ref && e.ref.trim())) {
    return `a ${e.kind} must carry a ref — the command, pull request, commit, file or URL it points at`;
  }
  const supersedes = e.supersedes?.trim();
  if (supersedes) {
    if (!existing.some((x) => x.id === supersedes)) {
      return `supersedes ${supersedes}: no such entry in this ledger`;
    }
    if (!active(existing).some((x) => x.id === supersedes)) {
      return `supersedes ${supersedes}: that entry has already been replaced`;
    }
  }
  return null;
}

export interface Ledger {
  entries: Entry[];
  /** Lines that were not valid JSON — a crash mid-write, a full disk. They are skipped, never removed. */
  unreadable: number;
}

/**
 * Reads every line it can. A damaged line must not take the whole ledger with
 * it: it is counted and skipped, and the caller says so in the brief.
 */
export function readLedger(path: string): Ledger {
  if (!existsSync(path)) return { entries: [], unreadable: 0 };
  const entries: Entry[] = [];
  let unreadable = 0;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as Partial<Entry>;
      if (typeof parsed.id === "string" && typeof parsed.kind === "string") {
        entries.push(parsed as Entry);
      } else {
        unreadable++;
      }
    } catch {
      unreadable++;
    }
  }
  return { entries, unreadable };
}

export function readAll(path: string): Entry[] {
  return readLedger(path).entries;
}

export function append(path: string, e: NewEntry): Entry {
  const existing = readAll(path);
  const reason = validate(e, existing);
  if (reason) throw new Error(reason);
  const entry: Entry = {
    id: randomBytes(4).toString("hex"),
    at: new Date().toISOString(),
    kind: e.kind,
    obtained: e.obtained,
    text: e.text.trim(),
  };
  if (e.ref && e.ref.trim()) entry.ref = e.ref.trim();
  if (e.refresh && e.refresh.trim()) entry.refresh = e.refresh.trim();
  const supersedes = e.supersedes?.trim();
  if (supersedes) entry.supersedes = supersedes;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}
