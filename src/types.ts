/**
 * The ledger's vocabulary.
 *
 * Five kinds of entry. Two of them — constraint and correction — are pure text
 * and are always carried in full; a model never gets a vote on them. The other
 * three must point at something verifiable (a command, a pull request, a
 * commit, a file, a URL), so the ledger stays small, every claim can be
 * checked rather than trusted, and an entry expires naturally when the thing
 * it points at closes.
 */

export const KINDS = ["constraint", "correction", "decision", "measurement", "thread"] as const;
export type Kind = (typeof KINDS)[number];

/** How the claim was obtained. Keeps a guess from being carried forward as a fact. */
export const OBTAINED = ["measured", "decided", "told", "inferred"] as const;
export type Obtained = (typeof OBTAINED)[number];

/** Kinds that are always injected verbatim and never scored. */
export const PINNED: readonly Kind[] = ["constraint", "correction"];

/** Kinds that must carry a `ref` to something verifiable. */
export const POINTER: readonly Kind[] = ["decision", "measurement", "thread"];

export interface Entry {
  /** Short random id, assigned on append. */
  id: string;
  kind: Kind;
  obtained: Obtained;
  /** The claim, one or two sentences. */
  text: string;
  /** Where it is recorded or what produced it. Required for pointer kinds. */
  ref?: string;
  /** How to re-derive it, or the words "not reproducible". */
  refresh?: string;
  /** Id of an earlier entry this one replaces. The old entry stays on disk, marked superseded. */
  supersedes?: string;
  /** ISO timestamp, assigned on append. */
  at: string;
}

export type NewEntry = Omit<Entry, "id" | "at">;

/** What `recall` decided to do with one scored entry. */
export type Rung = "inject" | "mention" | "omit";

export interface Scored {
  entry: Entry;
  rung: Rung;
  /** Absent when the entry was not scored (no task, no key, or the scorer failed). */
  probability?: number;
}

export interface Brief {
  task?: string;
  /** Constraints and corrections: always present, never scored. */
  pinned: Entry[];
  /** Everything else, with the rung it landed on. */
  scored: Scored[];
  /** Set when scoring did not happen, and why. Absent means every rung is a real score. */
  note?: string;
}

/**
 * The one thing the scorer has to do: given a state string and a set of
 * yes/no questions keyed by entry id, return a probability per id.
 * Implementations decide the transport; the default goes through the Vercel
 * AI Gateway to TypeSafe's Jev.
 */
export interface Asker {
  ask(state: string, questions: Record<string, string>): Promise<Record<string, number>>;
}
