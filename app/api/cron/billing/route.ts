import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabaseAdmin';
import { sendPaymentEmail } from '@/lib/paymentNotify';
import {
  changeRecurringAmount,
  chargeWithRecToken,
  daysFromNow,
  generateOrderRef,
  toDateDDMMYYYY,
} from '@/lib/wayforpay';

type CronJobResult = {
  userId: string;
  status: 'success' | 'failed';
  error?: string;
  reasonCode?: string | number;
};

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function notifyCronAlert(subject: string, text: string): Promise<void> {
  const to = process.env.CRON_ALERT_EMAIL?.trim();
  await sendPaymentEmail(to, subject, text);
}

function isChargeApproved(raw: Record<string, unknown>): boolean {
  return String(raw.transactionStatus ?? '').toLowerCase() === 'approved';
}

function isReasonCode4100(raw: Record<string, unknown>): boolean {
  const c = raw.reasonCode ?? raw.REASONCODE;
  return c === 4100 || c === '4100';
}

function oneDayFromNowIso(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function sixtyOneDaysFromNowIso(): string {
  return new Date(Date.now() + 61 * 24 * 60 * 60 * 1000).toISOString();
}

type SubscriptionRow = {
  id: string;
  user_id: string;
  phase: string;
  phase_ends_at: string | null;
  rec_token: string | null;
  client_email: string | null;
  client_phone: string | null;
  consecutive_failed_charges: number | null;
};

async function handleBillingCron(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const job1: CronJobResult[] = [];
  const job2: CronJobResult[] = [];

  const { data: claimed, error: claimErr } = await admin
    .from('subscriptions')
    .update({ phase_ends_at: null, updated_at: nowIso })
    .eq('phase', 'trial')
    .not('phase_ends_at', 'is', null)
    .lte('phase_ends_at', nowIso)
    .not('rec_token', 'is', null)
    .select();

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  for (const row of (claimed ?? []) as SubscriptionRow[]) {
    const sub = row;
    if (!sub.rec_token) {
      job1.push({ userId: sub.user_id, status: 'failed', error: 'missing_rec_token' });
      continue;
    }

    const orderRef = generateOrderRef('CHG', sub.user_id);
    const clientEmail = sub.client_email ?? 'billing@ruta.app';
    const clientPhone = (sub.client_phone ?? '380000000000').replace(/\D/g, '') || '380000000000';

    try {
      const { error: payErr } = await admin.from('payments').insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        order_reference: orderRef,
        amount: 5,
        transaction_status: 'pending',
        currency: 'USD',
        updated_at: nowIso,
      });

      if (payErr) {
        await admin
          .from('subscriptions')
          .update({ phase_ends_at: oneDayFromNowIso(), updated_at: nowIso })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.error('JOB1_FAILED userId=' + sub.user_id, payErr.message);
        job1.push({ userId: sub.user_id, status: 'failed', error: payErr.message });
        continue;
      }

      const { error: refErr } = await admin
        .from('subscriptions')
        .update({ recurring_order_ref: orderRef, updated_at: nowIso })
        .eq('id', sub.id);

      if (refErr) {
        await admin
          .from('subscriptions')
          .update({ phase_ends_at: oneDayFromNowIso(), updated_at: nowIso })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.error('JOB1_FAILED userId=' + sub.user_id, refErr.message);
        job1.push({ userId: sub.user_id, status: 'failed', error: refErr.message });
        continue;
      }

      const raw = (await chargeWithRecToken({
        orderReference: orderRef,
        amount: 5,
        recToken: sub.rec_token,
        productLabel: 'Ruta Pro — перший місяць зі знижкою',
        clientEmail,
        clientPhone,
        regularMode: 'monthly',
        dateNext: toDateDDMMYYYY(daysFromNow(30)),
        dateEnd: '01.01.2099',
      })) as Record<string, unknown>;

      if (isChargeApproved(raw)) {
        await admin
          .from('subscriptions')
          .update({
            phase: 'discounted',
            phase_ends_at: sixtyOneDaysFromNowIso(),
            current_amount: 5,
            wfp_recurring_status: 'Active',
            consecutive_failed_charges: 0,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log('JOB1_SUCCESS userId=' + sub.user_id);
        job1.push({ userId: sub.user_id, status: 'success' });
      } else {
        const prev = sub.consecutive_failed_charges ?? 0;
        const nextCount = prev + 1;
        const update: Record<string, unknown> = {
          phase_ends_at: oneDayFromNowIso(),
          consecutive_failed_charges: nextCount,
          updated_at: nowIso,
        };
        if (nextCount >= 3) {
          update.has_access = false;
        }
        await admin.from('subscriptions').update(update).eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log('JOB1_FAILED userId=' + sub.user_id);
        job1.push({
          userId: sub.user_id,
          status: 'failed',
          error: String(raw.transactionStatus ?? 'not_approved'),
        });
        if (nextCount >= 3) {
          await notifyCronAlert(
            'Ruta cron: JOB1 access revoked',
            `userId=${sub.user_id} consecutive_failed_charges=${nextCount}`,
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const prev = sub.consecutive_failed_charges ?? 0;
        const nextCount = prev + 1;
        const update: Record<string, unknown> = {
          phase_ends_at: oneDayFromNowIso(),
          consecutive_failed_charges: nextCount,
          updated_at: new Date().toISOString(),
        };
        if (nextCount >= 3) {
          update.has_access = false;
        }
        await admin.from('subscriptions').update(update).eq('id', sub.id);
        if (nextCount >= 3) {
          await notifyCronAlert(
            'Ruta cron: JOB1 access revoked',
            `userId=${sub.user_id} consecutive_failed_charges=${nextCount} error=${msg}`,
          );
        }
      } catch {
        // ignore secondary failure
      }
      // eslint-disable-next-line no-console
      console.log('JOB1_FAILED userId=' + sub.user_id);
      job1.push({ userId: sub.user_id, status: 'failed', error: msg });
    }
  }

  const { data: discountedRows, error: discErr } = await admin
    .from('subscriptions')
    .select('*')
    .eq('phase', 'discounted')
    .not('phase_ends_at', 'is', null)
    .lte('phase_ends_at', nowIso)
    .not('recurring_order_ref', 'is', null)
    .order('phase_ends_at', { ascending: true });

  if (discErr) {
    return NextResponse.json({ error: discErr.message }, { status: 500 });
  }

  for (const sub of discountedRows ?? []) {
    const ref = sub.recurring_order_ref as string | null;
    const userId = sub.user_id as string;
    if (!ref) {
      job2.push({ userId, status: 'failed', error: 'missing_recurring_order_ref' });
      continue;
    }

    try {
      const ch = (await changeRecurringAmount(ref, 10)) as Record<string, unknown>;

      if (isReasonCode4100(ch)) {
        await admin
          .from('subscriptions')
          .update({
            phase: 'full',
            current_amount: 10,
            phase_ends_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log('JOB2_SUCCESS userId=' + userId);
        job2.push({ userId, status: 'success' });
      } else {
        const rc = ch.reasonCode ?? ch.REASONCODE;
        // eslint-disable-next-line no-console
        console.log('JOB2_FAILED userId=' + userId);
        job2.push({ userId, status: 'failed', reasonCode: rc as string | number });
        await notifyCronAlert(
          'Ruta cron: JOB2 CHANGE failed',
          `userId=${userId} recurring_order_ref=${ref} reasonCode=${String(rc)}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.log('JOB2_FAILED userId=' + userId);
      job2.push({ userId, status: 'failed', error: msg });
      await notifyCronAlert(
        'Ruta cron: JOB2 CHANGE exception',
        `userId=${userId} recurring_order_ref=${ref} error=${msg}`,
      );
    }
  }

  return NextResponse.json({ ok: true, job1, job2 });
}

export const GET = handleBillingCron;
export const POST = handleBillingCron;
