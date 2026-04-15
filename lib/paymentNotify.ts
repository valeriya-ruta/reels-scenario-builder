import 'server-only';

export async function sendPaymentEmail(
  to: string | null | undefined,
  subject: string,
  text: string,
): Promise<void> {
  const addr = to?.trim();
  if (!addr) {
    // eslint-disable-next-line no-console
    console.warn('[payment email skipped: no address]', subject);
    return;
  }
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    // eslint-disable-next-line no-console
    console.log('[payment email]', { to: addr, subject, text });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [addr], subject, text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    // eslint-disable-next-line no-console
    console.error('[Resend]', res.status, errText);
  }
}
