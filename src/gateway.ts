/**
 * The default scorer: TypeSafe's Jev, reached through the Vercel AI Gateway.
 *
 * Jev is an evaluation model, not a text generator — it answers typed
 * questions about a state with calibrated probabilities. That is the whole
 * reason it fits here: the ledger never needs anything written, only
 * ranked. The gateway route is the one whose retention terms are published
 * (zero data retention, no training) and it is reachable only through the AI
 * SDK's `experimental_evaluate`, not the chat-completions endpoints.
 */
import type { Asker } from "./types.js";

export const MODEL = "typesafe-ai/jev";

/** Question keys must be identifiers; ledger ids can start with a digit. */
const KEY = (id: string) => `e_${id}`;
const UNKEY = (key: string) => key.replace(/^e_/, "");

export function gatewayAsker(env: NodeJS.ProcessEnv = process.env): Asker | null {
  if (!env.AI_GATEWAY_API_KEY) return null;
  return {
    async ask(state, questions) {
      const { experimental_evaluate: evaluate } = await import("ai");
      const typed = Object.fromEntries(
        Object.entries(questions).map(([id, instructions]) => [
          KEY(id),
          {
            type: "boolean" as const,
            instructions,
            criteria: {
              true: "the task would go wrong, or repeat work already done, without this entry",
              false: "the task can proceed correctly without knowing this entry",
            },
          },
        ]),
      );
      const res = await evaluate({ model: MODEL, state, questions: typed });
      const out: Record<string, number> = {};
      for (const [key, answer] of Object.entries(res.answers as Record<string, unknown>)) {
        const p = (answer as { probability?: unknown }).probability;
        if (typeof p === "number") out[UNKEY(key)] = p;
      }
      return out;
    },
  };
}
