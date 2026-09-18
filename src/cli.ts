#!/usr/bin/env node
/**
 * The executable. With no arguments it serves MCP over stdio. `recall [task]`
 * prints a brief to stdout, which is what a session-start hook wants. `path`
 * prints where this project's ledger lives.
 */
import { formatBrief } from "./format.js";
import { ledgerPath } from "./ledger.js";
import { recallFrom, serve } from "./server.js";

export async function cli(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "recall") {
    const task = rest.join(" ").trim() || undefined;
    const brief = await recallFrom(ledgerPath(), task);
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
    `carryforward: unknown command "${command}" (use: serve | recall [task] | path)\n`,
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
