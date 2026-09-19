#!/usr/bin/env node
/**
 * The executable. With no arguments it serves MCP over stdio. `recall [task]`
 * prints a brief to stdout, which is what a session-start hook wants. `path`
 * prints where this project's file lives.
 */
import { formatBrief } from "./format.js";
import { ledgerPath } from "./ledger.js";
import { recallFrom, serve } from "./server.js";

/** True when a brief holds nothing worth putting in front of anyone. */
export function isEmpty(brief: { pinned: unknown[]; scored: unknown[] }): boolean {
  return brief.pinned.length === 0 && brief.scored.length === 0;
}

export async function cli(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "recall") {
    // `--quiet` prints nothing when there is nothing to say, so a session-start
    // hook adds no noise before anything has been recorded.
    const quiet = rest.some((a) => a === "--quiet" || a === "-q");
    const task = rest.filter((a) => a !== "--quiet" && a !== "-q").join(" ").trim() || undefined;
    const brief = await recallFrom(ledgerPath(), task);
    if (quiet && isEmpty(brief)) return 0;
    process.stdout.write(`${formatBrief(brief)}\n`);
    return 0;
  }

  if (command === "path") {
    process.stdout.write(`${ledgerPath()}\n`);
    return 0;
  }

  if (command === undefined || command === "serve") {
    await serve();
    return 0;
  }

  process.stderr.write(
    `carryforward: unknown command "${command}" (use: serve | recall [--quiet] [task] | path)\n`,
  );
  return 2;
}

cli(process.argv.slice(2))
  .then((code) => {
    if (code !== 0) process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`carryforward: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
