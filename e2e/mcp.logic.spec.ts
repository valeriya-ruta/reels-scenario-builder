import { test, expect } from '@playwright/test';
import { signMcpToken, verifyMcpToken, tokenFromRequest, MCP_TOKEN_PREFIX } from '../lib/mcp/token';
import {
  handleBody,
  handleMessage,
  negotiateVersion,
  MCP_PROTOCOL_VERSION,
  RPC_ERRORS,
  type JsonRpcResponse,
  type ToolResult,
} from '../lib/mcp/protocol';
import { MCP_TOOLS, parseToolCall } from '../lib/mcp/tools';

/**
 * Core-logic spec for the app's MCP server — the credential, the wire protocol
 * and the argument rules. No database and no HTTP: those three are exactly the
 * parts that must not drift, and they are pure, so they are pinned here.
 */

const SECRET = 'test-secret-do-not-use';
const USER = '3f1e6a2c-0000-4000-8000-abcdefabcdef';

function result(response: JsonRpcResponse | null): Record<string, unknown> {
  expect(response).not.toBeNull();
  expect(response).not.toHaveProperty('error');
  return (response as { result: Record<string, unknown> }).result;
}

/** An executor that records what it was handed and answers blandly. */
function spyExecutor() {
  const calls: unknown[] = [];
  const execute = async (call: unknown): Promise<ToolResult> => {
    calls.push(call);
    return { text: 'ok' };
  };
  return { calls, execute };
}

test.describe('mcp token', () => {
  test('a signed token names its user back', () => {
    const token = signMcpToken(USER, SECRET);
    expect(token.startsWith(`${MCP_TOKEN_PREFIX}_`)).toBe(true);
    expect(verifyMcpToken(token, SECRET)).toBe(USER);
  });

  test('the same user and secret always produce the same token', () => {
    expect(signMcpToken(USER, SECRET)).toBe(signMcpToken(USER, SECRET));
  });

  test('another secret does not verify', () => {
    expect(verifyMcpToken(signMcpToken(USER, SECRET), 'another-secret')).toBeNull();
  });

  test('no secret configured means nobody gets in', () => {
    // Fail closed: a missing env var must never read as "no auth required".
    expect(verifyMcpToken(signMcpToken(USER, SECRET), null)).toBeNull();
    expect(verifyMcpToken(signMcpToken(USER, SECRET), '')).toBeNull();
  });

  test('a token whose user id was swapped is refused', () => {
    const token = signMcpToken(USER, SECRET);
    const signature = token.slice(token.indexOf('.'));
    const forged = `${MCP_TOKEN_PREFIX}_${Buffer.from('someone-else', 'utf8').toString('base64url')}${signature}`;
    expect(verifyMcpToken(forged, SECRET)).toBeNull();
  });

  test('garbage is refused rather than thrown at', () => {
    for (const bad of ['', 'rmcp_', 'rmcp_abc', 'not-a-token', `${MCP_TOKEN_PREFIX}_.sig`]) {
      expect(verifyMcpToken(bad, SECRET)).toBeNull();
    }
  });

  test('the token is read from a Bearer header or from the path', () => {
    const token = signMcpToken(USER, SECRET);

    const bearer = new Headers({ authorization: `Bearer ${token}` });
    expect(tokenFromRequest(bearer, undefined)).toBe(token);

    // A claude.ai connector is only ever given a URL, so the path carries it.
    expect(tokenFromRequest(new Headers(), [token])).toBe(token);
    expect(tokenFromRequest(new Headers(), ['v1', token])).toBe(token);
    expect(tokenFromRequest(new Headers(), ['nothing-here'])).toBeNull();
  });
});

