import { NextResponse, type NextRequest } from 'next/server';

/**
 * Support / report-a-problem submission (task 86d35yft6).
 *
 * Server-side ONLY so the ClickUp token is never exposed to the client. Creates
 * a task in the "Feature requests" list with the user's description + metadata,
 * then uploads any screenshots as attachments.
 *
 * Auth: reads `CLICKUP_API_TOKEN` from the environment (set it in the Vercel
 * project env for production). The list id defaults to the Feature requests list
 * and can be overridden with `CLICKUP_FEATURE_REQUESTS_LIST_ID`.
 */
const CLICKUP_API = 'https://api.clickup.com/api/v2';
const FEATURE_REQUESTS_LIST_ID =
  process.env.CLICKUP_FEATURE_REQUESTS_LIST_ID ?? '901612970220';

export async function POST(req: NextRequest) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    // Build path is wired against the expected env var; surface a clear, neutral
    // error if the credential isn't configured yet (flagged for Kunj).
    return NextResponse.json(
      { error: 'support_unconfigured', message: 'CLICKUP_API_TOKEN is not configured.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const description = String(form.get('description') ?? '').trim();
  if (!description) {
    return NextResponse.json({ error: 'empty_description' }, { status: 400 });
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(form.get('metadata') ?? '{}')) as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const m = (k: string) => (meta[k] == null || meta[k] === '' ? '—' : String(meta[k]));

  const files = form.getAll('screenshots').filter((f): f is File => f instanceof File);

  const who = m('email') !== '—' ? m('email') : m('handle') !== '—' ? m('handle') : m('userId');
  const title = `User report — ${who}`;
  const body = [
    description,
    '',
    '---',
    `**User ID:** ${m('userId')}`,
    `**Email:** ${m('email')}`,
    `**Instagram:** ${m('handle')}`,
    `**Route:** ${m('route')}`,
    `**App version:** ${m('appVersion')}`,
    `**User agent:** ${m('userAgent')}`,
    `**Timestamp:** ${m('timestamp') !== '—' ? m('timestamp') : new Date().toISOString()}`,
    `**Screenshots:** ${files.length}`,
  ].join('\n');

  let taskId: string;
  try {
    const createRes = await fetch(`${CLICKUP_API}/list/${FEATURE_REQUESTS_LIST_ID}/task`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: title, markdown_content: body }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text();
      return NextResponse.json({ error: 'clickup_create_failed', detail }, { status: 502 });
    }
    const task = (await createRes.json()) as { id: string };
    taskId = task.id;
  } catch (e) {
    return NextResponse.json(
      { error: 'clickup_create_failed', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }

  // Attachments are best-effort: the report is already captured even if an
  // upload fails, so we never fail the whole submission on an attachment error.
  let uploaded = 0;
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('attachment', file, file.name || 'screenshot.png');
      const aRes = await fetch(`${CLICKUP_API}/task/${taskId}/attachment`, {
        method: 'POST',
        headers: { Authorization: token },
        body: fd,
      });
      if (aRes.ok) uploaded += 1;
    } catch {
      /* ignore individual attachment failures */
    }
  }

  return NextResponse.json({ ok: true, taskId, screenshots: files.length, uploaded });
}
