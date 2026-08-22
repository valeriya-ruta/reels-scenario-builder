import crypto from 'node:crypto';

/**
 * The credential an MCP client carries — a signed name-tag, not a stored key.
 *
 * The app has no table of API keys and does not need one: a token is the user's
 * id plus an HMAC of it, keyed by a server secret. That means zero migrations,
 * zero storage, and nothing to leak from the database — verifying a token is
 * recomputing the signature, so a forged one cannot be made without the secret.
 *
 * The trade is that a token is stable per user rather than individually
 * revocable: rotating `MCP_TOKEN_SECRET` invalidates every token at once (see
 * README). For a personal connector, that is the right shape — the alternative
 * is a key table whose only reader is this one file.
 *
 * The secret is passed IN rather than read from the environment here, so the
 * signing rules can be tested without an app or an env var.
 */

/** Prefix so a token is recognisable in a config file / support screenshot. */
export const MCP_TOKEN_PREFIX = 'rmcp';

const VERSION = 'v1';

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function signature(userId: string, secret: string): string {
  return b64url(
    crypto.createHmac('sha256', `${secret}|ruta-mcp-${VERSION}`).update(userId).digest(),
  );
}

/** The token for a user. Deterministic: the same user + secret always match. */
export function signMcpToken(userId: string, secret: string): string {
  const id = (userId ?? '').trim();
  if (!id) throw new Error('signMcpToken: empty user id');
  if (!secret) throw new Error('signMcpToken: empty secret');
  return `${MCP_TOKEN_PREFIX}_${b64url(Buffer.from(id, 'utf8'))}.${signature(id, secret)}`;
}

/**
 * The user a token names, or null.
 *
 * Null covers every failure the same way — malformed, wrong secret, unset
 * secret — because an MCP client has no business learning WHICH of those it
 * hit. With no secret configured the door is shut rather than open: a missing
 * env var must never mean "let everyone in".
 */
export function verifyMcpToken(token: string | null | undefined, secret: string | null): string | null {
  if (!token || !secret) return null;

  const raw = token.trim();
  if (!raw.startsWith(`${MCP_TOKEN_PREFIX}_`)) return null;

  const body = raw.slice(MCP_TOKEN_PREFIX.length + 1);
  const dot = body.indexOf('.');
  if (dot <= 0) return null;

  const encodedId = body.slice(0, dot);
  const provided = body.slice(dot + 1);
  if (!provided) return null;

  let userId: string;
  try {
    userId = Buffer.from(encodedId, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  // A round trip proves the id survived base64url intact — without it, two
  // different encodings of one id would both verify.
  if (!userId || b64url(Buffer.from(userId, 'utf8')) !== encodedId) return null;

  const expected = signature(userId, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? userId : null;
}

/**
 * The token on a request, wherever the client managed to put it.
 *
 * Two placements, because the two clients differ: Claude Code sends headers
 * (`Authorization: Bearer …`), while a claude.ai custom connector is only ever
 * given a URL — so the token can also ride in the path (`/api/mcp/<token>`).
 * Both are the same secret, in the same role; the URL form is what makes the
 * connector work from a phone at all.
 */
export function tokenFromRequest(
  headers: { get(name: string): string | null },
  pathSegments: readonly string[] | undefined,
): string | null {
  const auth = headers.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }

  const header = headers.get('x-ruta-mcp-token');
  if (header?.trim()) return header.trim();

  const fromPath = (pathSegments ?? []).find((s) => s.startsWith(`${MCP_TOKEN_PREFIX}_`));
  return fromPath ?? null;
}