test.describe('mcp protocol', () => {
  test('initialize answers with the server identity and a version', async () => {
    const { execute } = spyExecutor();
    const res = result(
      await handleMessage(
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
        execute,
      ),
    );
    // A client that speaks an older version gets a server that speaks it too.
    expect(res.protocolVersion).toBe('2024-11-05');
    expect((res.serverInfo as { name: string }).name).toBe('ruta-content');
  });

  test('an unknown protocol version falls back to ours', () => {
    expect(negotiateVersion('1999-01-01')).toBe(MCP_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(MCP_PROTOCOL_VERSION);
  });

  test('tools/list offers every tool with a schema', async () => {
    const { execute } = spyExecutor();
    const res = result(await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, execute));
    const tools = res.tools as { name: string; inputSchema: unknown }[];
    expect(tools).toHaveLength(MCP_TOOLS.length);
    expect(tools.map((t) => t.name)).toContain('create_reel');
    for (const tool of tools) expect(tool.inputSchema).toBeTruthy();
  });

  test('a notification gets no answer at all', async () => {
    const { execute } = spyExecutor();
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, execute)).toBeNull();
  });

  test('an unknown method is a protocol error', async () => {
    const { execute } = spyExecutor();
    const res = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'nope' }, execute);
    expect((res as { error: { code: number } }).error.code).toBe(RPC_ERRORS.methodNotFound);
  });

  test('tools/call hands the executor parsed arguments', async () => {
    const { calls, execute } = spyExecutor();
    await handleMessage(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'create_story', arguments: { stories: ['перша', 'друга'] } },
      },
      execute,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      tool: 'create_story',
      args: { stories: [{ text: 'перша' }, { text: 'друга' }] },
    });
  });

  test('a bad argument comes back as a tool error, not a transport error', async () => {
    const { calls, execute } = spyExecutor();
    const res = result(
      await handleMessage(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'create_reel', arguments: { blocks: [], date: 'friday' } },
        },
        execute,
      ),
    );
    // The model has to be able to READ the complaint and try again.
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('a thrown executor is reported, not leaked as a crash', async () => {
    const execute = async () => {
      throw new Error('database on fire');
    };
    const res = result(
      await handleMessage(
        { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_content', arguments: {} } },
        execute,
      ),
    );
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('database on fire');
  });

  test('a batch from an older client answers only the requests in it', async () => {
    const { execute } = spyExecutor();
    const answer = await handleBody(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ],
      execute,
    );
    expect(Array.isArray(answer)).toBe(true);
    expect(answer as JsonRpcResponse[]).toHaveLength(2);
  });
});

test.describe('mcp tool arguments', () => {
  test('a reel accepts snake_case and camelCase alike', () => {
    const snake = parseToolCall('create_reel', {
      blocks: [{ kind: 'talk', spoken: 'привіт', screen_text: 'ХУК' }],
    });
    const camel = parseToolCall('create_reel', {
      blocks: [{ kind: 'talk', spoken: 'привіт', screenText: 'ХУК' }],
    });
    expect(snake.ok && camel.ok).toBe(true);
    if (!snake.ok || !camel.ok) return;
    expect(snake.call).toEqual(camel.call);
  });

  test('an unknown block kind falls back to talk rather than failing the call', () => {
    const parsed = parseToolCall('create_reel', { blocks: [{ kind: 'interpretive-dance', spoken: 'x' }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.call.tool !== 'create_reel') return;
    expect(parsed.call.args.blocks[0].kind).toBe('talk');
  });

  test('a reel of empty blocks is refused', () => {
    const parsed = parseToolCall('create_reel', { blocks: [{ kind: 'talk' }, { kind: 'text' }] });
    expect(parsed.ok).toBe(false);
  });

  test('impossible dates are refused', () => {
    expect(parseToolCall('create_story', { stories: ['x'], date: '2026-02-31' }).ok).toBe(false);
    expect(parseToolCall('create_story', { stories: ['x'], date: '24.08.2026' }).ok).toBe(false);
    expect(parseToolCall('create_story', { stories: ['x'], date: '2026-08-24' }).ok).toBe(true);
  });

  test('a status off the type track is refused with the reason', () => {
    // «Зняти» is a reel stage; a storytelling never gets filmed.
    const parsed = parseToolCall('create_story', { stories: ['x'], status: 'film' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('story');
  });

  test('list_content clamps a runaway limit and keeps a sane default', () => {
    const capped = parseToolCall('list_content', { limit: 5000 });
    const defaulted = parseToolCall('list_content', {});
    expect(capped.ok && defaulted.ok).toBe(true);
    if (!capped.ok || !defaulted.ok) return;
    if (capped.call.tool !== 'list_content' || defaulted.call.tool !== 'list_content') return;
    expect(capped.call.args.limit).toBe(200);
    expect(defaulted.call.args.limit).toBe(50);
  });

  test('unschedule is expressible: a null date is not a missing date', () => {
    const parsed = parseToolCall('schedule_content', { id: 'abc', date: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.call.tool !== 'schedule_content') return;
    expect(parsed.call.args.date).toBeNull();
  });

  test('an unknown tool is named in the error', () => {
    const parsed = parseToolCall('delete_everything', {});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('delete_everything');
  });
});
