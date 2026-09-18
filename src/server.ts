/**
 * The MCP server: two tools over stdio. Kept apart from cli.ts so it can be
 * imported by tests without starting a server.
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatBrief } from "./format.js";
import { gatewayAsker } from "./gateway.js";
import { active, append, ledgerPath, readLedger } from "./ledger.js";
import { recall } from "./recall.js";
import { KINDS, OBTAINED, type Brief, type NewEntry } from "./types.js";

/** One source of truth for the version: package.json. */
export const VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

const RECORD_DESCRIPTION = `Append one fact to this project's ledger, at the moment it is produced. \
Call it right after: the user states a rule or a boundary (constraint); the user corrects something \
you did (correction); you choose between alternatives (decision — say why in text, and ref where it \
is recorded); a tool result yields a figure you will rely on (measurement — ref the command, refresh \
says whether it reproduces); work is parked, blocked, or handed to someone (thread — ref the branch, \
PR, or issue). Decisions, measurements and threads must carry a ref. Write text so it says WHAT the \
thing is before WHY: recall scores entries against a future task by their text, and an entry that \
only explains a reason will not be found by the task it belongs to. To retire an earlier entry pass \
its id in supersedes; the old entry stays on disk, marked replaced. Nothing here is ever deleted.`;

const RECALL_DESCRIPTION = `Bring forward what earlier sessions recorded, scored against the task you are \
about to do. Call it once, at the start of a task, with the task in one sentence. Constraints and \
corrections come back in full every time. Everything else is scored for whether not knowing it \
would cause wrong or repeated work: high scores come back in full, middling ones as one line, the \
rest are omitted. Without a task it lists everything one line each. If scoring is unavailable it \
returns everything and says so — it never returns less than the ledger holds without telling you.`;

/** The slice of a transport this module touches; the SDK's Transport satisfies it. */
export interface OrderableTransport {
  onmessage?: ((message: JSONRPCMessage, extra?: unknown) => void) | undefined;
  send: (message: JSONRPCMessage, options?: unknown) => Promise<void>;
}

/**
 * Deliver tool calls to the server one at a time, in arrival order, each only
 * after the previous one has sent its response. Without this the SDK validates
 * arguments asynchronously before invoking a handler, and a burst of pipelined
 * calls can interleave — a recall could read the ledger before the record just
 * ahead of it had appended. Other messages (initialize, list, notifications)
 * pass straight through.
 *
 * A cancelled call gets no response from the SDK, so `notifications/cancelled`
 * releases the queue for that id. A cancel that arrives for a call still
 * waiting in the queue passes through before the call is delivered and is
 * lost; that call then runs normally, which is harmless for these two tools.
 */
export function orderToolCalls(transport: OrderableTransport): void {
  const deliver = transport.onmessage;
  if (!deliver) return;
  const send = transport.send.bind(transport);
  const settled = new Map<RequestId, () => void>();
  let chain: Promise<void> = Promise.resolve();

  const idOf = (message: JSONRPCMessage): RequestId | undefined =>
    (message as { id?: RequestId }).id;
  const release = (id: RequestId | undefined): void => {
    if (id !== undefined) settled.get(id)?.();
  };

  transport.send = async (message, options) => {
    await send(message, options);
    if ("result" in message || "error" in message) release(idOf(message));
  };
  transport.onmessage = (message, extra) => {
    const id = idOf(message);
    const method = "method" in message ? message.method : undefined;
    if (method === "notifications/cancelled") {
      const params = (message as { params?: { requestId?: RequestId } }).params;
      release(params?.requestId);
      deliver(message, extra);
      return;
    }
    if (method !== "tools/call" || id === undefined) {
      deliver(message, extra);
      return;
    }
    chain = chain.then(
      () =>
        new Promise<void>((done) => {
          settled.set(id, () => {
            settled.delete(id);
            done();
          });
          deliver(message, extra);
        }),
    );
  };
}

/** Recall over a ledger file, noting any lines that could not be read. */
export async function recallFrom(path: string, task: string | undefined): Promise<Brief> {
  const { entries, unreadable } = readLedger(path);
  const brief = await recall(active(entries), task, gatewayAsker());
  if (unreadable > 0) {
    const warning =
      unreadable === 1
        ? "1 unreadable line in the ledger was skipped, not removed"
        : `${unreadable} unreadable lines in the ledger were skipped, not removed`;
    brief.note = brief.note ? `${brief.note}; ${warning}` : warning;
  }
  return brief;
}

export function buildServer(path: string): McpServer {
  const server = new McpServer({ name: "carryforward", version: VERSION });

  server.registerTool(
    "record",
    {
      title: "Record to the ledger",
      description: RECORD_DESCRIPTION,
      inputSchema: {
        kind: z.enum(KINDS).describe("constraint | correction | decision | measurement | thread"),
        obtained: z
          .enum(OBTAINED)
          .describe("how the claim was obtained: measured | decided | told | inferred"),
        text: z
          .string()
          .min(1)
          .describe("the claim, one or two sentences; say what it is, then why"),
        ref: z
          .string()
          .optional()
          .describe(
            "what it points at: a command, PR, issue, commit, file path or URL. Required for decision, measurement, thread",
          ),
        refresh: z
          .string()
          .optional()
          .describe("how to re-derive it, or the words 'not reproducible'"),
        supersedes: z.string().optional().describe("id of an earlier entry this one replaces"),
      },
    },
    async (args) => {
      try {
        const draft: NewEntry = { kind: args.kind, obtained: args.obtained, text: args.text };
        if (args.ref !== undefined) draft.ref = args.ref;
        if (args.refresh !== undefined) draft.refresh = args.refresh;
        if (args.supersedes !== undefined) draft.supersedes = args.supersedes;
        const entry = append(path, draft);
        return { content: [{ type: "text", text: `recorded ${entry.kind} ${entry.id}` }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `not recorded: ${message}` }] };
      }
    },
  );

  server.registerTool(
    "recall",
    {
      title: "Recall for a task",
      description: RECALL_DESCRIPTION,
      inputSchema: {
        task: z.string().optional().describe("the task about to start, in one sentence"),
      },
    },
    async ({ task }) => {
      const brief = await recallFrom(path, task);
      return { content: [{ type: "text", text: formatBrief(brief) }] };
    },
  );

  return server;
}

export async function serve(): Promise<void> {
  const server = buildServer(ledgerPath());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  orderToolCalls(transport);
}
