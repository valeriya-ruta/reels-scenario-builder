import { MCP_TOOLS, parseToolCall } from '@/lib/mcp/tools';

/**
 * The MCP wire protocol — JSON-RPC 2.0 over one HTTP endpoint, pure.
 *
 * Nothing here knows about Supabase or Next.js: it turns a message into either
 * a response or a call for the executor to run. That split is what lets the
 * whole protocol be tested without a database, and it is why the route handler
 * is thirty lines instead of three hundred.
 *
 * Deliberately STATELESS. The Streamable HTTP transport allows a server to keep
 * sessions and stream over SSE; this one does neither, because every tool here
 * is a single request/response and a session id would only be state to lose
 * between two serverless invocations.
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** Versions we will happily speak if a client asks for one by name. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

export const MCP_SERVER_INFO = {
  name: 'ruta-content',
  title: 'Ruta — контент-план',
  version: '1.0.0',
} as const;

export type JsonRpcId = string | number | null;

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

/** What a tool hands back: a sentence for the model, and the raw object. */
export type ToolResult = { text: string; structured?: unknown; isError?: boolean };

export type ToolExecutor = (
  call: Extract<ReturnType<typeof parseToolCall>, { ok: true }>['call'],
) => Promise<ToolResult>;

export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** A tool answer, in the shape `tools/call` returns. */
function toolPayload(result: ToolResult): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: result.text }],
    ...(result.structured === undefined ? {} : { structuredContent: result.structured }),
    isError: result.isError === true,
  };
}

/**
 * The version to answer `initialize` with.
 *
 * If the client named a version we know, agree to it — a client that speaks
 * only 2024-11-05 gets a server that speaks 2024-11-05. Otherwise state ours
 * and let the client decide whether it can live with it, which is what the
 * spec asks for.
 */
export function negotiateVersion(requested: unknown): string {
  const asked = typeof requested === 'string' ? requested.trim() : '';
  return SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION;
}

/**
 * Handle one JSON-RPC message.
 *
 * Returns null for a notification (no id) — the caller answers those with a
 * bare 202, since JSON-RPC forbids a response body for them.
 */
export async function handleMessage(
  message: unknown,
  execute: ToolExecutor,
): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return fail(null, RPC_ERRORS.invalidRequest, 'expected a JSON-RPC object');
  }

  const msg = message as Record<string, unknown>;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const hasId = 'id' in msg && msg.id !== null && msg.id !== undefined;
  const id = (hasId ? (msg.id as JsonRpcId) : null) as JsonRpcId;
  const params = (msg.params && typeof msg.params === 'object' ? msg.params : {}) as Record<string, unknown>;

  if (!method) return fail(id, RPC_ERRORS.invalidRequest, 'missing method');

  // Notifications carry no id and get no answer, whatever they say.
  if (!hasId) return null;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          'Цей сервер пише контент у застосунок Ruta. Спочатку list_content, щоб побачити, що вже заплановано, потім create_reel / create_story / create_carousel / create_idea. Дати — YYYY-MM-DD.',
      });

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const parsed = parseToolCall(name, params.arguments);
      if (!parsed.ok) {
        // A bad argument is the model's mistake to fix, not a broken transport:
        // it comes back as a tool RESULT so the model reads it and retries,
        // rather than as a protocol error it cannot see.
        return ok(id, toolPayload({ text: parsed.error, isError: true }));
      }
      try {
        return ok(id, toolPayload(await execute(parsed.call)));
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        return ok(id, toolPayload({ text: `Не вдалося виконати: ${detail}`, isError: true }));
      }
    }

    // Declared-but-empty capabilities still get asked about by some clients.
    case 'resources/list':
      return ok(id, { resources: [] });
    case 'prompts/list':
      return ok(id, { prompts: [] });

    default:
      return fail(id, RPC_ERRORS.methodNotFound, `unknown method "${method}"`);
  }
}

/**
 * Handle a whole request body: one message, or a batch from an older client.
 *
 * Batching left the spec in 2025-06-18, but a 2024-11-05 client may still send
 * an array and nothing is gained by refusing it.
 */
export async function handleBody(
  body: unknown,
  execute: ToolExecutor,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, RPC_ERRORS.invalidRequest, 'empty batch');
    const answers = await Promise.all(body.map((m) => handleMessage(m, execute)));
    const real = answers.filter((a): a is JsonRpcResponse => a !== null);
    return real.length > 0 ? real : null;
  }
  return handleMessage(body, execute);
}
