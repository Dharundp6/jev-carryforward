import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { orderToolCalls } from "../src/server.js";

/**
 * A stand-in for the protocol layer: it "handles" each tool call with a delay
 * chosen so that later calls would finish first if nothing ordered them, and
 * sends the response through the transport when done.
 */
function fakeTransport(delaysById: Record<number, number>, handled: number[]) {
  const sent: JSONRPCMessage[] = [];
  const transport = {
    onmessage: undefined as ((m: JSONRPCMessage) => void) | undefined,
    send: async (m: JSONRPCMessage) => {
      sent.push(m);
    },
  };
  transport.onmessage = (m) => {
    const id = (m as { id?: number }).id;
    if (id === undefined) return;
    setTimeout(() => {
      handled.push(id);
      void transport.send({ jsonrpc: "2.0", id, result: {} });
    }, delaysById[id] ?? 0);
  };
  return { transport, sent };
}

const call = (id: number): JSONRPCMessage => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "record", arguments: {} },
});

const until = (pred: () => boolean) =>
  new Promise<void>((resolve) => {
    const tick = () => (pred() ? resolve() : setTimeout(tick, 5));
    tick();
  });

describe("orderToolCalls", () => {
  it("without it, a slow call ahead of a fast one finishes second", async () => {
    const handled: number[] = [];
    const { transport } = fakeTransport({ 1: 40, 2: 0 }, handled);
    transport.onmessage!(call(1));
    transport.onmessage!(call(2));
    await until(() => handled.length === 2);
    expect(handled).toEqual([2, 1]);
  });

  it("with it, calls are handled strictly in arrival order regardless of speed", async () => {
    const handled: number[] = [];
    const { transport, sent } = fakeTransport({ 1: 40, 2: 0, 3: 10 }, handled);
    orderToolCalls(transport);
    transport.onmessage!(call(1));
    transport.onmessage!(call(2));
    transport.onmessage!(call(3));
    await until(() => handled.length === 3);
    expect(handled).toEqual([1, 2, 3]);
    expect(sent.map((m) => (m as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it("does not hold up messages that are not tool calls", async () => {
    const handled: number[] = [];
    const { transport } = fakeTransport({ 1: 40, 2: 0 }, handled);
    orderToolCalls(transport);
    transport.onmessage!(call(1));
    transport.onmessage!({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    await until(() => handled.length === 2);
    expect(handled).toEqual([2, 1]);
  });

  it("a cancelled call, which the SDK never answers, releases the queue", async () => {
    const handled: number[] = [];
    const transport = {
      onmessage: undefined as ((m: JSONRPCMessage) => void) | undefined,
      send: async (_m: JSONRPCMessage) => {},
    };
    // The protocol layer: call 1 is aborted and never answered; call 2 answers.
    transport.onmessage = (m) => {
      const id = (m as { id?: number }).id;
      if (id === undefined) return;
      handled.push(id);
      if (id === 2) void transport.send({ jsonrpc: "2.0", id, result: {} });
    };
    orderToolCalls(transport);
    transport.onmessage!(call(1));
    transport.onmessage!(call(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(handled).toEqual([1]); // 2 is stuck behind the unanswered 1
    transport.onmessage!({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });
    await until(() => handled.length === 2);
    expect(handled).toEqual([1, 2]);
  });

  it("an error response releases the queue just like a result", async () => {
    const handled: number[] = [];
    const sent: JSONRPCMessage[] = [];
    const transport = {
      onmessage: undefined as ((m: JSONRPCMessage) => void) | undefined,
      send: async (m: JSONRPCMessage) => {
        sent.push(m);
      },
    };
    transport.onmessage = (m) => {
      const id = (m as { id: number }).id;
      setTimeout(() => {
        handled.push(id);
        void transport.send({ jsonrpc: "2.0", id, error: { code: -32602, message: "bad" } });
      }, 5);
    };
    orderToolCalls(transport);
    transport.onmessage!(call(1));
    transport.onmessage!(call(2));
    await until(() => handled.length === 2);
    expect(handled).toEqual([1, 2]);
  });
});
