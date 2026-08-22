import { NextResponse } from 'next/server';
import { optionalServerEnv } from '@/lib/env';
import { createExecutor } from '@/lib/mcp/execute';
import { handleBody, MCP_PROTOCOL_VERSION, MCP_SERVER_INFO, RPC_ERRORS } from '@/lib/mcp/protocol';
import { MCP_TOOLS } from '@/lib/mcp/tools';
import { tokenFromRequest, verifyMcpToken } from '@/lib/mcp/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The app's MCP server — one endpoint, spoken to by Claude.
 *
 * Streamable HTTP, stateless: the client POSTs JSON-RPC and gets JSON back.
 * There is no SSE stream and no session id, because every tool here answers in
 * one round trip and a session would only be state two serverless invocations
 * could disagree about.
 *
 * The token can arrive two ways (see `tokenFromRequest`) — a Bearer header for
 * Claude Code, or in the path for a claude.ai connector, which is only ever
 * given a URL. Both name one user; nothing below runs without one.
 *
 * Hosted by the app itself on purpose: no second service, no second bill.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Ruta-Mcp-Token',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
} as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store', 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION },
  });
}

/**
 * The user this request speaks for, or a response saying why there isn't one.
 *
 * A missing `MCP_TOKEN_SECRET` fails CLOSED and says so plainly: the deploy is
 * misconfigured, and the person reading this is the person who can fix it.
 */
function authenticate(
  request: Request,
  path: string[] | undefined,
): { userId: string } | { error: NextResponse } {
  const secret = optionalServerEnv('MCP_TOKEN_SECRET');
  if (!secret) {
    return {
      error: json(
        { error: 'mcp_not_configured', message: 'MCP_TOKEN_SECRET is not set on this deployment.' },
        503,
      ),
    };
  }

  const userId = verifyMcpToken(tokenFromRequest(request.headers, path), secret);
  if (!userId) {
    return {
      error: json(
        { error: 'unauthorized', message: 'Missing or invalid MCP token.' },
        401,
      ),
    };
  }
  return { userId };
}

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { path } = await params;
  const auth = authenticate(request, path);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { jsonrpc: '2.0', id: null, error: { code: RPC_ERRORS.parse, message: 'invalid JSON' } },
      400,
    );
  }

  let execute: ReturnType<typeof createExecutor>;
  try {
    execute = createExecutor(auth.userId);
  } catch (error) {
    // The service-role key is what lets a tokened request read its owner's rows;
    // without it the server is a shell, and saying so beats every tool failing.
    console.error('[mcp] executor unavailable:', error instanceof Error ? error.message : error);
    return json(
      { error: 'mcp_not_configured', message: 'SUPABASE_SERVICE_ROLE_KEY is not set on this deployment.' },
      503,
    );
  }

  const answer = await handleBody(body, execute);
  // A body of nothing but notifications gets no content, per JSON-RPC.
  if (answer === null) return new NextResponse(null, { status: 202, headers: CORS });
  return json(answer);
}

/**
 * GET is the transport's server→client SSE stream, which this server does not
 * offer — 405 is the specified answer. A plain browser visit instead gets a
 * short "yes, this is the server" page, which is what someone pasting the URL
 * into an address bar is actually asking.
 */
export async function GET(request: Request, { params }: RouteContext) {
  if ((request.headers.get('accept') ?? '').includes('text/event-stream')) {
    return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: 'POST, DELETE' } });
  }

  const { path } = await params;
  const auth = authenticate(request, path);
  if ('error' in auth) return auth.error;

  return json({
    ok: true,
    server: MCP_SERVER_INFO,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: 'streamable-http',
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

/** Session teardown. There are no sessions, so there is nothing to tear down. */
export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
